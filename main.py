from typing import List, Optional
import os
import requests
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

import models
import schemas
from database import SessionLocal
from security import get_password_hash
from dependencies import get_db, get_current_user, RoleChecker
from routers import auth, catalogos, operaciones, finanzas

app = FastAPI(title="API de Importaciones y Pagos")

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

# --- USUARIOS ---
@app.post("/usuarios/", response_model=schemas.Usuario)
def crear_usuario(usuario: schemas.UsuarioCreate, db: Session = Depends(get_db)):
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
            return {"razon_social": data.get("nombre_o_razon_social"), "estado": estado, "condicion": condicion}
        else:
            raise HTTPException(status_code=response.status_code, detail="Error al consultar SUNAT a través de ApiPeru.")
    except requests.exceptions.RequestException:
        raise HTTPException(status_code=503, detail="El servicio de consulta no está disponible temporalmente.")

# --- ENDPOINTS DE CONSULTA DE AUDITORÍA (HISTÓRICO Y TABLAS SOMBRA) ---
@app.get("/auditoria/", response_model=List[schemas.AuditLog], tags=["Auditoria"])
def listar_auditoria(db: Session = Depends(get_db), current_user: models.Usuario = Depends(RoleChecker([1, 4]))):
    return db.query(models.AuditLog).order_by(models.AuditLog.created_at.desc()).limit(100).all()
@app.get("/auditoria/maestros/", response_model=List[schemas.MaestroEliminadoResponse], tags=["Auditoria"])
def listar_auditoria_maestros(db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_user)):
    return db.query(models.MaestroEliminado).order_by(models.MaestroEliminado.fecha_eliminacion.desc()).all()
@app.get("/auditoria/dams/", response_model=List[schemas.DamEliminadaResponse], tags=["Auditoria"])
def listar_auditoria_dams(db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_user)):
    return db.query(models.DamEliminada).order_by(models.DamEliminada.fecha_eliminacion.desc()).all()
@app.get("/auditoria/gastos/", response_model=List[schemas.GastoEliminadoResponse], tags=["Auditoria"])
def listar_auditoria_gastos(db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_user)):
    return db.query(models.GastoEliminado).order_by(models.GastoEliminado.fecha_eliminacion.desc()).all()
@app.get("/auditoria/pagos/", response_model=List[schemas.PagoEliminadoResponse], tags=["Auditoria"])
def listar_auditoria_pagos(db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_user)):
    return db.query(models.PagoEliminado).order_by(models.PagoEliminado.fecha_eliminacion.desc()).all()
