"""Gestión de cuentas de usuario (solo SuperAdmin)."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import models
import schemas
from constantes import ROLES_SOLO_ADMIN
from dependencies import get_db, RoleChecker
from security import get_password_hash

router = APIRouter()


@router.post("/usuarios/", response_model=schemas.Usuario)
def crear_usuario(
    usuario: schemas.UsuarioCreate, 
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(RoleChecker(ROLES_SOLO_ADMIN))
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
