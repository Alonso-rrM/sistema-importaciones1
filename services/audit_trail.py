"""
BITÁCORA AUTOMÁTICA DE CAMBIOS (Audit Trail)
============================================
Registra en `audit_logs` TODO alta, modificación y baja de las tablas de negocio, sin depender
de que cada endpoint se acuerde de hacerlo. Para cada evento guarda:
  - quién (id_usuario), desde dónde (ip_address), por qué ruta (endpoint)
  - qué tabla y registro, y el valor ANTES -> DESPUÉS de cada campo modificado.

Funcionamiento:
  1. `get_db` (dependencies.py) guarda en `session.info` la IP y el endpoint de la petición.
  2. `get_current_user` guarda en `session.info` el usuario autenticado.
     (Se usa session.info y no contextvars porque FastAPI ejecuta las dependencias síncronas en
      otro hilo; la sesión, en cambio, es una sola por petición y la comparten todos.)
  3. Un listener `after_flush` de SQLAlchemy recorre los objetos insertados/modificados/eliminados
     y escribe las filas de auditoría en la MISMA transacción: si la operación hace rollback,
     su rastro también desaparece (no quedan registros de cambios que nunca ocurrieron).
"""
import datetime
import json
from decimal import Decimal

from sqlalchemy import event, inspect
from sqlalchemy.orm import Session

import models

# Tablas de negocio auditadas -> nombre legible
MODELOS_AUDITADOS = {
    models.MaestroImportacion: "Contenedor",
    models.DetalleDam: "DAM",
    models.RegistroGasto: "Gasto",
    models.RegistroPago: "Pago",
    models.VoucherBancario: "Voucher",
    models.HistorialTipoCambio: "Tipo de cambio",
    models.CatImportador: "Importador",
    models.CatProveedor: "Proveedor",
    models.CatAgente: "Agente",
    models.CatAlmacen: "Almacén",
    models.CatBanco: "Banco",
    models.CatConceptoPago: "Concepto",
    models.CatalogoDocumentoPago: "Tipo de documento",
    models.CatRol: "Rol",
    models.Usuario: "Usuario",
}

# Campos que nunca se copian a la bitácora (solo se indica que cambiaron)
CAMPOS_SENSIBLES = {"hashed_password"}
# Campos técnicos sin valor de auditoría
CAMPOS_IGNORADOS = {"version", "created_at"}


def fijar_contexto(db: Session, ip=None, endpoint=None, id_usuario=None):
    """Asocia a la sesión de BD el contexto de auditoría de la petición en curso."""
    if ip is not None:
        db.info["audit_ip"] = ip
    if endpoint is not None:
        db.info["audit_endpoint"] = endpoint
    if id_usuario is not None:
        db.info["audit_usuario"] = id_usuario


def _serializar(valor):
    if isinstance(valor, Decimal):
        return str(valor)
    if isinstance(valor, (datetime.date, datetime.datetime)):
        return valor.isoformat()
    return valor


def _pk(obj):
    # Se lee de las columnas de la PK (en after_flush los objetos nuevos ya tienen PK pero aún no 'identity')
    valores = [_serializar(v) for v in inspect(obj).mapper.primary_key_from_instance(obj)]
    return valores[0] if len(valores) == 1 else valores


def _valor_campo(attr_key, valor):
    return "***" if attr_key in CAMPOS_SENSIBLES else _serializar(valor)


def _cambios_update(obj):
    cambios = {}
    estado = inspect(obj)
    for attr in estado.mapper.column_attrs:
        if attr.key in CAMPOS_IGNORADOS:
            continue
        hist = estado.attrs[attr.key].history
        if not hist.has_changes():
            continue
        antes = hist.deleted[0] if hist.deleted else None
        despues = hist.added[0] if hist.added else None
        if _serializar(antes) == _serializar(despues):
            continue
        cambios[attr.key] = [_valor_campo(attr.key, antes), _valor_campo(attr.key, despues)]
    return cambios


def _snapshot(obj):
    estado = inspect(obj)
    return {
        a.key: _valor_campo(a.key, getattr(obj, a.key))
        for a in estado.mapper.column_attrs if a.key not in CAMPOS_IGNORADOS
    }


@event.listens_for(Session, "after_flush")
def _registrar_cambios(session, flush_context):
    filas = []
    endpoint = session.info.get("audit_endpoint") or "(proceso interno)"
    ip = session.info.get("audit_ip")
    usuario = session.info.get("audit_usuario")

    def agregar(operacion, obj, detalle):
        etiqueta = MODELOS_AUDITADOS[type(obj)]
        filas.append({
            "id_usuario": usuario,
            "endpoint": endpoint[:255],
            "accion": f"{operacion} {etiqueta}"[:100],
            "ip_address": (ip or "")[:50] or None,
            "detalles": json.dumps({"tabla": obj.__tablename__, "id": _pk(obj), **detalle}, ensure_ascii=False, default=str),
            "created_at": datetime.datetime.utcnow(),
        })

    for obj in session.new:
        if type(obj) in MODELOS_AUDITADOS:
            agregar("ALTA", obj, {"valores": _snapshot(obj)})
    for obj in session.dirty:
        if type(obj) in MODELOS_AUDITADOS and session.is_modified(obj, include_collections=False):
            cambios = _cambios_update(obj)
            if cambios:
                agregar("MODIFICACION", obj, {"cambios": cambios})
    for obj in session.deleted:
        if type(obj) in MODELOS_AUDITADOS:
            agregar("BAJA", obj, {"valores_previos": _snapshot(obj)})

    if filas:
        # Inserción directa por la conexión de la transacción en curso (no se puede usar session.add dentro del flush)
        session.connection().execute(models.AuditLog.__table__.insert(), filas)


# =====================================================================
# TRADUCCIÓN DE BITÁCORA A LENGUAJE DE NEGOCIO (SIN IDs INTERNOS)
# =====================================================================

ETIQUETAS_CAMPOS = {
    # Claves foráneas -> nombre de negocio
    "id_dam": "DAM",
    "id_maestro": "Contenedor / Factura",
    "id_importador": "Importador",
    "id_proveedor": "Proveedor",
    "id_agente": "Agente de Aduana",
    "id_almacen": "Almacén",
    "banco_id": "Banco",
    "id_banco": "Banco",
    "id_concepto": "Concepto",
    "id_tipo_doc": "Tipo de Documento",
    "voucher_id": "Voucher Bancario",
    "id_voucher": "Voucher Bancario",
    "id_gasto": "Gasto Asociado",
    "id_pago": "Pago",
    "id_rol": "Rol",
    "id_usuario": "Usuario",
    # Contenedor (MaestroImportacion)
    "numero_factura": "N° de Factura / Orden",
    "n_cont_fisico": "N° Contenedor Físico",
    "documento_transporte": "Doc. de Transporte (BL)",
    "fecha_embarque": "Fecha de Embarque",
    "fecha_arribo": "Fecha de Arribo",
    "status_llegada": "Estado de Llegada",
    "estado_levante": "Estado de Levante",
    "estado_documentario": "Estado Documentario",
    "fecha_levante_maestro": "Fecha de Levante",
    "fecha_recepcion_almacen": "Fecha Recepción Almacén",
    "fob_usd": "FOB (USD)",
    "flete_usd": "Flete (USD)",
    "cfr_usd": "CFR (USD)",
    "venta_sucesiva": "Venta Sucesiva",
    "tipo_valor": "Tipo de Valor",
    # DAM (DetalleDam)
    "numero_de_dam": "N° de DAM",
    "serie": "Serie",
    "canal_control": "Canal de Control",
    "monto_valor_provisional_usd": "Valor Garantizado (USD)",
    "aforo_realizado": "Aforo Realizado",
    "estado_dam": "Estado de la DAM",
    "fecha_levante": "Fecha de Levante",
    # Gasto (RegistroGasto)
    "numero_documento": "N° de Documento",
    "monto_original": "Monto Original",
    "moneda": "Moneda",
    "fecha_vencimiento": "Fecha de Vencimiento",
    "estado_pago": "Estado de Pago",
    "observaciones": "Observaciones",
    # Pago (RegistroPago)
    "importe": "Importe Pagado",
    "tipo_cambio": "Tipo de Cambio",
    "tipo_cambio_aplicado": "TC Aplicado",
    "monto_moneda_origen": "Débito en Voucher",
    "pago_moneda_cruzada": "Moneda Cruzada",
    "gasto_financiero_tc": "Diferencia de Cambio",
    "es_ajuste_sistema": "Ajuste Automático (ZD)",
    "fecha_pago": "Fecha de Pago",
    # Voucher (VoucherBancario)
    "numero_operacion": "N° de Operación",
    "monto_total": "Monto Total",
    "saldo_disponible": "Saldo Disponible",
    "fecha_transferencia": "Fecha de Transferencia",
    # Tipo de Cambio
    "fecha": "Fecha",
    "precio_compra": "Precio Compra (S/)",
    "precio_venta": "Precio Venta (S/)",
    # Catálogos y Usuarios
    "nombre": "Nombre / Razón Social",
    "nombre_documento": "Nombre del Documento",
    "ruc": "RUC",
    "categoria": "Categoría",
    "descripcion": "Descripción",
    "tipo_gasto": "Etapa de Gasto",
    "multiplicador_financiero": "Multiplicador Financiero",
    "username": "Usuario",
    "email": "Correo Electrónico",
    "hashed_password": "Contraseña",
    "is_active": "Usuario Activo",
    "estado_registro": "Estado del Registro",
    # Eventos especiales
    "contenedor": "Contenedor / Factura",
    "motivo": "Motivo",
}

# Clave primaria interna de cada tabla (se omite en la vista de datos para no mostrar números de orden internos)
PK_POR_TABLA = {
    "maestro_importaciones": "id_maestro",
    "detalle_dams": "id_dam",
    "registro_gastos": "id_gasto",
    "registro_pagos": "id_pago",
    "vouchers_bancarios": "id_voucher",
    "cat_importadores": "id_importador",
    "cat_proveedores": "id_proveedor",
    "cat_agentes": "id_agente",
    "cat_almacenes": "id_almacen",
    "cat_bancos": "id_banco",
    "cat_conceptos_pagos": "id_concepto",
    "catalogo_documentos_pago": "id_tipo_doc",
    "cat_roles": "id_rol",
    "usuarios": "id_usuario",
}

CAMPOS_MONTO_2DEC = {
    "monto_original", "importe", "monto_moneda_origen", "monto_total",
    "saldo_disponible", "fob_usd", "flete_usd", "cfr_usd",
    "gasto_financiero_tc", "monto_valor_provisional_usd",
}

ORDEN_PREFERIDO_CAMPOS = [
    "numero_factura", "n_cont_fisico", "numero_de_dam", "id_dam", "id_maestro", "contenedor",
    "id_concepto", "id_gasto", "voucher_id", "id_voucher", "numero_operacion", "banco_id", "id_banco",
    "id_importador", "id_proveedor", "id_agente", "id_almacen",
    "id_tipo_doc", "numero_documento",
    "moneda", "monto_original", "importe", "monto_moneda_origen", "monto_total", "saldo_disponible",
    "tipo_cambio", "tipo_cambio_aplicado", "pago_moneda_cruzada", "gasto_financiero_tc",
    "canal_control", "estado_dam", "aforo_realizado", "fecha_levante",
    "status_llegada", "estado_documentario", "estado_levante", "fecha_levante_maestro", "fecha_recepcion_almacen",
    "tipo_valor", "documento_transporte", "fecha_embarque", "fecha_arribo",
    "fob_usd", "flete_usd", "cfr_usd", "venta_sucesiva",
    "estado_pago", "fecha_pago", "fecha_vencimiento", "fecha_transferencia",
    "nombre", "nombre_documento", "ruc", "categoria", "tipo_gasto", "descripcion",
    "username", "email", "id_rol", "is_active", "hashed_password",
    "fecha", "precio_compra", "precio_venta",
    "observaciones", "motivo", "es_ajuste_sistema", "estado_registro",
]


def _a_int(v):
    if v is None or isinstance(v, bool):
        return None
    try:
        return int(v)
    except (ValueError, TypeError):
        return None


def _fmt_monto(v):
    if v is None or v == "":
        return "∅"
    try:
        return f"{Decimal(str(v)):.2f}"
    except Exception:
        return str(v)


def enriquecer_bitacora(db: Session, filas: list) -> list[dict]:
    """
    Traduce cada fila de `audit_logs` a valores legibles de negocio:
    reemplaza `id_dam`, `id_maestro`, `id_concepto`, `id_proveedor`, `voucher_id`, etc.
    por el número real de DAM, Factura/Contenedor, nombre de Concepto, Proveedor, N° de Voucher, etc.
    """
    if not filas:
        return []

    parsed_list = []
    maestro_ids, dam_ids, gasto_ids, pago_ids, voucher_ids = set(), set(), set(), set(), set()

    def recolectar_ids_de_dict(dic):
        if not isinstance(dic, dict):
            return
        for k, val in dic.items():
            valores_iter = val if isinstance(val, list) else [val]
            for item in valores_iter:
                iv = _a_int(item)
                if iv is None:
                    continue
                if k == "id_maestro":
                    maestro_ids.add(iv)
                elif k == "id_dam":
                    dam_ids.add(iv)
                elif k == "id_gasto":
                    gasto_ids.add(iv)
                elif k == "id_pago":
                    pago_ids.add(iv)
                elif k in ("voucher_id", "id_voucher"):
                    voucher_ids.add(iv)

    for f in filas:
        try:
            d = json.loads(f.detalles) if f.detalles else None
        except Exception:
            d = None
        parsed_list.append(d)
        if not isinstance(d, dict):
            continue
        tabla = d.get("tabla")
        id_pk = _a_int(d.get("id"))
        if id_pk is not None:
            if tabla == "maestro_importaciones":
                maestro_ids.add(id_pk)
            elif tabla == "detalle_dams":
                dam_ids.add(id_pk)
            elif tabla == "registro_gastos":
                gasto_ids.add(id_pk)
            elif tabla == "registro_pagos":
                pago_ids.add(id_pk)
            elif tabla == "vouchers_bancarios":
                voucher_ids.add(id_pk)
        recolectar_ids_de_dict(d)
        recolectar_ids_de_dict(d.get("valores"))
        recolectar_ids_de_dict(d.get("valores_previos"))
        recolectar_ids_de_dict(d.get("cambios"))

    # 1. Catálogos de referencia
    bancos = {b.id_banco: b.nombre for b in db.query(models.CatBanco).all()}
    importadores = {i.id_importador: i.nombre for i in db.query(models.CatImportador).all()}
    proveedores = {p.id_proveedor: p.nombre for p in db.query(models.CatProveedor).all()}
    agentes = {a.id_agente: a.nombre for a in db.query(models.CatAgente).all()}
    almacenes = {a.id_almacen: a.nombre for a in db.query(models.CatAlmacen).all()}
    conceptos = {c.id_concepto: c.nombre for c in db.query(models.CatConceptoPago).all()}
    tipos_doc = {t.id_tipo_doc: t.nombre_documento for t in db.query(models.CatalogoDocumentoPago).all()}
    roles = {r.id_rol: r.nombre for r in db.query(models.CatRol).all()}
    usuarios = {u.id_usuario: u.username for u in db.query(models.Usuario).all()}

    maestros_map = {}
    dams_map = {}
    vouchers_map = {}
    gastos_map = {}
    pagos_map = {}

    # 2. Poblar primero con los snapshots presentes en las propias filas de auditoría (respaldo ante borrados)
    for d in parsed_list:
        if not isinstance(d, dict):
            continue
        tabla = d.get("tabla")
        snap = d.get("valores") or d.get("valores_previos")
        if not isinstance(snap, dict):
            continue
        id_pk = _a_int(d.get("id"))
        if tabla == "cat_bancos" and id_pk and snap.get("nombre"):
            bancos.setdefault(id_pk, snap["nombre"])
        elif tabla == "cat_importadores" and id_pk and snap.get("nombre"):
            importadores.setdefault(id_pk, snap["nombre"])
        elif tabla == "cat_proveedores" and id_pk and snap.get("nombre"):
            proveedores.setdefault(id_pk, snap["nombre"])
        elif tabla == "cat_agentes" and id_pk and snap.get("nombre"):
            agentes.setdefault(id_pk, snap["nombre"])
        elif tabla == "cat_almacenes" and id_pk and snap.get("nombre"):
            almacenes.setdefault(id_pk, snap["nombre"])
        elif tabla == "cat_conceptos_pagos" and id_pk and snap.get("nombre"):
            conceptos.setdefault(id_pk, snap["nombre"])
        elif tabla == "catalogo_documentos_pago" and id_pk and snap.get("nombre_documento"):
            tipos_doc.setdefault(id_pk, snap["nombre_documento"])
        elif tabla == "usuarios" and id_pk and snap.get("username"):
            usuarios.setdefault(id_pk, snap["username"])
        elif tabla == "maestro_importaciones" and id_pk:
            maestros_map[id_pk] = {
                "factura": snap.get("numero_factura"),
                "contenedor": snap.get("n_cont_fisico"),
            }
        elif tabla == "detalle_dams" and id_pk:
            idm = _a_int(snap.get("id_maestro"))
            if idm:
                maestro_ids.add(idm)
            dams_map[id_pk] = {"numero": snap.get("numero_de_dam"), "id_maestro": idm}
        elif tabla == "vouchers_bancarios" and id_pk:
            vouchers_map[id_pk] = {
                "operacion": snap.get("numero_operacion"),
                "banco_id": _a_int(snap.get("banco_id")),
                "id_importador": _a_int(snap.get("id_importador")),
                "moneda": snap.get("moneda"),
                "monto": snap.get("monto_total"),
            }
        elif tabla == "registro_gastos" and id_pk:
            idd = _a_int(snap.get("id_dam"))
            if idd:
                dam_ids.add(idd)
            gastos_map[id_pk] = {
                "id_dam": idd,
                "id_concepto": _a_int(snap.get("id_concepto")),
                "id_proveedor": _a_int(snap.get("id_proveedor")),
                "id_tipo_doc": _a_int(snap.get("id_tipo_doc")),
                "documento": snap.get("numero_documento"),
                "moneda": snap.get("moneda"),
                "monto": snap.get("monto_original"),
            }
        elif tabla == "registro_pagos" and id_pk:
            idd = _a_int(snap.get("id_dam"))
            idg = _a_int(snap.get("id_gasto"))
            idv = _a_int(snap.get("voucher_id"))
            if idd:
                dam_ids.add(idd)
            if idg:
                gasto_ids.add(idg)
            if idv:
                voucher_ids.add(idv)
            pagos_map[id_pk] = {
                "id_dam": idd,
                "id_concepto": _a_int(snap.get("id_concepto")),
                "id_gasto": idg,
                "voucher_id": idv,
                "id_importador": _a_int(snap.get("id_importador")),
                "moneda": snap.get("moneda"),
                "importe": snap.get("importe"),
                "es_ajuste": bool(snap.get("es_ajuste_sistema")),
            }

    # 3. Consultas en cascada: Pagos -> Gastos / Vouchers -> DAMs -> Maestros (tablas vivas y tablas sombra)
    if pago_ids:
        for p in db.query(models.PagoEliminado).filter(models.PagoEliminado.id_pago.in_(pago_ids)).all():
            if p.id_dam:
                dam_ids.add(p.id_dam)
            if p.id_gasto:
                gasto_ids.add(p.id_gasto)
            if p.voucher_id:
                voucher_ids.add(p.voucher_id)
            if isinstance(p.detalles_legibles, dict):
                if p.id_importador and p.detalles_legibles.get("Importador") not in (None, "", "N/A"):
                    importadores.setdefault(p.id_importador, p.detalles_legibles["Importador"])
                if p.id_concepto and p.detalles_legibles.get("Concepto") not in (None, "", "N/A"):
                    conceptos.setdefault(p.id_concepto, p.detalles_legibles["Concepto"])
            pagos_map[p.id_pago] = {
                "id_dam": p.id_dam,
                "id_concepto": p.id_concepto,
                "id_gasto": p.id_gasto,
                "voucher_id": p.voucher_id,
                "id_importador": p.id_importador,
                "moneda": p.moneda,
                "importe": _fmt_monto(p.importe),
                "es_ajuste": bool(p.es_ajuste_sistema),
            }
        for p in db.query(models.RegistroPago).filter(models.RegistroPago.id_pago.in_(pago_ids)).all():
            if p.id_dam:
                dam_ids.add(p.id_dam)
            if p.id_gasto:
                gasto_ids.add(p.id_gasto)
            if p.voucher_id:
                voucher_ids.add(p.voucher_id)
            pagos_map[p.id_pago] = {
                "id_dam": p.id_dam,
                "id_concepto": p.id_concepto,
                "id_gasto": p.id_gasto,
                "voucher_id": p.voucher_id,
                "id_importador": p.id_importador,
                "moneda": p.moneda,
                "importe": _fmt_monto(p.importe),
                "es_ajuste": bool(p.es_ajuste_sistema),
            }

    if gasto_ids:
        for g in db.query(models.GastoEliminado).filter(models.GastoEliminado.id_gasto.in_(gasto_ids)).all():
            if g.id_dam:
                dam_ids.add(g.id_dam)
            if isinstance(g.detalles_legibles, dict):
                if g.id_proveedor and g.detalles_legibles.get("Proveedor") not in (None, "", "N/A"):
                    proveedores.setdefault(g.id_proveedor, g.detalles_legibles["Proveedor"])
                if g.id_concepto and g.detalles_legibles.get("Concepto") not in (None, "", "N/A"):
                    conceptos.setdefault(g.id_concepto, g.detalles_legibles["Concepto"])
                if g.id_tipo_doc and g.detalles_legibles.get("Tipo Documento") not in (None, "", "N/A"):
                    tipos_doc.setdefault(g.id_tipo_doc, g.detalles_legibles["Tipo Documento"])
            gastos_map[g.id_gasto] = {
                "id_dam": g.id_dam,
                "id_concepto": g.id_concepto,
                "id_proveedor": g.id_proveedor,
                "id_tipo_doc": g.id_tipo_doc,
                "documento": g.numero_documento,
                "moneda": g.moneda,
                "monto": _fmt_monto(g.monto_original),
            }
        for g in db.query(models.RegistroGasto).filter(models.RegistroGasto.id_gasto.in_(gasto_ids)).all():
            if g.id_dam:
                dam_ids.add(g.id_dam)
            gastos_map[g.id_gasto] = {
                "id_dam": g.id_dam,
                "id_concepto": g.id_concepto,
                "id_proveedor": g.id_proveedor,
                "id_tipo_doc": g.id_tipo_doc,
                "documento": g.numero_documento,
                "moneda": g.moneda,
                "monto": _fmt_monto(g.monto_original),
            }

    # Respaldo adicional desde tablas sombra para catálogos que hayan sido eliminados físicamente en el pasado
    for g_el in db.query(models.GastoEliminado).all():
        if isinstance(g_el.detalles_legibles, dict):
            if g_el.id_proveedor and g_el.detalles_legibles.get("Proveedor") not in (None, "", "N/A"):
                proveedores.setdefault(g_el.id_proveedor, g_el.detalles_legibles["Proveedor"])
            if g_el.id_concepto and g_el.detalles_legibles.get("Concepto") not in (None, "", "N/A"):
                conceptos.setdefault(g_el.id_concepto, g_el.detalles_legibles["Concepto"])
            if g_el.id_tipo_doc and g_el.detalles_legibles.get("Tipo Documento") not in (None, "", "N/A"):
                tipos_doc.setdefault(g_el.id_tipo_doc, g_el.detalles_legibles["Tipo Documento"])

    for v_el in db.query(models.VoucherEliminado).all():
        if isinstance(v_el.detalles_legibles, dict):
            if v_el.banco_id and v_el.detalles_legibles.get("Banco") not in (None, "", "N/A"):
                bancos.setdefault(v_el.banco_id, v_el.detalles_legibles["Banco"])
            if getattr(v_el, "id_importador", None) and v_el.detalles_legibles.get("Importador") not in (None, "", "N/A"):
                importadores.setdefault(v_el.id_importador, v_el.detalles_legibles["Importador"])

    if voucher_ids:
        for v in db.query(models.VoucherEliminado).filter(models.VoucherEliminado.id_voucher.in_(voucher_ids)).all():
            vouchers_map[v.id_voucher] = {
                "operacion": v.numero_operacion,
                "banco_id": v.banco_id,
                "id_importador": getattr(v, "id_importador", None),
                "moneda": v.moneda,
                "monto": _fmt_monto(v.monto_total),
            }
        for v in db.query(models.VoucherBancario).filter(models.VoucherBancario.id_voucher.in_(voucher_ids)).all():
            vouchers_map[v.id_voucher] = {
                "operacion": v.numero_operacion,
                "banco_id": v.banco_id,
                "id_importador": v.id_importador,
                "moneda": v.moneda,
                "monto": _fmt_monto(v.monto_total),
            }

    if dam_ids:
        for dm in db.query(models.DamEliminada).filter(models.DamEliminada.id_dam.in_(dam_ids)).all():
            if dm.id_maestro:
                maestro_ids.add(dm.id_maestro)
            dams_map[dm.id_dam] = {"numero": dm.numero_de_dam, "id_maestro": dm.id_maestro}
        for dm in db.query(models.DetalleDam).filter(models.DetalleDam.id_dam.in_(dam_ids)).all():
            if dm.id_maestro:
                maestro_ids.add(dm.id_maestro)
            dams_map[dm.id_dam] = {"numero": dm.numero_de_dam, "id_maestro": dm.id_maestro}

    if maestro_ids:
        for m in db.query(models.MaestroEliminado).filter(models.MaestroEliminado.id_maestro.in_(maestro_ids)).all():
            maestros_map[m.id_maestro] = {"factura": m.numero_factura, "contenedor": m.n_cont_fisico}
        for m in db.query(models.MaestroImportacion).filter(models.MaestroImportacion.id_maestro.in_(maestro_ids)).all():
            maestros_map[m.id_maestro] = {"factura": m.numero_factura, "contenedor": m.n_cont_fisico}

    # 4. Formateadores de entidades a texto legible
    def fmt_maestro(id_m):
        iv = _a_int(id_m)
        info = maestros_map.get(iv) if iv is not None else None
        if not info:
            return str(id_m) if id_m is not None else "∅"
        fac = info.get("factura")
        cont = info.get("contenedor")
        if fac and cont:
            return f"{fac} (Cont. {cont})"
        return fac or cont or str(id_m)

    def fmt_dam(id_d):
        iv = _a_int(id_d)
        info = dams_map.get(iv) if iv is not None else None
        if not info or not info.get("numero"):
            return str(id_d) if id_d is not None else "∅"
        num = info["numero"]
        m_info = maestros_map.get(info.get("id_maestro"))
        fac = m_info.get("factura") if m_info else None
        return f"{num} (Fact. {fac})" if fac else num

    def fmt_voucher(id_v):
        iv = _a_int(id_v)
        info = vouchers_map.get(iv) if iv is not None else None
        if not info or not info.get("operacion"):
            return str(id_v) if id_v is not None else "∅"
        op = info["operacion"]
        banco = bancos.get(info.get("banco_id"))
        return f"Op. {op} ({banco})" if banco else f"Op. {op}"

    def fmt_gasto(id_g, incluir_dam=False):
        iv = _a_int(id_g)
        info = gastos_map.get(iv) if iv is not None else None
        if not info:
            return str(id_g) if id_g is not None else "∅"
        conc = conceptos.get(info.get("id_concepto")) or "Gasto"
        mon = info.get("moneda") or ""
        mto = _fmt_monto(info.get("monto")) if info.get("monto") is not None else ""
        doc = info.get("documento")
        partes = [f"{conc} ({mon} {mto})".strip()]
        if doc:
            partes.append(f"Doc. {doc}")
        if incluir_dam and info.get("id_dam"):
            partes.append(f"DAM {fmt_dam(info['id_dam'])}")
        return " · ".join(partes)

    def fmt_pago(id_p):
        iv = _a_int(id_p)
        info = pagos_map.get(iv) if iv is not None else None
        if not info:
            return str(id_p) if id_p is not None else "∅"
        mon = info.get("moneda") or ""
        imp = _fmt_monto(info.get("importe")) if info.get("importe") is not None else ""
        conc = conceptos.get(info.get("id_concepto"))
        partes = [f"{mon} {imp}".strip()]
        if conc:
            partes.append(conc)
        if info.get("voucher_id"):
            partes.append(fmt_voucher(info["voucher_id"]))
        elif info.get("es_ajuste"):
            partes.append("Ajuste ZD")
        if info.get("id_dam"):
            partes.append(f"DAM {fmt_dam(info['id_dam'])}")
        return " · ".join(partes)

    def fmt_valor_campo(campo, valor):
        if valor is None or valor == "":
            return "∅"
        if isinstance(valor, bool):
            return "Sí" if valor else "No"
        iv = _a_int(valor)
        if campo == "id_dam":
            return fmt_dam(valor)
        if campo == "id_maestro":
            return fmt_maestro(valor)
        if campo == "id_importador":
            return importadores.get(iv, str(valor))
        if campo == "id_proveedor":
            return proveedores.get(iv, str(valor))
        if campo == "id_agente":
            return agentes.get(iv, str(valor))
        if campo == "id_almacen":
            return almacenes.get(iv, str(valor))
        if campo in ("banco_id", "id_banco"):
            return bancos.get(iv, str(valor))
        if campo == "id_concepto":
            return conceptos.get(iv, str(valor))
        if campo == "id_tipo_doc":
            return tipos_doc.get(iv, str(valor))
        if campo in ("voucher_id", "id_voucher"):
            return fmt_voucher(valor)
        if campo == "id_gasto":
            return fmt_gasto(valor, incluir_dam=False)
        if campo == "id_pago":
            return fmt_pago(valor)
        if campo == "id_rol":
            return roles.get(iv, str(valor))
        if campo == "id_usuario":
            return usuarios.get(iv, str(valor))
        if campo in CAMPOS_MONTO_2DEC:
            return _fmt_monto(valor)
        return str(valor)

    def construir_identificador_tabla(tabla, id_reg, snap):
        snap = snap if isinstance(snap, dict) else {}
        if tabla == "maestro_importaciones":
            fac = snap.get("numero_factura")
            cont = snap.get("n_cont_fisico")
            if not fac and id_reg is not None:
                return f"Contenedor / Factura {fmt_maestro(id_reg)}"
            return f"Factura {fac}" + (f" (Cont. {cont})" if cont else "")
        if tabla == "detalle_dams":
            num = snap.get("numero_de_dam")
            idm = snap.get("id_maestro")
            if not num and id_reg is not None:
                return f"DAM {fmt_dam(id_reg)}"
            fac_str = fmt_maestro(idm) if idm else None
            return f"DAM {num}" + (f" · Fact. {fac_str}" if fac_str and fac_str != "∅" else "")
        if tabla == "registro_gastos":
            if not snap and id_reg is not None:
                return f"Gasto {fmt_gasto(id_reg, incluir_dam=True)}"
            conc = fmt_valor_campo("id_concepto", snap.get("id_concepto"))
            mon = snap.get("moneda") or ""
            mto = _fmt_monto(snap.get("monto_original"))
            doc = snap.get("numero_documento")
            dam_s = fmt_dam(snap.get("id_dam")) if snap.get("id_dam") else None
            id_prov = _a_int(snap.get("id_proveedor"))
            prov_s = proveedores.get(id_prov) if id_prov else None
            if not prov_s and any(p in conc.upper() for p in ("TRIBUTO", "PERCEPCI", "OMC", "MULTA", "ARANCEL")):
                prov_s = "SUNAT"
            partes = []
            if dam_s and dam_s != "∅" and not dam_s.isdigit():
                partes.append(f"DAM {dam_s}")
            partes.append(f"{conc} · {mon} {mto}".strip())
            if doc:
                partes.append(f"Doc. {doc}")
            if prov_s:
                partes.append(prov_s)
            return " · ".join(partes)
        if tabla == "registro_pagos":
            if not snap and id_reg is not None:
                return f"Pago {fmt_pago(id_reg)}"
            # Completar id_dam / id_concepto / id_importador desde el gasto o voucher si no venían en el payload
            idg = _a_int(snap.get("id_gasto"))
            idv = _a_int(snap.get("voucher_id"))
            g_info = gastos_map.get(idg) if idg else None
            id_dam_res = snap.get("id_dam") or (g_info.get("id_dam") if g_info else None)
            id_conc_res = snap.get("id_concepto") or (g_info.get("id_concepto") if g_info else None)
            mon = snap.get("moneda") or ""
            imp = _fmt_monto(snap.get("importe"))
            partes = []
            if id_dam_res:
                partes.append(f"DAM {fmt_dam(id_dam_res)}")
            if id_conc_res:
                partes.append(fmt_valor_campo("id_concepto", id_conc_res))
            partes.append(f"Pago {mon} {imp}".strip())
            if idv:
                partes.append(fmt_voucher(idv))
            elif snap.get("es_ajuste_sistema"):
                partes.append("Ajuste ZD")
            return " · ".join(partes)
        if tabla == "vouchers_bancarios":
            op = snap.get("numero_operacion")
            if not op and id_reg is not None:
                return f"Voucher {fmt_voucher(id_reg)}"
            bco = fmt_valor_campo("banco_id", snap.get("banco_id")) if snap.get("banco_id") else None
            imp_nom = fmt_valor_campo("id_importador", snap.get("id_importador")) if snap.get("id_importador") else None
            mon = snap.get("moneda") or ""
            mto = _fmt_monto(snap.get("monto_total")) if snap.get("monto_total") is not None else ""
            partes = [f"Voucher Op. {op}" + (f" ({bco})" if bco and bco != "∅" else "")]
            if mon and mto and mto != "∅":
                partes.append(f"{mon} {mto}")
            if imp_nom and imp_nom != "∅":
                partes.append(imp_nom)
            return " · ".join(partes)
        if tabla == "historial_tipo_cambio":
            f_tc = snap.get("fecha") or id_reg
            return f"Tipo de Cambio del {f_tc}"
        if tabla in ("cat_importadores", "cat_proveedores", "cat_agentes", "cat_almacenes", "cat_bancos", "cat_conceptos_pagos"):
            mapa_cat = {
                "cat_importadores": ("Importador", importadores),
                "cat_proveedores": ("Proveedor", proveedores),
                "cat_agentes": ("Agente", agentes),
                "cat_almacenes": ("Almacén", almacenes),
                "cat_bancos": ("Banco", bancos),
                "cat_conceptos_pagos": ("Concepto", conceptos),
            }
            etq, mp = mapa_cat[tabla]
            nom = snap.get("nombre") or mp.get(_a_int(id_reg)) or str(id_reg)
            ruc = snap.get("ruc")
            return f"{etq}: {nom}" + (f" (RUC {ruc})" if ruc else "")
        if tabla == "catalogo_documentos_pago":
            nom = snap.get("nombre_documento") or tipos_doc.get(_a_int(id_reg)) or str(id_reg)
            return f"Tipo de Documento: {nom}"
        if tabla == "cat_roles":
            nom = snap.get("nombre") or roles.get(_a_int(id_reg)) or str(id_reg)
            return f"Rol: {nom}"
        if tabla == "usuarios":
            usr = snap.get("username") or usuarios.get(_a_int(id_reg)) or str(id_reg)
            em = snap.get("email")
            return f"Usuario: {usr}" + (f" ({em})" if em else "")
        return f"{tabla} {id_reg}"

    def ordenar_claves(claves):
        orden_idx = {k: idx for idx, k in enumerate(ORDEN_PREFERIDO_CAMPOS)}
        return sorted(claves, key=lambda k: (orden_idx.get(k, 999), k))

    CAMPOS_FK = {
        "id_dam", "id_maestro", "id_importador", "id_proveedor", "id_agente",
        "id_almacen", "banco_id", "id_banco", "id_concepto", "id_tipo_doc",
        "voucher_id", "id_voucher", "id_gasto", "id_pago", "id_rol", "id_usuario",
    }

    def construir_lista_datos(tabla, dic):
        if not isinstance(dic, dict):
            return []
        datos = dict(dic)
        # Si es un pago cuyo payload tenía id_dam o id_concepto en null, completarlos desde su gasto/voucher
        if tabla == "registro_pagos":
            idg = _a_int(datos.get("id_gasto"))
            idv = _a_int(datos.get("voucher_id"))
            g_info = gastos_map.get(idg) if idg else None
            v_info = vouchers_map.get(idv) if idv else None
            if not datos.get("id_dam") and g_info and g_info.get("id_dam"):
                datos["id_dam"] = g_info["id_dam"]
            if not datos.get("id_concepto") and g_info and g_info.get("id_concepto"):
                datos["id_concepto"] = g_info["id_concepto"]
            if not datos.get("id_importador") and v_info and v_info.get("id_importador"):
                datos["id_importador"] = v_info["id_importador"]

        conc_str = fmt_valor_campo("id_concepto", datos.get("id_concepto")).upper() if datos.get("id_concepto") else ""
        es_concepto_sunat = any(p in conc_str for p in ("TRIBUTO", "PERCEPCI", "OMC", "MULTA", "ARANCEL"))

        pk_propia = PK_POR_TABLA.get(tabla)
        items = []
        for k in ordenar_claves(list(datos.keys())):
            if k == pk_propia or k in CAMPOS_IGNORADOS:
                continue
            val = datos[k]
            if val is None or val == "":
                continue
            if k == "tipo_cambio_aplicado" and datos.get("tipo_cambio") is not None and str(val) == str(datos.get("tipo_cambio")):
                continue
            val_fmt = fmt_valor_campo(k, val)
            if k in CAMPOS_FK and val_fmt == str(val) and str(val).isdigit():
                if k == "id_proveedor" and es_concepto_sunat:
                    val_fmt = "SUNAT"
                elif k == "id_tipo_doc" and es_concepto_sunat:
                    val_fmt = "LIQUIDACIÓN DE COBRANZA / SUNAT"
                else:
                    continue
            items.append({
                "campo": ETIQUETAS_CAMPOS.get(k, k.replace("_", " ").capitalize()),
                "valor": val_fmt,
            })
        return items

    resultado = []
    for f, d in zip(filas, parsed_list):
        identificador = f.accion
        resumen = f.detalles or ""
        cambios_legibles = []
        datos_legibles = []

        if isinstance(d, dict):
            # Caso 1: Evento automático de audit_trail (tiene 'tabla')
            if d.get("tabla"):
                tabla = d["tabla"]
                id_reg = d.get("id")
                snap = d.get("valores") or d.get("valores_previos") or {}
                identificador = construir_identificador_tabla(tabla, id_reg, snap)

                if isinstance(d.get("cambios"), dict):
                    partes_resumen = []
                    for k in ordenar_claves(list(d["cambios"].keys())):
                        par = d["cambios"][k]
                        antes, despues = (par[0], par[1]) if isinstance(par, list) and len(par) == 2 else (None, par)
                        etq = ETIQUETAS_CAMPOS.get(k, k.replace("_", " ").capitalize())
                        v_ant = fmt_valor_campo(k, antes)
                        v_des = fmt_valor_campo(k, despues)
                        cambios_legibles.append({"campo": etq, "antes": v_ant, "despues": v_des})
                        partes_resumen.append(f"{etq}: {v_ant} → {v_des}")
                    resumen = f"{identificador} · " + " | ".join(partes_resumen) if partes_resumen else identificador
                else:
                    datos_legibles = construir_lista_datos(tabla, snap)
                    resumen = identificador

            # Caso 2: CAMBIO ESTADO DAM
            elif f.accion == "CAMBIO ESTADO DAM" or ("estado_anterior" in d and "id_dam" in d and "motivo" not in d):
                dam_s = fmt_dam(d.get("id_dam"))
                identificador = f"DAM {dam_s}"
                partes_c = []
                if d.get("estado_anterior") != d.get("estado_nuevo"):
                    cambios_legibles.append({
                        "campo": "Estado de la DAM",
                        "antes": str(d.get("estado_anterior") or "∅"),
                        "despues": str(d.get("estado_nuevo") or "∅"),
                    })
                    partes_c.append(f"Estado: {d.get('estado_anterior')} → {d.get('estado_nuevo')}")
                if d.get("aforo_anterior") != d.get("aforo_nuevo"):
                    ant_af = "Sí" if d.get("aforo_anterior") else "No"
                    nue_af = "Sí" if d.get("aforo_nuevo") else "No"
                    cambios_legibles.append({"campo": "Aforo Realizado", "antes": ant_af, "despues": nue_af})
                    partes_c.append(f"Aforo: {ant_af} → {nue_af}")
                resumen = f"{identificador} · " + " | ".join(partes_c) if partes_c else identificador

            # Caso 3: REVERSION AUTOMATICA DAM
            elif f.accion == "REVERSION AUTOMATICA DAM" or ("motivo" in d and "estado_anterior" in d):
                num_dam = d.get("numero_de_dam") or fmt_dam(d.get("id_dam"))
                cont = d.get("contenedor")
                identificador = f"DAM {num_dam}" + (f" (Fact. {cont})" if cont else "")
                cambios_legibles.append({
                    "campo": "Estado de la DAM",
                    "antes": str(d.get("estado_anterior") or "∅"),
                    "despues": str(d.get("estado_nuevo") or "∅"),
                })
                if d.get("motivo"):
                    datos_legibles.append({"campo": "Motivo de Reversión", "valor": str(d["motivo"])})
                resumen = f"{identificador} · {d.get('estado_anterior')} → {d.get('estado_nuevo')}" + (f" · {d.get('motivo')}" if d.get("motivo") else "")

            # Caso 4: EDICION FECHA PAGO
            elif f.accion == "EDICION FECHA PAGO" or ("id_pago" in d and "fecha_nueva" in d):
                pago_s = fmt_pago(d.get("id_pago"))
                identificador = f"Pago {pago_s}"
                cambios_legibles.append({
                    "campo": "Fecha de Pago",
                    "antes": str(d.get("fecha_anterior") or "∅"),
                    "despues": str(d.get("fecha_nueva") or "∅"),
                })
                resumen = f"{identificador} · Fecha de Pago: {d.get('fecha_anterior')} → {d.get('fecha_nueva')}"

            # Caso 5: REGISTRO / CORRECCION TIPO CAMBIO
            elif "TIPO CAMBIO" in (f.accion or "") or ("nuevo" in d and "fecha" in d):
                fecha_tc = d.get("fecha") or ""
                identificador = f"Tipo de Cambio del {fecha_tc}"
                ant = d.get("anterior")
                nue = d.get("nuevo") or {}
                if isinstance(ant, dict):
                    cambios_legibles.append({"campo": "Precio Compra (S/)", "antes": str(ant.get("compra", "∅")), "despues": str(nue.get("compra", "∅"))})
                    cambios_legibles.append({"campo": "Precio Venta (S/)", "antes": str(ant.get("venta", "∅")), "despues": str(nue.get("venta", "∅"))})
                    resumen = f"{identificador} · Compra: {ant.get('compra')} → {nue.get('compra')} | Venta: {ant.get('venta')} → {nue.get('venta')}"
                else:
                    datos_legibles.append({"campo": "Fecha", "valor": str(fecha_tc)})
                    datos_legibles.append({"campo": "Precio Compra (S/)", "valor": str(nue.get("compra", "∅"))})
                    datos_legibles.append({"campo": "Precio Venta (S/)", "valor": str(nue.get("venta", "∅"))})
                    resumen = f"{identificador} · Compra: {nue.get('compra')} / Venta: {nue.get('venta')}"

            # Caso 6: CREACION GASTO (histórico / manual)
            elif f.accion == "CREACION GASTO" or ("id_concepto" in d and "monto_original" in d):
                identificador = construir_identificador_tabla("registro_gastos", None, d)
                datos_legibles = construir_lista_datos("registro_gastos", d)
                resumen = identificador

            # Caso 7: CREACION PAGO (histórico / manual)
            elif f.accion == "CREACION PAGO" or ("id_gasto" in d and "importe" in d):
                identificador = construir_identificador_tabla("registro_pagos", None, d)
                datos_legibles = construir_lista_datos("registro_pagos", d)
                resumen = identificador

            # Caso genérico de cualquier otro JSON
            else:
                datos_legibles = construir_lista_datos("", d)
                resumen = " · ".join(f"{x['campo']}: {x['valor']}" for x in datos_legibles[:4]) or (f.detalles or "")

        resultado.append({
            "id_log": f.id_log,
            "id_usuario": f.id_usuario,
            "nombre_usuario": f.usuario.username if f.usuario else None,
            "endpoint": f.endpoint,
            "accion": f.accion,
            "ip_address": f.ip_address,
            "detalles": f.detalles,
            "created_at": f.created_at,
            "resumen_legible": resumen,
            "detalles_legibles": {
                "identificador": identificador,
                "cambios": cambios_legibles,
                "datos": datos_legibles,
            },
        })

    return resultado

