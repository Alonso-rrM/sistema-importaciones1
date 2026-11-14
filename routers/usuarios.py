"""
Gestión de cuentas de usuario.

El Administrador crea, lista y modifica cuentas (rol, correo, activo) y restablece contraseñas.
Cualquier usuario puede cambiar su propia contraseña. Toda modificación queda en la bitácora
automática (services/audit_trail.py, que nunca muestra la contraseña).

Un cambio de contraseña cierra las sesiones abiertas con la anterior (ver dependencies.get_current_user).
"""
import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

import models
import schemas
from constantes import ROLES_SOLO_ADMIN, Rol
from dependencies import RoleChecker, get_current_user, get_db, limiter
from domain.usuarios import motivo_para_rechazar_cambio
from security import get_password_hash, verify_password

router = APIRouter(tags=["Usuarios"])
solo_admin = RoleChecker(ROLES_SOLO_ADMIN)


def _listado(usuario: models.Usuario) -> schemas.UsuarioListado:
    datos = schemas.UsuarioListado.model_validate(usuario)
    datos.rol_nombre = usuario.rol.nombre if usuario.rol else None
    return datos


def _buscar(db: Session, id_usuario: int) -> models.Usuario:
    usuario = db.get(models.Usuario, id_usuario)
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")
    return usuario


def _rechazar_correo_repetido(db: Session, email: str, excepto_id: int | None = None) -> None:
    consulta = db.query(models.Usuario.id_usuario).filter(func.lower(models.Usuario.email) == email.lower())
    if excepto_id is not None:
        consulta = consulta.filter(models.Usuario.id_usuario != excepto_id)
    if consulta.first():
        raise HTTPException(status_code=400, detail=f"El correo {email} ya está registrado en otra cuenta.")


def _asignar_clave(usuario: models.Usuario, clave: str) -> None:
    usuario.hashed_password = get_password_hash(clave)
    usuario.clave_cambiada_en = datetime.datetime.utcnow()


@router.get("/usuarios/", response_model=List[schemas.UsuarioListado])
def listar_usuarios(db: Session = Depends(get_db), current_user: models.Usuario = Depends(solo_admin)):
    usuarios = db.query(models.Usuario).options(joinedload(models.Usuario.rol)).order_by(models.Usuario.username).all()
    return [_listado(u) for u in usuarios]


@router.get("/usuarios/roles", response_model=List[schemas.RolOpcion])
def listar_roles(db: Session = Depends(get_db), current_user: models.Usuario = Depends(solo_admin)):
    return db.query(models.CatRol).order_by(models.CatRol.id_rol).all()


@router.post("/usuarios/", response_model=schemas.Usuario)
def crear_usuario(usuario: schemas.UsuarioCreate, db: Session = Depends(get_db),
                  current_user: models.Usuario = Depends(solo_admin)):
    if db.query(models.Usuario).filter(models.Usuario.username == usuario.username).first():
        raise HTTPException(status_code=400, detail="El username ya está registrado")
    _rechazar_correo_repetido(db, usuario.email)
    if not db.get(models.CatRol, int(usuario.id_rol)):
        raise HTTPException(status_code=400, detail="El rol indicado no existe.")
    nuevo_usuario = models.Usuario(
        id_rol=usuario.id_rol, username=usuario.username, email=usuario.email,
        is_active=usuario.is_active, hashed_password=get_password_hash(usuario.password),
    )
    db.add(nuevo_usuario)
    db.commit()
    db.refresh(nuevo_usuario)
    return nuevo_usuario


# Va antes de /usuarios/{id_usuario}/...: "me" no es un número
@router.put("/usuarios/me/clave")
@limiter.limit("5/minute")
def cambiar_mi_clave(request: Request, datos: schemas.CambioClavePropia, db: Session = Depends(get_db),
                     current_user: models.Usuario = Depends(get_current_user)):
    if not verify_password(datos.clave_actual, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="La contraseña actual no es correcta.")
    if verify_password(datos.clave_nueva, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="La nueva contraseña debe ser distinta de la actual.")
    _asignar_clave(current_user, datos.clave_nueva)
    db.commit()
    return {"mensaje": "Contraseña cambiada. Inicie sesión con la nueva contraseña."}


@router.put("/usuarios/{id_usuario}", response_model=schemas.UsuarioListado)
def modificar_usuario(id_usuario: int, cambios: schemas.UsuarioCambio, db: Session = Depends(get_db),
                      current_user: models.Usuario = Depends(solo_admin)):
    usuario = _buscar(db, id_usuario)
    datos = cambios.model_dump(exclude_unset=True, exclude_none=True)

    if "id_rol" in datos and not db.get(models.CatRol, int(datos["id_rol"])):
        raise HTTPException(status_code=400, detail="El rol indicado no existe.")
    administradores_activos = db.query(models.Usuario).filter(
        models.Usuario.id_rol == Rol.SUPERADMIN, models.Usuario.is_active.is_(True)).count()
    motivo = motivo_para_rechazar_cambio(
        current_user.id_usuario, usuario.id_usuario, usuario.id_rol, bool(usuario.is_active),
        datos.get("id_rol"), datos.get("is_active"), administradores_activos,
    )
    if motivo:
        raise HTTPException(status_code=400, detail=motivo)
    if "email" in datos:
        _rechazar_correo_repetido(db, datos["email"], excepto_id=id_usuario)

    for campo, valor in datos.items():
        setattr(usuario, campo, valor)
    db.commit()
    db.refresh(usuario)
    return _listado(usuario)


@router.put("/usuarios/{id_usuario}/clave")
def restablecer_clave(id_usuario: int, datos: schemas.ClaveNueva, db: Session = Depends(get_db),
                      current_user: models.Usuario = Depends(solo_admin)):
    usuario = _buscar(db, id_usuario)
    _asignar_clave(usuario, datos.password)
    db.commit()
    return {"mensaje": f"Contraseña de {usuario.username} restablecida. Sus sesiones abiertas se cerraron."}
