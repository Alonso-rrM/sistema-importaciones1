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
