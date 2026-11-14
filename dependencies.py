import calendar
from typing import List, Optional
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
import jwt
from jwt.exceptions import InvalidTokenError, ExpiredSignatureError
from slowapi import Limiter
from slowapi.util import get_remote_address

import models
from database import SessionLocal
from security import SECRET_KEY, ALGORITHM, COOKIE_SESION
from services.audit_trail import fijar_contexto  # también registra el listener de la bitácora

# Limitador de peticiones por IP
limiter = Limiter(key_func=get_remote_address)

# Esquema OAuth2 Bearer (opcional): lo usan scripts/API. El navegador usa la cookie httpOnly.
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login", auto_error=False)

# Inyector de Sesión de Base de Datos (con contexto para la bitácora automática)
def get_db(request: Request):
    db = SessionLocal()
    fijar_contexto(
        db,
        ip=request.client.host if request.client else None,
        endpoint=f"{request.method} {request.url.path}",
    )
    try:
        yield db
    finally:
        db.close()

# Inyector de Usuario Autenticado
def get_current_user(request: Request, bearer: Optional[str] = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credenciales_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="No se pudieron validar las credenciales",
        headers={"WWW-Authenticate": "Bearer"},
    )

    # Prioridad: header Bearer (scripts) y, si no hay, la cookie httpOnly de sesión (navegador)
    token = bearer or request.cookies.get(COOKIE_SESION)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No ha iniciado sesión",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credenciales_exception
    except ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, 
            detail="El token ha expirado", 
            headers={"WWW-Authenticate": "Bearer"}
        )
    except InvalidTokenError:
        raise credenciales_exception
        
    user = db.query(models.Usuario).filter(models.Usuario.username == username).first()
    if user is None:
        raise credenciales_exception
        
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="El usuario inactivo o suspendido")

    # Una sesión abierta antes del último cambio de contraseña ya no vale
    if user.clave_cambiada_en and payload.get("iat", 0) < calendar.timegm(user.clave_cambiada_en.utctimetuple()):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Su contraseña cambió. Inicie sesión nuevamente.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Toda escritura posterior en esta sesión queda firmada con este usuario en la bitácora
    fijar_contexto(db, id_usuario=user.id_usuario)
    return user

# Control de Roles (RBAC)
class RoleChecker:
    def __init__(self, roles_permitidos: List[int]):
        self.roles_permitidos = roles_permitidos

    def __call__(self, current_user: models.Usuario = Depends(get_current_user)):
        if current_user.id_rol not in self.roles_permitidos:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Operación denegada: No tienes los permisos necesarios para realizar esta acción."
            )
        return current_user
