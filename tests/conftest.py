"""
Configuración común de pytest.

Las pruebas unitarias NO tocan ninguna base de datos. Para que importar la aplicación nunca apunte a
la base real del archivo .env, aquí se fijan las variables de entorno ANTES de cualquier import:
- si existe TEST_DATABASE_URL (base de pruebas), se usa esa;
- si no, se usa una dirección inválida a propósito (cualquier intento de conexión falla de inmediato).
"""
import os
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if REPO not in sys.path:
    sys.path.insert(0, REPO)

os.environ["DATABASE_URL"] = os.environ.get(
    "TEST_DATABASE_URL", "postgresql://sin_uso:sin_uso@127.0.0.1:1/pruebas_unitarias"
)
os.environ.setdefault("SECRET_KEY", "clave-solo-para-pruebas-unitarias-0123456789abcdef")
os.environ["ENABLE_DOCS"] = "false"
