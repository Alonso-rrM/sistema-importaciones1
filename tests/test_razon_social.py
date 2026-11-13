"""Abreviación de razones sociales devueltas por la consulta de RUC. No requiere base de datos."""
import pytest

from main import acortar_razon_social


@pytest.mark.parametrize("original, esperado", [
    ("EMPRESA DEMO SOCIEDAD ANONIMA CERRADA", "EMPRESA DEMO S.A.C."),
    ("comercial ejemplo sociedad anonima", "COMERCIAL EJEMPLO S.A."),
    ("BANCO GRANDE SOCIEDAD ANONIMA ABIERTA", "BANCO GRANDE S.A.A."),
    ("SERVICIOS UNO SOCIEDAD COMERCIAL DE RESPONSABILIDAD LIMITADA", "SERVICIOS UNO S.R.L."),
    ("JUAN PEREZ EMPRESA INDIVIDUAL DE RESPONSABILIDAD LIMITADA", "JUAN PEREZ E.I.R.L."),
])
def test_abrevia_el_tipo_de_sociedad(original, esperado):
    assert acortar_razon_social(original) == esperado


@pytest.mark.parametrize("original, esperado", [
    ("IMPORTACIONES ABC S A C", "IMPORTACIONES ABC S.A.C."),
    ("TRANSPORTES XYZ E.I.R.L", "TRANSPORTES XYZ E.I.R.L."),
    ("NAVIERA  DEL   SUR S.R.L.", "NAVIERA DEL SUR S.R.L."),
    ("DISTRIBUIDORA 'EL SOL' S.A.", "DISTRIBUIDORA EL SOL S.A."),
])
def test_normaliza_siglas_espacios_y_comillas(original, esperado):
    assert acortar_razon_social(original) == esperado


def test_usa_el_nombre_comercial_corto_cuando_viene_despues_del_guion():
    original = "LOGISTICA INTEGRAL DEL PACIFICO SOCIEDAD ANONIMA CERRADA - LIPSAC"
    assert acortar_razon_social(original) == "LIPSAC"


def test_conserva_el_nombre_completo_si_la_parte_tras_el_guion_es_mas_larga():
    assert acortar_razon_social("ALFA - BETA GAMMA DELTA SAC") == "ALFA - BETA GAMMA DELTA S.A.C."


@pytest.mark.parametrize("vacio", ["", None])
def test_texto_vacio_devuelve_cadena_vacia(vacio):
    assert acortar_razon_social(vacio) == ""
