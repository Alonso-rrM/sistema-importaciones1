from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from sqlalchemy import text
from pydantic import BaseModel
from typing import Optional
import secrets

import models
from schemas import Username, PasswordSegura, Email
from services.errores import error_interno
from fastapi.responses import JSONResponse
from security import verify_password, create_access_token, get_password_hash, COOKIE_SESION, COOKIE_SECURE, ACCESS_TOKEN_EXPIRE_MINUTES
from dependencies import get_db, limiter, get_current_user

router = APIRouter(tags=["Auth"])

# Identificador arbitrario del bloqueo consultivo de PostgreSQL para /setup/init
LOCK_SETUP_INIT = 7_310_001

# Hash bcrypt de una clave aleatoria descartable: se usa para igualar tiempos cuando el usuario no existe
HASH_SENUELO = get_password_hash(secrets.token_urlsafe(32))

# --- ENDPOINT DE VERIFICACIÓN DEL ESTADO DEL SISTEMA ---
@router.get("/setup/status", tags=["Setup"])
def verificar_estado_setup(db: Session = Depends(get_db)):
    """
    Endpoint público. Devuelve si el sistema ya fue inicializado.
    El frontend lo consulta al cargar para decidir si mostrar
    la pantalla de Login o la pantalla de Configuración Inicial.
    """
    tiene_usuarios = db.query(models.Usuario).first() is not None
    return {"inicializado": tiene_usuarios}


# --- ESQUEMA PARA LA SOLICITUD DE SETUP ---
class SetupInicialRequest(BaseModel):
    username: Username
    password: PasswordSegura
    email: Email
    nombre_empresa: Optional[str] = "Mi Empresa"


# --- ENDPOINT DE INICIALIZACIÓN (solo funciona si la BD está vacía) ---
@router.post("/setup/init", tags=["Setup"])
def inicializar_sistema(payload: SetupInicialRequest, db: Session = Depends(get_db)):
    """
    Endpoint público que crea el usuario SuperAdmin y los roles base.
    Se AUTOBLOQUEA en cuanto existe al menos 1 usuario en la BD.
    No requiere autenticación.
    """
    # Exclusión mutua: si llegan dos inicializaciones al mismo tiempo, la segunda espera a que la primera
    # termine y entonces ve que ya hay usuarios (evita crear dos SuperAdmin por condición de carrera).
    # El bloqueo consultivo se libera solo al terminar la transacción.
    if db.get_bind().dialect.name == "postgresql":
        db.execute(text("SELECT pg_advisory_xact_lock(:clave)"), {"clave": LOCK_SETUP_INIT})

    # VERIFICACIÓN DE SEGURIDAD: Si ya hay usuarios, este endpoint está cerrado
    if db.query(models.Usuario).first():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="El sistema ya está inicializado. Este endpoint está deshabilitado."
        )

    try:
        # 1. Crear los 4 roles del sistema
        roles = [
            models.CatRol(id_rol=1, nombre="Administrador", descripcion="Acceso total. Gestión de usuarios y configuración."),
            models.CatRol(id_rol=2, nombre="Logistica",     descripcion="Gestión de maestros, DAMs y gastos logísticos."),
            models.CatRol(id_rol=3, nombre="Tesoreria",     descripcion="Gestión de pagos, vouchers y reportes financieros."),
            models.CatRol(id_rol=4, nombre="Auditor",       descripcion="Solo lectura. Acceso a logs y reportes."),
        ]
        for rol in roles:
            if not db.query(models.CatRol).filter(models.CatRol.id_rol == rol.id_rol).first():
                db.add(rol)
        db.flush()

        # 2. Crear el usuario SuperAdmin
        admin = models.Usuario(
            id_rol=1,
            username=payload.username.strip(),
            email=payload.email.strip(),
            hashed_password=get_password_hash(payload.password),
            is_active=True
        )
        db.add(admin)
        db.commit()

        return {
            "ok": True,
            "mensaje": f"Sistema inicializado correctamente. Usuario '{payload.username}' creado como SuperAdmin."
        }

    except Exception as e:
        db.rollback()
        raise error_interno("Error durante la inicializacion", e, 500)


@router.post("/login")
@limiter.limit("5/minute")
def login(request: Request, form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    # 1. Buscar al usuario por username
    user = db.query(models.Usuario).filter(models.Usuario.username == form_data.username).first()

    # 2. Verificar existencia y contraseña.
    # Si el usuario no existe se verifica igual contra un hash señuelo: así el tiempo de respuesta
    # es el mismo y no se puede averiguar qué usuarios existen midiendo la latencia.
    hash_a_verificar = user.hashed_password if user else HASH_SENUELO
    password_ok = verify_password(form_data.password, hash_a_verificar)
    if not user or not password_ok:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Username o contraseña incorrectos",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    # 3. Verificar si está activo
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario inactivo")
        
    # 4. Crear Payload y generar Access Token
    access_token = create_access_token(
        data={"sub": user.username, "id_rol": user.id_rol, "id_usuario": user.id_usuario}
    )

    # Modo script/API (ej. inversor_masivo.py): el token se entrega en el cuerpo para usarlo como Bearer.
    if request.headers.get("X-Auth-Mode", "").lower() == "bearer":
        return {"access_token": access_token, "token_type": "bearer"}

    # Modo navegador: el token va SOLO en una cookie httpOnly (JavaScript no puede leerla).
    # El cuerpo devuelve únicamente datos de presentación del usuario (sin secretos).
    respuesta = JSONResponse({"token_type": "cookie", "usuario": datos_publicos_usuario(user)})
    respuesta.set_cookie(
        key=COOKIE_SESION,
        value=access_token,
        max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite="strict",
        path="/",
    )
    return respuesta


def datos_publicos_usuario(user: models.Usuario) -> dict:
    return {"id_usuario": user.id_usuario, "username": user.username, "email": user.email, "id_rol": user.id_rol}


@router.get("/me")
def usuario_actual(current_user: models.Usuario = Depends(get_current_user)):
    """Valida la sesión vigente y devuelve los datos de presentación del usuario."""
    return datos_publicos_usuario(current_user)


@router.post("/logout")
def logout():
    """Cierra la sesión del navegador eliminando la cookie httpOnly."""
    respuesta = JSONResponse({"ok": True})
    respuesta.delete_cookie(COOKIE_SESION, path="/", httponly=True, secure=COOKIE_SECURE, samesite="strict")
    return respuesta
