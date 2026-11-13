"""
Ejecuta la batería de seguridad y regresión (tests/verif_seguridad.py) contra PostgreSQL.

Esa batería es un escenario encadenado: crea usuarios, contenedores, gastos y pagos, y cada verificación
depende de las anteriores. Por eso se corre completa, en un proceso aparte, y aquí se revisa su resultado.

Requiere la variable TEST_DATABASE_URL apuntando a una base cuyo nombre contenga "test"
(la batería BORRA todo el contenido de esa base). Si la variable no existe, la prueba se omite.
"""
import os
import re
import subprocess
import sys

import pytest

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIPT = os.path.join(REPO, "tests", "verif_seguridad.py")

# Número de verificaciones al incorporar la batería a pytest. Si baja, alguien quitó verificaciones.
MINIMO_VERIFICACIONES = 85

pytestmark = pytest.mark.integracion


@pytest.fixture(scope="module")
def bateria():
    if not os.environ.get("TEST_DATABASE_URL"):
        pytest.skip("TEST_DATABASE_URL no está definida: se omiten las pruebas que requieren PostgreSQL.")
    return subprocess.run(
        [sys.executable, SCRIPT], cwd=REPO, capture_output=True, text=True, timeout=900,
        env={**os.environ, "PYTHONIOENCODING": "utf-8"},
    )


def _resumen(salida):
    m = re.search(r"RESUMEN TOTAL: (\d+)/(\d+) pruebas pasan", salida)
    return (int(m.group(1)), int(m.group(2))) if m else None


def test_la_bateria_termina_sin_fallas(bateria):
    salida = bateria.stdout + bateria.stderr
    fallas = re.findall(r"^\[(?:FALLA|VULNERABLE)\] .*(?:\n\s+-> .*)?", salida, flags=re.MULTILINE)
    detalle = "\n".join(fallas) if fallas else salida[-3000:]
    assert bateria.returncode == 0 and not fallas, f"La batería de seguridad y regresión reportó fallas:\n{detalle}"


def test_la_bateria_ejecuto_todas_las_verificaciones(bateria):
    resumen = _resumen(bateria.stdout)
    assert resumen is not None, "La batería no llegó al resumen final:\n" + (bateria.stdout + bateria.stderr)[-3000:]
    pasan, total = resumen
    assert total >= MINIMO_VERIFICACIONES, f"Se esperaban al menos {MINIMO_VERIFICACIONES} verificaciones y se ejecutaron {total}."
    assert pasan == total
