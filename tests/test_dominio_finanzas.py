"""Reglas de conversión y redondeo de pagos (domain/finanzas.py). No requiere base de datos."""
from decimal import Decimal

import pytest

from domain.finanzas import calcular_amortizacion_cruzada as amortizar

D = Decimal


@pytest.mark.parametrize("moneda", ["USD", "PEN"])
def test_misma_moneda_no_convierte(moneda):
    assert amortizar(D("150.00"), D("3.75"), moneda, moneda) == D("150.00")


def test_gasto_en_dolares_pagado_en_soles_divide_por_el_tipo_de_cambio():
    # S/ 375.00 a TC 3.75 amortizan USD 100.00
    assert amortizar(D("375.00"), D("3.75"), "USD", "PEN") == D("100.00")


def test_gasto_en_soles_pagado_en_dolares_multiplica_por_el_tipo_de_cambio():
    # USD 100.00 a TC 3.75 amortizan S/ 375.00
    assert amortizar(D("100.00"), D("3.75"), "PEN", "USD") == D("375.00")


@pytest.mark.parametrize(
    "importe, tc, moneda_gasto, moneda_pago, esperado",
    [
        ("100.00", "3.75", "USD", "PEN", "26.67"),   # 26.666… sube
        ("100.00", "3.00", "USD", "PEN", "33.33"),   # 33.333… baja
        ("1.00", "3.755", "PEN", "USD", "3.76"),     # 3.755 exacto: el medio centavo SUBE (no redondeo bancario)
        ("1.00", "3.745", "PEN", "USD", "3.75"),     # 3.745 exacto: también sube
        ("10.005", "1.00", "USD", "USD", "10.01"),   # misma moneda: también se cuantiza a 2 decimales
    ],
)
def test_redondeo_a_dos_decimales_medio_hacia_arriba(importe, tc, moneda_gasto, moneda_pago, esperado):
    assert amortizar(D(importe), D(tc), moneda_gasto, moneda_pago) == D(esperado)


@pytest.mark.parametrize("tc_invalido", ["0", "0.00", "-3.75"])
def test_tipo_de_cambio_cero_o_negativo_se_trata_como_uno(tc_invalido):
    # Protección contra división por cero: el importe pasa sin conversión
    assert amortizar(D("50.00"), D(tc_invalido), "USD", "PEN") == D("50.00")
    assert amortizar(D("50.00"), D(tc_invalido), "PEN", "USD") == D("50.00")


def test_el_resultado_siempre_tiene_dos_decimales():
    resultado = amortizar(D("100"), D("3.7"), "PEN", "USD")
    assert resultado == D("370.00")
    assert resultado.as_tuple().exponent == -2


# ---------- Regla única de amortización sobre pagos registrados ----------
from types import SimpleNamespace as Pago  # noqa: E402

from domain.finanzas import amortizacion_de_pago, tipo_cambio_efectivo, total_amortizado  # noqa: E402


@pytest.mark.parametrize("aplicado, registrado, esperado", [
    # Valores como los devuelve la base de datos (Decimal o vacío)
    (D("3.7525"), D("3.75"), "3.7525"),   # prevalece el TC aplicado (4 decimales)
    (None, D("3.75"), "3.75"),
    (None, None, "1.00"),
    (D("0"), D("3.75"), "3.75"),          # 0 se trata como "sin dato"
    (D("-1"), None, "1.00"),              # negativo: nunca se usa
])
def test_tipo_cambio_efectivo(aplicado, registrado, esperado):
    assert tipo_cambio_efectivo(aplicado, registrado) == D(esperado)


def test_cada_pago_se_redondea_por_separado():
    """Tres pagos de S/ 1.00 a TC 3.00 sobre un gasto en dólares amortizan 0.33 + 0.33 + 0.33 = 0.99 (no 1.00)."""
    pagos = [Pago(importe=D("1.00"), moneda="PEN", tipo_cambio_aplicado=D("3.0000"), tipo_cambio=D("3.00"))] * 3
    assert amortizacion_de_pago(pagos[0], "USD") == D("0.33")
    assert total_amortizado(pagos, "USD") == D("0.99")


def test_total_sin_pagos_es_cero():
    assert total_amortizado([], "USD") == D("0.00")
