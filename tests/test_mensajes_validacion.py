"""Traducción de los errores de validación a español (services/mensajes_validacion.py)."""
from decimal import Decimal
from typing import Annotated

import pytest
from pydantic import AfterValidator, BaseModel, Field, ValidationError

from constantes import Moneda
from domain.validaciones import ValorInvalido, normalizar_ruc
from services.mensajes_validacion import rotulo, traducir_errores


def _obligatorio(valor: str) -> str:
    if not valor.strip():
        raise ValorInvalido("no puede quedar vacío.")
    return valor


class Ejemplo(BaseModel):
    monto_original: Annotated[Decimal, Field(gt=0, max_digits=15, decimal_places=2)]
    moneda: Moneda
    ruc: Annotated[str, AfterValidator(normalizar_ruc)]
    numero_operacion: Annotated[str, AfterValidator(_obligatorio)]
    campo_sin_rotulo: int


def _mensajes(datos: dict) -> dict:
    with pytest.raises(ValidationError) as error:
        Ejemplo(**datos)
    return {e["loc"][-1]: e["msg"] for e in traducir_errores(error.value.errors())}


def test_traduce_cada_tipo_de_error():
    m = _mensajes({"monto_original": "10.123", "moneda": "EUR", "ruc": "20100047219", "numero_operacion": "  "})
    assert m["monto_original"] == "Monto admite como máximo 2 decimales."
    assert m["moneda"].startswith("Moneda debe ser uno de:")
    assert m["ruc"].startswith("El RUC 20100047219 no es válido")       # mensaje propio, sin prefijo
    assert m["numero_operacion"] == "N° de operación: no puede quedar vacío."   # mensaje propio en minúscula: con rótulo
    assert m["campo_sin_rotulo"] == "Campo sin rotulo es obligatorio."


@pytest.mark.parametrize("monto, esperado", [
    ("0", "Monto debe ser mayor que 0."), ("-5", "Monto debe ser mayor que 0."),
    ("1,50", "Monto debe ser un número (use punto para los decimales, sin comas ni símbolos)."),
    ("12345678901234.5", "Monto admite como máximo 13 dígitos antes del punto decimal."),
])
def test_montos(monto, esperado):
    m = _mensajes({"monto_original": monto, "moneda": "USD", "ruc": "20100047218", "numero_operacion": "1", "campo_sin_rotulo": 1})
    assert m["monto_original"] == esperado


def test_la_respuesta_conserva_su_forma_y_no_expone_datos_internos():
    with pytest.raises(ValidationError) as error:
        Ejemplo(monto_original="x", moneda="USD", ruc="20100047218", numero_operacion="1", campo_sin_rotulo=1)
    (traducido,) = traducir_errores(error.value.errors())
    assert set(traducido) == {"loc", "msg", "type"}
    assert traducido["loc"] == ["monto_original"]


@pytest.mark.parametrize("loc, esperado", [
    (("body", "numero_de_dam"), "N° de DAM"), (("body", "items", 0, "ruc"), "RUC"), (("query", "otro_campo"), "Otro campo"),
])
def test_rotulo(loc, esperado):
    assert rotulo(loc) == esperado
