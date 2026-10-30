from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
from typing import Optional

import models
from security import verify_password, create_access_token, get_password_hash
from dependencies import get_db, limiter

router = APIRouter(tags=["Auth"])

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
    username: str
    password: str
    email: str
    nombre_empresa: Optional[str] = "Mi Empresa"


# --- ENDPOINT DE INICIALIZACIÓN (solo funciona si la BD está vacía) ---
@router.post("/setup/init", tags=["Setup"])
def inicializar_sistema(payload: SetupInicialRequest, db: Session = Depends(get_db)):
    """
    Endpoint público que crea el usuario SuperAdmin y los roles base.
    Se AUTOBLOQUEA en cuanto existe al menos 1 usuario en la BD.
    No requiere autenticación.
    """
    # VERIFICACIÓN DE SEGURIDAD: Si ya hay usuarios, este endpoint está cerrado
    if db.query(models.Usuario).first():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="El sistema ya está inicializado. Este endpoint está deshabilitado."
        )

    try:
        # 1. Crear los 4 roles del sistema
        roles = [
            models.CatRol(id_rol=1, nombre="SuperAdmin",  descripcion="Acceso total. Gestion de usuarios y configuracion."),
            models.CatRol(id_rol=2, nombre="Operaciones", descripcion="Gestion de maestros, DAMs y gastos logisticos."),
            models.CatRol(id_rol=3, nombre="Finanzas",    descripcion="Gestion de pagos, vouchers y reportes financieros."),
            models.CatRol(id_rol=4, nombre="Auditor",     descripcion="Solo lectura. Acceso a logs y reportes."),
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
        raise HTTPException(status_code=500, detail=f"Error durante la inicializacion: {str(e)}")


@router.post("/login")
@limiter.limit("5/minute")
def login(request: Request, form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    # 1. Buscar al usuario por username
    user = db.query(models.Usuario).filter(models.Usuario.username == form_data.username).first()
    
    # 2. Verificar existencia y contraseña
    if not user or not verify_password(form_data.password, user.hashed_password):
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
    
    return {"access_token": access_token, "token_type": "bearer"}
