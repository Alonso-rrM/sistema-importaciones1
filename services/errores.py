import logging
import uuid
from typing import Any, Callable

from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError

from domain.validaciones import ValorInvalido

logger = logging.getLogger("erp")


def _registrar_y_describir(contexto: str, exc: Exception) -> str:
    """Registra el detalle técnico en el log y arma el mensaje genérico (con código de referencia) para el cliente."""
    ref = uuid.uuid4().hex[:8].upper()
    logger.exception("[%s] %s", ref, contexto)
    if isinstance(exc, IntegrityError):
        motivo = "los datos hacen referencia a un registro inexistente o duplican uno existente"
    else:
        motivo = "ocurrió un error interno"
    return f"{contexto}: {motivo}. Código de referencia: {ref}"


def error_interno(contexto: str, exc: Exception, status_code: int = 400) -> HTTPException:
    """
    Registra el detalle técnico en el log del servidor y devuelve al cliente un mensaje genérico
    con un código de referencia. Evita exponer SQL, nombres de tablas o trazas internas.
    """
    return HTTPException(status_code=status_code, detail=_registrar_y_describir(contexto, exc))


class ErrorDeNegocio(Exception):
    """
    Regla de negocio incumplida (saldo insuficiente, gasto ya pagado, permiso por estado, etc.).

    La lanzan los servicios, que así no dependen de FastAPI. main.py la convierte en la misma respuesta
    que antes daba HTTPException:  {"detail": "<mensaje>"}  con el código HTTP indicado.
    """

    def __init__(self, status_code: int, detalle: str):
        super().__init__(detalle)
        self.status_code = status_code
        self.detalle = detalle


def rechazar_si_invalido(validador: Callable[[Any], Any], valor: Any) -> Any:
    """Aplica una regla de domain/validaciones.py; si el valor no la cumple, responde 422 con su mensaje."""
    try:
        return validador(valor)
    except ValorInvalido as exc:
        raise ErrorDeNegocio(422, str(exc)) from None


def error_interno_de_negocio(contexto: str, exc: Exception, status_code: int = 400) -> ErrorDeNegocio:
    """Igual que error_interno, para usar dentro de los servicios (sin depender de FastAPI)."""
    return ErrorDeNegocio(status_code, _registrar_y_describir(contexto, exc))
