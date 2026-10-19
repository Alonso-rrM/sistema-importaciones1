from sqlalchemy.orm import Session
import models

async def registrar_auditoria(
    db: Session, 
    id_usuario: int, 
    endpoint: str, 
    accion: str, 
    detalles: str, 
    ip_address: str
):
    """Bitácora de Auditoría Atómica (Servicio transversal de persistencia)."""
    nuevo_log = models.AuditLog(
        id_usuario=id_usuario,
        endpoint=endpoint,
        accion=accion,
        detalles=detalles,
        ip_address=ip_address
    )
    db.add(nuevo_log)
    db.flush()
