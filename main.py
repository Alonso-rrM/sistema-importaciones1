from typing import List, Optional
import os
import re
import requests
from datetime import date, datetime, time
from fastapi import FastAPI, Depends, HTTPException, status, Request, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session, joinedload
from slowapi.errors import RateLimitExceeded
from slowapi import _rate_limit_exceeded_handler

import models
import schemas
from database import SessionLocal
from fastapi.responses import JSONResponse
from security import get_password_hash, COOKIE_SESION, CSRF_HEADER
from dependencies import get_db, get_current_user, RoleChecker, limiter
from routers import auth, catalogos, operaciones, finanzas, reportes

# La documentación interactiva (/docs, /redoc, /openapi.json) expone el mapa completo de la API.
# Desactivada por defecto; para desarrollo, definir ENABLE_DOCS=true en el .env
_docs_habilitados = os.getenv("ENABLE_DOCS", "false").strip().lower() == "true"
app = FastAPI(
    title="API de Importaciones y Pagos",
    docs_url="/docs" if _docs_habilitados else None,
    redoc_url="/redoc" if _docs_habilitados else None,
    openapi_url="/openapi.json" if _docs_habilitados else None,
)

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

_METODOS_SEGUROS = {"GET", "HEAD", "OPTIONS"}


@app.middleware("http")
async def proteccion_csrf(request: Request, call_next):
    """
    Con sesión por cookie, el navegador adjunta la cookie automáticamente. Para que otro sitio no pueda
    disparar escrituras en nombre de la usuaria (CSRF), toda operación de escritura autenticada por
    cookie debe traer el header X-Requested-With, que un sitio ajeno no puede enviar sin pasar CORS.
    (Complementa SameSite=Strict de la cookie.)
    """
    if (
        request.method not in _METODOS_SEGUROS
        and COOKIE_SESION in request.cookies
        and not request.headers.get("authorization")
        and not request.headers.get(CSRF_HEADER)
    ):
        return JSONResponse(status_code=403, content={"detail": "Solicitud rechazada por protección CSRF."})
    return await call_next(request)


# Inclusión de Routers Modulares (Arquitectura Limpia / Strangler Fig)
app.include_router(auth.router)
app.include_router(catalogos.router)
app.include_router(operaciones.router)
app.include_router(finanzas.router)
app.include_router(reportes.router)

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
@limiter.limit("30/minute")  # Protege la cuota del token de ApiPeru
def consultar_ruc_sunat(request: Request, ruc: str, current_user: models.Usuario = Depends(get_current_user)):
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
def listar_auditoria(
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    accion: Optional[str] = Query(None, max_length=100, description="Texto contenido en la acción, ej. 'MODIFICACION Pago'"),
    tabla: Optional[str] = Query(None, max_length=60, description="Tabla afectada, ej. 'registro_pagos'"),
    id_registro: Optional[int] = Query(None, description="ID del registro afectado (requiere 'tabla')"),
    id_usuario: Optional[int] = None,
    fecha_desde: Optional[date] = None,
    fecha_hasta: Optional[date] = None,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(RoleChecker([1, 4]))
):
    """Bitácora de eventos con filtros. Permite reconstruir la historia completa de un registro."""
    q = db.query(models.AuditLog)
    if accion:
        q = q.filter(models.AuditLog.accion.ilike(f"%{accion.strip()}%"))
    if tabla:
        if not re.fullmatch(r"[a-z_]{1,60}", tabla):
            raise HTTPException(status_code=400, detail="Nombre de tabla inválido.")
        q = q.filter(models.AuditLog.detalles.like(f'%"tabla": "{tabla}"%'))
        if id_registro is not None:
            q = q.filter(models.AuditLog.detalles.like(f'%"tabla": "{tabla}", "id": {id_registro},%'))
    if id_usuario is not None:
        q = q.filter(models.AuditLog.id_usuario == id_usuario)
    if fecha_desde:
        q = q.filter(models.AuditLog.created_at >= datetime.combine(fecha_desde, time.min))
    if fecha_hasta:
        q = q.filter(models.AuditLog.created_at <= datetime.combine(fecha_hasta, time.max))
    filas = (
        q.options(joinedload(models.AuditLog.usuario))
        .order_by(models.AuditLog.created_at.desc(), models.AuditLog.id_log.desc())
        .offset(offset).limit(limit).all()
    )
    return [
        {**schemas.AuditLog.model_validate(f).model_dump(exclude={"nombre_usuario"}),
         "nombre_usuario": f.usuario.username if f.usuario else None}
        for f in filas
    ]
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
