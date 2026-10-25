from typing import List
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
import jwt
from jwt.exceptions import InvalidTokenError, ExpiredSignatureError
from slowapi import Limiter
from slowapi.util import get_remote_address

import models
from database import SessionLocal
from security import SECRET_KEY, ALGORITHM

# Limitador de peticiones por IP
limiter = Limiter(key_func=get_remote_address)

# Configuración del esquema OAuth2 (Apunta al endpoint de login)
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")

# Inyector de Sesión de Base de Datos
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Inyector de Usuario Autenticado
def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credenciales_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="No se pudieron validar las credenciales",
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
