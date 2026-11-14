"""Sugerencia de clase aduanera a partir del nombre del concepto (domain/conceptos.py)."""
import pytest

from constantes import ClaseAduanera
from domain.conceptos import clase_aduanera_sugerida


@pytest.mark.parametrize("nombre, esperada", [
    ("TRIBUTOS", "TRIBUTO"), ("tributos aduaneros", "TRIBUTO"), ("Pago de Tributo", "TRIBUTO"),
    ("PERCEPCION", "PERCEPCION"), ("PERCEPCIÓN IGV", "PERCEPCION"), ("percepción", "PERCEPCION"),
    ("OMC", "OMC"), ("Ajuste omc", "OMC"),
    ("FLETE LOCAL", "NINGUNA"), ("MULTAS", "NINGUNA"), ("ALMACENAJE", "NINGUNA"), ("", "NINGUNA"), (None, "NINGUNA"),
])
def test_sugerencia_por_nombre(nombre, esperada):
    assert clase_aduanera_sugerida(nombre) == esperada


@pytest.mark.parametrize("nombre, esperada", [
    ("TRIBUTOS Y PERCEPCION", "TRIBUTO"),   # TRIBUTO tiene prioridad sobre PERCEPCION
    ("PERCEPCION OMC", "OMC"),              # la percepción de la OMC es de la etapa OMC, no de la proforma
    ("PERCEPCIÓN DE OMC", "OMC"),
    ("TRIBUTOS OMC", "TRIBUTO"),
])
def test_prioridad_cuando_el_nombre_menciona_varias_clases(nombre, esperada):
    """Es el mismo orden que aplicaba la máquina de estados antes de existir el campo clase_aduanera."""
    assert clase_aduanera_sugerida(nombre) == esperada


def test_siempre_devuelve_un_valor_del_catalogo():
    assert isinstance(clase_aduanera_sugerida("cualquier cosa"), ClaseAduanera)
