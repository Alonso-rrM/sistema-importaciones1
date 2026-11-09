import logging
import uuid
from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError

logger = logging.getLogger("erp")


def error_interno(contexto: str, exc: Exception, status_code: int = 400) -> HTTPException:
    """
    Registra el detalle técnico en el log del servidor y devuelve al cliente un mensaje genérico
    con un código de referencia. Evita exponer SQL, nombres de tablas o trazas internas.
    """
    ref = uuid.uuid4().hex[:8].upper()
    logger.exception("[%s] %s", ref, contexto)
    if isinstance(exc, IntegrityError):
        motivo = "los datos hacen referencia a un registro inexistente o duplican uno existente"
    else:
        motivo = "ocurrió un error interno"
    return HTTPException(status_code=status_code, detail=f"{contexto}: {motivo}. Código de referencia: {ref}")
