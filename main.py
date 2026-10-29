from typing import List, Optional
import os
import re
import requests
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from slowapi.errors import RateLimitExceeded
from slowapi import _rate_limit_exceeded_handler

import models
import schemas
from database import SessionLocal
from security import get_password_hash
from dependencies import get_db, get_current_user, RoleChecker, limiter
from routers import auth, catalogos, operaciones, finanzas

app = FastAPI(title="API de Importaciones y Pagos")

# Configuración Global de Rate Limiting (SlowAPI)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

cors_env = os.getenv("CORS_ORIGINS")
origins = [o.strip() for o in cors_env.split(",") if o.strip()] if cors_env else ["http://localhost:5173", "http://127.0.0.1:5173"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Inclusión de Routers Modulares (Arquitectura Limpia / Strangler Fig)
app.include_router(auth.router)
app.include_router(catalogos.router)
app.include_router(operaciones.router)
app.include_router(finanzas.router)

@app.get("/")
def ruta_principal():
    return {"mensaje": "¡Servidor de Importaciones funcionando al 100%!"}

# --- USUARIOS (Blindado: Solo SuperAdmin Rol 1) ---
@app.post("/usuarios/", response_model=schemas.Usuario)
def crear_usuario(
    usuario: schemas.UsuarioCreate, 
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(RoleChecker([1]))
):
    if db.query(models.Usuario).filter(models.Usuario.username == usuario.username).first():
        raise HTTPException(status_code=400, detail="El username ya está registrado")
    hashed_password = get_password_hash(usuario.password)
    nuevo_usuario = models.Usuario(
        id_rol=usuario.id_rol, username=usuario.username, email=usuario.email,
        is_active=usuario.is_active, hashed_password=hashed_password
    )
    db.add(nuevo_usuario)
    db.commit()
    db.refresh(nuevo_usuario)
    return nuevo_usuario

# --- INTEGRACIONES EXTERNAS (SUNAT) ---
def acortar_razon_social(texto: str) -> str:
    """Normaliza y compacta razones sociales largas oficiales de SUNAT."""
    if not texto:
        return ""
    nombre = texto.strip().upper()
    if " - " in nombre:
        partes = [p.strip() for p in nombre.split(" - ") if p.strip()]
        if len(partes) >= 2:
            p1, p2 = partes[0], partes[-1]
            if len(p2) <= len(p1) and len(p2) >= 2:
                nombre = p2

    reemplazos = [
        (r'\bSOCIEDAD\s+ANONIMA\s+CERRADA\b', 'S.A.C.'),
        (r'\bSOCIEDAD\s+COMERCIAL\s+DE\s+RESPONSABILIDAD\s+LIMITADA\b', 'S.R.L.'),
        (r'\bEMPRESA\s+INDIVIDUAL\s+DE\s+RESPONSABILIDAD\s+LIMITADA\b', 'E.I.R.L.'),
        (r'\bSOCIEDAD\s+ANONIMA\s+ABIERTA\b', 'S.A.A.'),
        (r'\bSOCIEDAD\s+ANONIMA\b', 'S.A.'),
        (r'\bS\s*\.?\s*A\s*\.?\s*C\s*\.?\b', 'S.A.C.'),
        (r'\bS\s*\.?\s*R\s*\.?\s*L\s*\.?\b', 'S.R.L.'),
        (r'\bE\s*\.?\s*I\s*\.?\s*R\s*\.?\s*L\s*\.?\b', 'E.I.R.L.'),
        (r'\bS\s*\.?\s*A\s*\.?\s*A\s*\.?\b', 'S.A.A.'),
        (r'\bS\s*\.?\s*A\s*\.?(?!\w)', 'S.A.'),
    ]
    for patron, sigla in reemplazos:
        nombre = re.sub(patron, sigla, nombre, flags=re.IGNORECASE)

    nombre = re.sub(r'[\'\"\`]', '', nombre)
    nombre = re.sub(r'\s+O\s+(?=S\.)', ' ', nombre)
    nombre = re.sub(r'\s+', ' ', nombre).strip()
    nombre = re.sub(r'\.{2,}', '.', nombre)
    return nombre

@app.get("/sunat/ruc/{ruc}", tags=["Integraciones"])
def consultar_ruc_sunat(ruc: str):
    if len(ruc) != 11 or not ruc.isdigit():
        raise HTTPException(status_code=400, detail="El RUC debe tener 11 dígitos numéricos.")
        
    token = os.getenv("SUNAT_API_TOKEN")
    if not token:
        raise HTTPException(status_code=500, detail="Token de SUNAT (ApiPeru) no configurado en el servidor.")

    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    try:
        response = requests.get(f"https://apiperu.dev/api/ruc/{ruc}", headers=headers, timeout=5)
        if response.status_code == 200:
            res_json = response.json()
            if not res_json.get("success"):
                raise HTTPException(status_code=404, detail="RUC no encontrado en SUNAT.")
            data = res_json.get("data", {})
            estado, condicion = data.get("estado"), data.get("condicion")
            if estado != "ACTIVO":
                raise HTTPException(status_code=400, detail=f"El RUC está {estado}. No se puede operar.")
            if condicion != "HABIDO":
                raise HTTPException(status_code=400, detail=f"El RUC tiene condición {condicion}.")
            
            razon_social = data.get("nombre_o_razon_social") or ""
            return {
                "razon_social": razon_social,
                "nombre_sugerido": acortar_razon_social(razon_social),
                "estado": estado,
                "condicion": condicion
            }
        else:
            raise HTTPException(status_code=response.status_code, detail="Error al consultar SUNAT a través de ApiPeru.")
    except requests.exceptions.RequestException:
        raise HTTPException(status_code=503, detail="El servicio de consulta no está disponible temporalmente.")

# --- ENDPOINTS DE CONSULTA DE AUDITORÍA (HISTÓRICO Y TABLAS SOMBRA) ---
@app.get("/auditoria/", response_model=List[schemas.AuditLog], tags=["Auditoria"])
def listar_auditoria(db: Session = Depends(get_db), current_user: models.Usuario = Depends(RoleChecker([1, 4]))):
    return db.query(models.AuditLog).order_by(models.AuditLog.created_at.desc()).limit(100).all()
@app.get("/auditoria/maestros/", response_model=List[schemas.MaestroEliminadoResponse], tags=["Auditoria"])
def listar_auditoria_maestros(db: Session = Depends(get_db), current_user: models.Usuario = Depends(RoleChecker([1, 4]))):
    return db.query(models.MaestroEliminado).order_by(models.MaestroEliminado.fecha_eliminacion.desc()).all()
@app.get("/auditoria/dams/", response_model=List[schemas.DamEliminadaResponse], tags=["Auditoria"])
def listar_auditoria_dams(db: Session = Depends(get_db), current_user: models.Usuario = Depends(RoleChecker([1, 4]))):
    return db.query(models.DamEliminada).order_by(models.DamEliminada.fecha_eliminacion.desc()).all()
@app.get("/auditoria/gastos/", response_model=List[schemas.GastoEliminadoResponse], tags=["Auditoria"])
def listar_auditoria_gastos(db: Session = Depends(get_db), current_user: models.Usuario = Depends(RoleChecker([1, 4]))):
    return db.query(models.GastoEliminado).order_by(models.GastoEliminado.fecha_eliminacion.desc()).all()
@app.get("/auditoria/pagos/", response_model=List[schemas.PagoEliminadoResponse], tags=["Auditoria"])
def listar_auditoria_pagos(db: Session = Depends(get_db), current_user: models.Usuario = Depends(RoleChecker([1, 4]))):
    return db.query(models.PagoEliminado).order_by(models.PagoEliminado.fecha_eliminacion.desc()).all()
@app.get("/auditoria/vouchers/", response_model=List[schemas.VoucherEliminadoResponse], tags=["Auditoria"])
def listar_auditoria_vouchers(db: Session = Depends(get_db), current_user: models.Usuario = Depends(RoleChecker([1, 4]))):
    return db.query(models.VoucherEliminado).order_by(models.VoucherEliminado.fecha_eliminacion.desc()).all()
