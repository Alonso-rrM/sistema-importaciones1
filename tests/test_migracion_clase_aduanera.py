"""
La migración que crea cat_conceptos_pagos.clase_aduanera clasifica los conceptos EXISTENTES con SQL.
Esta prueba ejecuta ese mismo SQL en PostgreSQL y comprueba que da el mismo resultado que la regla de
Python (domain/conceptos.py), que era el comportamiento vigente antes de la migración.
Requiere TEST_DATABASE_URL; si no está definida, se omite.
"""
import importlib.util
import os

import pytest

from domain.conceptos import clase_aduanera_sugerida

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RUTA_MIGRACION = os.path.join(REPO, "alembic", "versions", "c3f8a1d27e45_add_clase_aduanera_conceptos.py")

NOMBRES = [
    "TRIBUTOS", "tributos aduaneros", "Pago de Tributo", "PERCEPCION", "PERCEPCIÓN IGV", "percepción",
    "OMC", "Ajuste omc", "PERCEPCION OMC", "TRIBUTOS Y PERCEPCION", "TRIBUTOS OMC",
    "FLETE LOCAL", "MULTAS", "ALMACENAJE", "Devolución de vacío", "THC", "",
]

pytestmark = pytest.mark.integracion


def test_el_sql_de_la_migracion_clasifica_igual_que_la_regla_vigente():
    url = os.environ.get("TEST_DATABASE_URL")
    if not url:
        pytest.skip("TEST_DATABASE_URL no está definida: se omiten las pruebas que requieren PostgreSQL.")
    from sqlalchemy import create_engine, text

    spec = importlib.util.spec_from_file_location("migracion_clase_aduanera", RUTA_MIGRACION)
    migracion = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migracion)

    engine = create_engine(url)
    try:
        with engine.connect() as conn:
            # Tabla TEMPORAL con el mismo nombre: tapa a la real solo dentro de esta conexión y se descarta al final
            conn.execute(text(
                "CREATE TEMP TABLE cat_conceptos_pagos (nombre varchar(100), clase_aduanera varchar(20) DEFAULT 'NINGUNA')"
            ))
            conn.execute(text("INSERT INTO cat_conceptos_pagos (nombre) VALUES (:n)"), [{"n": n} for n in NOMBRES])
            conn.execute(text(migracion.SQL_CLASIFICAR_EXISTENTES))
            resultado = dict(conn.execute(text("SELECT nombre, clase_aduanera FROM cat_conceptos_pagos")).all())
            conn.rollback()
    finally:
        engine.dispose()

    assert resultado == {n: str(clase_aduanera_sugerida(n)) for n in NOMBRES}
