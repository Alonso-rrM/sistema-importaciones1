"""
Las migraciones que clasifican los conceptos EXISTENTES (c3f8a1d27e45 crea clase_aduanera; a9e3b7c2d5f1
pasa la percepción de la OMC a la clase OMC) se ejecutan aquí, en orden, en PostgreSQL. El resultado debe
ser el mismo que la regla de Python (domain/conceptos.py) que se usa con los conceptos nuevos.
Requiere TEST_DATABASE_URL; si no está definida, se omite.
"""
import importlib.util
import os

import pytest

from domain.conceptos import clase_aduanera_sugerida

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RUTA_MIGRACION = os.path.join(REPO, "alembic", "versions", "c3f8a1d27e45_add_clase_aduanera_conceptos.py")
RUTA_RECLASIFICACION = os.path.join(REPO, "alembic", "versions", "a9e3b7c2d5f1_percepcion_omc_a_clase_omc.py")

NOMBRES = [
    "TRIBUTOS", "tributos aduaneros", "Pago de Tributo", "PERCEPCION", "PERCEPCIÓN IGV", "percepción",
    "OMC", "Ajuste omc", "PERCEPCION OMC", "Percepción de OMC", "TRIBUTOS Y PERCEPCION", "TRIBUTOS OMC",
    "FLETE LOCAL", "MULTAS", "ALMACENAJE", "Devolución de vacío", "THC", "",
]

pytestmark = pytest.mark.integracion


def test_el_sql_de_la_migracion_clasifica_igual_que_la_regla_vigente():
    url = os.environ.get("TEST_DATABASE_URL")
    if not url:
        pytest.skip("TEST_DATABASE_URL no está definida: se omiten las pruebas que requieren PostgreSQL.")
    from sqlalchemy import create_engine, text

    def cargar(nombre, ruta):
        spec = importlib.util.spec_from_file_location(nombre, ruta)
        modulo = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(modulo)
        return modulo

    migracion = cargar("migracion_clase_aduanera", RUTA_MIGRACION)
    reclasificacion = cargar("migracion_percepcion_omc", RUTA_RECLASIFICACION)

    engine = create_engine(url)
    try:
        with engine.connect() as conn:
            # Tabla TEMPORAL con el mismo nombre: tapa a la real solo dentro de esta conexión y se descarta al final
            conn.execute(text(
                "CREATE TEMP TABLE cat_conceptos_pagos (nombre varchar(100), clase_aduanera varchar(20) DEFAULT 'NINGUNA')"
            ))
            conn.execute(text("INSERT INTO cat_conceptos_pagos (nombre) VALUES (:n)"), [{"n": n} for n in NOMBRES])
            conn.execute(text(migracion.SQL_CLASIFICAR_EXISTENTES))
            conn.execute(text(reclasificacion.SQL_RECLASIFICAR))
            resultado = dict(conn.execute(text("SELECT nombre, clase_aduanera FROM cat_conceptos_pagos")).all())
            conn.rollback()
    finally:
        engine.dispose()

    assert resultado == {n: str(clase_aduanera_sugerida(n)) for n in NOMBRES}
