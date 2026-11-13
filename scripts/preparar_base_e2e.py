"""
PREPARA LA BASE PARA LAS PRUEBAS DE EXTREMO A EXTREMO (frontend/e2e)
====================================================================
Deja una base de PRUEBAS vacía con el esquema completo, el usuario administrador y un conjunto pequeño de
datos de ejemplo (catálogos, un contenedor con su DAM, gastos, un voucher y el tipo de cambio del día).

Los datos se cargan a través de la propia API, así que pasan por las mismas reglas que en producción.

Uso (desde la raíz del proyecto; lo ejecuta Playwright antes de las pruebas):
    E2E_DATABASE_URL=postgresql://usuario:clave@host/erp_e2e_test  python scripts/preparar_base_e2e.py

Por seguridad, el nombre de la base debe contener "test": este script BORRA todo su contenido.
"""
import datetime
import os
import subprocess
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

URL = os.environ.get("E2E_DATABASE_URL")
if not URL:
    sys.exit("ERROR: defina E2E_DATABASE_URL (base desechable cuyo nombre contenga 'test').")
NOMBRE_BASE = URL.rsplit("/", 1)[-1].split("?")[0].lower()
if "test" not in NOMBRE_BASE:
    sys.exit(f"ERROR DE SEGURIDAD: la base '{NOMBRE_BASE}' no contiene 'test' en su nombre. No se modifica.")

ADMIN_USUARIO = os.environ.get("E2E_ADMIN_USUARIO", "admin")
ADMIN_CLAVE = os.environ.get("E2E_ADMIN_CLAVE", "Clave-E2E-12345")

# La aplicación lee estas variables al importarse: se fijan antes de cualquier import del proyecto
os.environ["DATABASE_URL"] = URL
os.environ.setdefault("SECRET_KEY", "clave-solo-para-pruebas-e2e-0123456789abcdef")
sys.path.insert(0, RAIZ)
os.chdir(RAIZ)

from sqlalchemy import create_engine, text  # noqa: E402


def reiniciar_esquema():
    motor = create_engine(URL, isolation_level="AUTOCOMMIT")
    with motor.connect() as conn:
        conn.execute(text("DROP SCHEMA public CASCADE; CREATE SCHEMA public;"))
    motor.dispose()
    subprocess.run([sys.executable, "scripts/init_db.py", "--url", URL], check=True, cwd=RAIZ,
                   stdout=subprocess.DEVNULL)


def crear_roles_y_admin():
    import models
    from constantes import Rol
    from database import SessionLocal
    from security import get_password_hash

    db = SessionLocal()
    for rol, nombre in [(Rol.SUPERADMIN, "Administrador"), (Rol.OPERACIONES, "Logistica"),
                        (Rol.FINANZAS, "Tesoreria"), (Rol.AUDITOR, "Auditor")]:
        db.add(models.CatRol(id_rol=rol, nombre=nombre))
    db.flush()
    db.add(models.Usuario(id_rol=Rol.SUPERADMIN, username=ADMIN_USUARIO, email="admin@e2e.test",
                          hashed_password=get_password_hash(ADMIN_CLAVE), is_active=True))
    db.commit()
    db.close()


def cargar_datos_de_ejemplo():
    from fastapi.testclient import TestClient

    import main
    from constantes import CategoriaProveedor, ClaseAduanera, Moneda, TipoGasto, TipoValor

    cliente = TestClient(main.app)
    r = cliente.post("/login", data={"username": ADMIN_USUARIO, "password": ADMIN_CLAVE},
                     headers={"X-Auth-Mode": "bearer"})
    r.raise_for_status()
    cabeceras = {"Authorization": f"Bearer {r.json()['access_token']}"}

    def post(ruta, cuerpo):
        respuesta = cliente.post(ruta, json=cuerpo, headers=cabeceras)
        if respuesta.status_code >= 300:
            sys.exit(f"ERROR al preparar {ruta}: {respuesta.status_code} {respuesta.text}")
        return respuesta.json()

    hoy = str(datetime.date.today())
    imp = post("/importadores/", {"nombre": "IMPORTADORA E2E SAC", "ruc": "20100000001"})
    prov = post("/proveedores/", {"nombre": "NAVIERA E2E", "ruc": "20100000002", "categoria": CategoriaProveedor.NACIONAL})
    sunat = post("/proveedores/", {"nombre": "SUNAT", "ruc": "20131312955", "categoria": CategoriaProveedor.ESTADO_O_TRIBUTO})
    post("/agentes/", {"nombre": "AGENCIA E2E", "ruc": "20100000003"})
    post("/almacenes/", {"nombre": "ALMACEN E2E"})
    banco = post("/bancos/", {"nombre": "BANCO E2E"})
    doc = post("/tipos-documento/", {"nombre_documento": "FACTURA", "multiplicador_financiero": 1})
    trib = post("/conceptos/", {"nombre": "TRIBUTOS", "tipo_gasto": TipoGasto.FIJO_DESPACHO, "clase_aduanera": ClaseAduanera.TRIBUTO})
    post("/conceptos/", {"nombre": "PERCEPCION", "tipo_gasto": TipoGasto.FIJO_DESPACHO, "clase_aduanera": ClaseAduanera.PERCEPCION})
    flete = post("/conceptos/", {"nombre": "FLETE LOCAL", "tipo_gasto": TipoGasto.POST_LEVANTE, "clase_aduanera": ClaseAduanera.NINGUNA})

    respuesta_tc = cliente.put("/tipo-cambio/", json={"fecha": hoy, "precio_compra": "3.7450", "precio_venta": "3.7520"},
                               headers=cabeceras)
    respuesta_tc.raise_for_status()

    maestro = post("/maestros/", {"numero_factura": "GF-E2E-1", "id_importador": imp["id_importador"],
                                  "tipo_valor": TipoValor.DEFINITIVO})
    dam = post("/dams/", {"id_maestro": maestro["id_maestro"], "numero_de_dam": "118-2026-10-000001", "canal_control": "VERDE"})
    for concepto, proveedor, monto, moneda, numero in [
        (flete, prov, "250.00", Moneda.USD, "F001-1"),
        (trib, sunat, "1200.00", Moneda.PEN, "118-26-10-000001-01"),
    ]:
        post("/gastos/", {"id_dam": dam["id_dam"], "id_concepto": concepto["id_concepto"],
                          "id_proveedor": proveedor["id_proveedor"], "id_tipo_doc": doc["id_tipo_doc"],
                          "monto_original": monto, "moneda": moneda, "numero_documento": numero})
    post("/vouchers/", {"banco_id": banco["id_banco"], "id_importador": imp["id_importador"], "numero_operacion": "OP-E2E-1",
                        "monto_total": "1000.00", "moneda": Moneda.USD, "fecha_transferencia": hoy})


if __name__ == "__main__":
    reiniciar_esquema()
    crear_roles_y_admin()
    cargar_datos_de_ejemplo()
    print(f"[OK] Base {NOMBRE_BASE} lista para las pruebas de extremo a extremo.")
