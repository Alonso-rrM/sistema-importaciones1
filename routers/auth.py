from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

import models
from security import verify_password, create_access_token
from dependencies import get_db

router = APIRouter(tags=["Auth"])

@router.post("/login")
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
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
