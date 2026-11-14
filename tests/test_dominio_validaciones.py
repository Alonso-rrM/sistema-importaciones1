"""Validación y normalización de lo que digita la usuaria (domain/validaciones.py)."""
import pytest

from domain.validaciones import (
    ValorInvalido, digito_verificador_ruc, limpiar_texto, normalizar_comprobante, normalizar_numero_dam,
    normalizar_ruc, normalizar_ruc_opcional,
)

# ----------------------------------------------------------------- textos

@pytest.mark.parametrize("texto, esperado", [
    ("  NAVIERA   DEL  SUR ", "NAVIERA DEL SUR"), ("\tA\nB ", "A B"), ("", None), ("   ", None), (None, None),
])
def test_limpiar_texto(texto, esperado):
    assert limpiar_texto(texto) == esperado


# ----------------------------------------------------------------- RUC

# RUC reales de entidades públicamente conocidas (su dígito verificador es correcto)
RUC_REALES = ["20131312955",   # SUNAT
              "20100047218",   # Banco de Crédito del Perú
              "20100130204"]   # BBVA Perú


@pytest.mark.parametrize("ruc", RUC_REALES)
def test_ruc_reales_son_validos(ruc):
    assert normalizar_ruc(ruc) == ruc
    assert digito_verificador_ruc(ruc[:10]) == int(ruc[10])


@pytest.mark.parametrize("texto", [" 20131312955 ", "201-3131-2955", "20131 312955"])
def test_ruc_quita_espacios_y_guiones(texto):
    assert normalizar_ruc(texto) == "20131312955"


@pytest.mark.parametrize("texto, fragmento", [
    ("", "obligatorio"), (None, "obligatorio"),
    ("2013131295", "11 dígitos"), ("201313129555", "11 dígitos"), ("2013131295A", "11 dígitos"),
    ("30131312955", "debe empezar"),
    ("20131312956", "dígito verificador"),   # último dígito cambiado
    ("20131312595", "dígito verificador"),   # dos dígitos intercambiados
])
def test_ruc_invalido(texto, fragmento):
    with pytest.raises(ValorInvalido, match=fragmento):
        normalizar_ruc(texto)


def test_cualquier_error_de_un_digito_se_detecta():
    """Cambiar un solo dígito de un RUC válido siempre rompe el dígito verificador (o el prefijo)."""
    for ruc in RUC_REALES:
        for posicion in range(11):
            for digito in "0123456789":
                if digito == ruc[posicion]:
                    continue
                alterado = ruc[:posicion] + digito + ruc[posicion + 1:]
                with pytest.raises(ValorInvalido):
                    normalizar_ruc(alterado)


@pytest.mark.parametrize("texto, esperado", [("", None), ("  ", None), (None, None), ("20131312955", "20131312955")])
def test_ruc_opcional(texto, esperado):
    assert normalizar_ruc_opcional(texto) == esperado


def test_ruc_opcional_con_valor_invalido_igual_falla():
    with pytest.raises(ValorInvalido):
        normalizar_ruc_opcional("123")


# ----------------------------------------------------------------- N° de DAM

@pytest.mark.parametrize("texto, esperado", [
    ("118-2026-10-123456", "118-2026-10-123456"),
    ("118-2026-10-1", "118-2026-10-000001"),          # correlativo sin ceros
    ("118-26-10-535304", "118-2026-10-535304"),       # año de 2 dígitos, como en el C.D.A.
    (" 118 2026 10 535304 ", "118-2026-10-535304"),   # espacios como separadores
    ("118/2026/10/535304", "118-2026-10-535304"),
    ("118.2026.10.535304", "118-2026-10-535304"),
    ("118 - 2026 - 10 - 45", "118-2026-10-000045"),
    ("235-2025-40-000777", "235-2025-40-000777"),     # otra aduana y régimen
])
def test_numero_dam_valido(texto, esperado):
    assert normalizar_numero_dam(texto) == esperado


@pytest.mark.parametrize("texto, fragmento", [
    ("", "obligatorio"), (None, "obligatorio"),
    ("118202610123456", "no es válido"),         # sin separadores: ambiguo
    ("118-2026-10", "no es válido"),             # falta el número
    ("118-2026-10-12-3", "no es válido"),        # una parte de más
    ("118-2026-1O-123456", "no es válido"),      # letra O en lugar de cero
    ("11-2026-10-123456", "aduana"),
    ("1180-2026-10-123456", "aduana"),
    ("118-206-10-123456", "año"),
    ("118-1926-10-123456", "año"),
    ("118-2026-1-123456", "régimen"),
    ("118-2026-10-1234567", "correlativo"),
    ("118-2026-10-000000", "correlativo"),
])
def test_numero_dam_invalido(texto, fragmento):
    with pytest.raises(ValorInvalido, match=fragmento):
        normalizar_numero_dam(texto)


def test_numero_dam_es_idempotente():
    canonico = normalizar_numero_dam("118-26-10-5")
    assert normalizar_numero_dam(canonico) == canonico


# ----------------------------------------------------------------- comprobantes

@pytest.mark.parametrize("texto, esperado", [
    ("F001-123", "F001-00000123"),
    ("f001-77", "F001-00000077"),             # serie en minúsculas
    (" E001 - 5 ", "E001-00000005"),          # espacios alrededor del guion
    ("0001-12345678", "0001-12345678"),       # serie numérica (comprobante físico)
    ("B12-9", "B12-00000009"),                # serie corta
    ("", None), ("  ", None), (None, None),
])
def test_comprobante_valido(texto, esperado):
    assert normalizar_comprobante(texto) == esperado


@pytest.mark.parametrize("texto, fragmento", [
    ("F001123", "no es válido"),               # sin guion
    ("F0011-123", "no es válido"),             # serie de 5 caracteres
    ("F001-123456789", "no es válido"),        # correlativo de 9 dígitos
    ("F001-12A", "no es válido"),
    ("F-001-123", "no es válido"),
    ("F001-0", "cero"),
])
def test_comprobante_invalido(texto, fragmento):
    with pytest.raises(ValorInvalido, match=fragmento):
        normalizar_comprobante(texto)


def test_comprobante_es_idempotente():
    assert normalizar_comprobante("F001-00000123") == "F001-00000123"
