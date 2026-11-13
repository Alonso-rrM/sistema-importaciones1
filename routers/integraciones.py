"""Integraciones con servicios externos (consulta de RUC en SUNAT)."""
from fastapi import APIRouter, Depends, HTTPException, Request

import models
from dependencies import get_current_user, limiter
from services.sunat import ErrorConsultaRuc, consultar_ruc

router = APIRouter()


@router.get("/sunat/ruc/{ruc}", tags=["Integraciones"])
@limiter.limit("30/minute")  # Protege la cuota del token de ApiPeru
def consultar_ruc_sunat(request: Request, ruc: str, current_user: models.Usuario = Depends(get_current_user)):
    try:
        return consultar_ruc(ruc)
    except ErrorConsultaRuc as e:
        raise HTTPException(status_code=e.status_code, detail=e.detalle) from None
