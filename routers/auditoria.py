"""Consulta de la bitácora de cambios y de los registros eliminados (tablas sombra)."""
import json
import re
from datetime import date, datetime, time
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

import models
import schemas
from constantes import AccionAuditoria, ROLES_AUDITORIA
from dependencies import get_db, RoleChecker
from services.audit_trail import enriquecer_bitacora

router = APIRouter()


@router.get("/auditoria/", response_model=List[schemas.AuditLog], tags=["Auditoria"])
def listar_auditoria(
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    accion: Optional[str] = Query(None, max_length=100, description="Texto contenido en la acción, ej. 'MODIFICACION Pago'"),
    tabla: Optional[str] = Query(None, max_length=60, description="Tabla afectada, ej. 'registro_pagos'"),
    id_registro: Optional[int] = Query(None, description="ID del registro afectado (requiere 'tabla')"),
    buscar: Optional[str] = Query(None, max_length=120, description="Texto a buscar en valores legibles (DAM, Factura, Voucher, Concepto...)"),
    id_usuario: Optional[int] = None,
    fecha_desde: Optional[date] = None,
    fecha_hasta: Optional[date] = None,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(RoleChecker(ROLES_AUDITORIA))
):
    """Bitácora de eventos con filtros. Permite reconstruir la historia completa de un registro."""
    q = db.query(models.AuditLog)
    if accion:
        q = q.filter(models.AuditLog.accion.ilike(f"%{accion.strip()}%"))
    if tabla:
        if not re.fullmatch(r"[a-z_]{1,60}", tabla):
            raise HTTPException(status_code=400, detail="Nombre de tabla inválido.")
        if id_registro is not None:
            q = q.filter(models.AuditLog.detalles.like(f'%"tabla": "{tabla}", "id": {id_registro},%'))
        elif tabla == "registro_gastos":
            q = q.filter(models.AuditLog.detalles.like(f'%"tabla": "{tabla}"%') | (models.AuditLog.accion == AccionAuditoria.CREACION_GASTO))
        elif tabla == "registro_pagos":
            q = q.filter(models.AuditLog.detalles.like(f'%"tabla": "{tabla}"%') | models.AuditLog.accion.in_([AccionAuditoria.CREACION_PAGO, AccionAuditoria.EDICION_FECHA_PAGO]))
        elif tabla == "detalle_dams":
            q = q.filter(models.AuditLog.detalles.like(f'%"tabla": "{tabla}"%') | models.AuditLog.accion.in_([AccionAuditoria.CAMBIO_ESTADO_DAM, AccionAuditoria.REVERSION_AUTOMATICA_DAM]))
        elif tabla == "historial_tipo_cambio":
            q = q.filter(models.AuditLog.detalles.like(f'%"tabla": "{tabla}"%') | models.AuditLog.accion.like("%TIPO CAMBIO%"))
        else:
            q = q.filter(models.AuditLog.detalles.like(f'%"tabla": "{tabla}"%'))
    if id_usuario is not None:
        q = q.filter(models.AuditLog.id_usuario == id_usuario)
    if fecha_desde:
        q = q.filter(models.AuditLog.created_at >= datetime.combine(fecha_desde, time.min))
    if fecha_hasta:
        q = q.filter(models.AuditLog.created_at <= datetime.combine(fecha_hasta, time.max))
    filas = (
        q.options(joinedload(models.AuditLog.usuario))
        .order_by(models.AuditLog.created_at.desc(), models.AuditLog.id_log.desc())
        .offset(offset).limit(limit).all()
    )
    enriquecidos = enriquecer_bitacora(db, filas)
    if buscar and buscar.strip():
        termino = buscar.strip().lower()
        enriquecidos = [
            item for item in enriquecidos
            if termino in (item.get("resumen_legible") or "").lower()
            or termino in (item.get("accion") or "").lower()
            or termino in (item.get("nombre_usuario") or "").lower()
            or termino in json.dumps(item.get("detalles_legibles") or {}, ensure_ascii=False).lower()
        ]
    return enriquecidos


@router.get("/auditoria/maestros/", response_model=List[schemas.MaestroEliminadoResponse], tags=["Auditoria"])
def listar_auditoria_maestros(db: Session = Depends(get_db), current_user: models.Usuario = Depends(RoleChecker(ROLES_AUDITORIA))):
    return db.query(models.MaestroEliminado).order_by(models.MaestroEliminado.fecha_eliminacion.desc()).all()


@router.get("/auditoria/dams/", response_model=List[schemas.DamEliminadaResponse], tags=["Auditoria"])
def listar_auditoria_dams(db: Session = Depends(get_db), current_user: models.Usuario = Depends(RoleChecker(ROLES_AUDITORIA))):
    return db.query(models.DamEliminada).order_by(models.DamEliminada.fecha_eliminacion.desc()).all()


@router.get("/auditoria/gastos/", response_model=List[schemas.GastoEliminadoResponse], tags=["Auditoria"])
def listar_auditoria_gastos(db: Session = Depends(get_db), current_user: models.Usuario = Depends(RoleChecker(ROLES_AUDITORIA))):
    return db.query(models.GastoEliminado).order_by(models.GastoEliminado.fecha_eliminacion.desc()).all()


@router.get("/auditoria/pagos/", response_model=List[schemas.PagoEliminadoResponse], tags=["Auditoria"])
def listar_auditoria_pagos(db: Session = Depends(get_db), current_user: models.Usuario = Depends(RoleChecker(ROLES_AUDITORIA))):
    return db.query(models.PagoEliminado).order_by(models.PagoEliminado.fecha_eliminacion.desc()).all()


@router.get("/auditoria/vouchers/", response_model=List[schemas.VoucherEliminadoResponse], tags=["Auditoria"])
def listar_auditoria_vouchers(db: Session = Depends(get_db), current_user: models.Usuario = Depends(RoleChecker(ROLES_AUDITORIA))):
    return db.query(models.VoucherEliminado).order_by(models.VoucherEliminado.fecha_eliminacion.desc()).all()
