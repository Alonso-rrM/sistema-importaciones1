"""
Bitácora de acciones (tabla audit_logs): quién hizo qué, desde dónde y cuándo.

No hace commit: el registro queda en la misma transacción que la operación que lo origina, así que
si la operación se deshace, su registro también. (services/audit_trail.py guarda, aparte, el detalle
campo por campo de los cambios.)
"""
from sqlalchemy.orm import Session

import models


def registrar_auditoria_sync(db: Session, id_usuario: int, endpoint: str, accion: str, detalles: str, ip_address: str):
    """Agrega el registro a la sesión actual (lo confirma el commit de la operación llamadora)."""
    db.add(models.AuditLog(
        id_usuario=id_usuario,
        endpoint=endpoint,
        accion=accion,
        detalles=detalles,
        ip_address=ip_address,
    ))
    db.flush()


async def registrar_auditoria(db: Session, id_usuario: int, endpoint: str, accion: str, detalles: str, ip_address: str):
    """Igual que registrar_auditoria_sync, para rutas `async def`."""
    registrar_auditoria_sync(db, id_usuario, endpoint, accion, detalles, ip_address)
