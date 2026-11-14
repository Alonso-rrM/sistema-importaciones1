"""
CARGA INICIAL DE CATÁLOGOS DESDE LAS PLANTILLAS EXCEL (plantillas/*.xlsx)
=========================================================================
Envía cada plantilla a la misma carga masiva del Panel de Administración (POST /admin/carga-masiva),
así que se aplican las mismas validaciones (por ejemplo, el RUC con su dígito verificador) y cada fila
con error se informa sin detener las demás.

Requiere el backend en marcha y un usuario Administrador.

Uso (desde la raíz del proyecto):
    python scripts/cargar_plantillas.py                      -> API en http://localhost:8000
    python scripts/cargar_plantillas.py --api http://servidor:8000

Pide el usuario y la clave del Administrador (o los toma de ADMIN_USERNAME / ADMIN_PASSWORD del .env).
"""
import argparse
import getpass
import os
import sys
from pathlib import Path

import requests
from dotenv import load_dotenv

RAIZ = Path(__file__).resolve().parent.parent

# Orden de carga: primero lo que otros catálogos podrían necesitar. Los roles NO se cargan desde aquí:
# los crea /setup (o scripts/seed_inicial.py) con constantes.DATOS_ROLES_INICIALES.
PLANTILLAS = [
    ("bancos", "1_bancos.xlsx"),
    ("conceptos", "1_conceptos.xlsx"),
    ("proveedores", "1_proveedores.xlsx"),
    ("agentes", "1_agentes.xlsx"),
    ("importadores", "1_importadores.xlsx"),
]


def iniciar_sesion(api: str, usuario: str, clave: str) -> str:
    """Token de acceso en modo script (la API lo entrega en el cuerpo con X-Auth-Mode: bearer)."""
    respuesta = requests.post(f"{api}/login", data={"username": usuario, "password": clave},
                              headers={"X-Auth-Mode": "bearer"}, timeout=30)
    if respuesta.status_code != 200:
        raise SystemExit(f"No se pudo iniciar sesión ({respuesta.status_code}): {respuesta.text}")
    return respuesta.json()["access_token"]


def cargar(api: str, token: str, catalogo: str, archivo: Path) -> None:
    if not archivo.exists():
        print(f"[--] {archivo.name}: no existe, se omite.")
        return
    with archivo.open("rb") as contenido:
        respuesta = requests.post(
            f"{api}/admin/carga-masiva", params={"catalogo": catalogo},
            files={"archivo": (archivo.name, contenido)}, headers={"Authorization": f"Bearer {token}"}, timeout=120,
        )
    if respuesta.status_code != 200:
        print(f"[ERROR] {archivo.name}: {respuesta.status_code} {respuesta.text}")
        return
    resultado = respuesta.json()
    print(f"[OK] {archivo.name}: {resultado['insertados']} de {resultado['total_filas']} filas insertadas.")
    for error in resultado.get("errores_detalle", []):
        print(f"     - {error}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Carga los catálogos iniciales desde plantillas/*.xlsx.")
    parser.add_argument("--api", default=os.getenv("API_URL", "http://localhost:8000"), help="URL del backend.")
    args = parser.parse_args()
    load_dotenv(RAIZ / ".env")

    usuario = os.getenv("ADMIN_USERNAME") or input("Usuario administrador: ")
    clave = os.getenv("ADMIN_PASSWORD") or getpass.getpass("Clave: ")
    token = iniciar_sesion(args.api.rstrip("/"), usuario, clave)
    for catalogo, nombre in PLANTILLAS:
        cargar(args.api.rstrip("/"), token, catalogo, RAIZ / "plantillas" / nombre)
    return 0


if __name__ == "__main__":
    sys.exit(main())
