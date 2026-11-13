from typing import List, Optional
from decimal import Decimal
import json
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, joinedload
from sqlalchemy.orm.exc import StaleDataError
from sqlalchemy import func

import models
from domain.finanzas import amortizacion_de_pago
from services.errores import error_interno
import schemas
from dependencies import get_db, get_current_user, RoleChecker
from services.audit import registrar_auditoria, registrar_auditoria_sync
from services.state_machine import sincronizar_estado_maestro
from services.excel_exporter import (
    generar_excel_maestros,
    generar_excel_dams,
    generar_excel_liquidacion_contenedor
)
from constantes import (
    AccionAuditoria,
    CanalControl,
    EstadoDam,
    EstadoDocumentario,
    EstadoLevante,
    EstadoPago,
    EstadoRegistro,
    Moneda,
    ROLES_OPERACIONES,
    Rol,
    StatusLlegada,
    TipoGasto,
    TipoValor,
)

router = APIRouter(tags=["Operaciones"])

# --- PATRÓN STRATEGY PARA VALIDACIÓN DE DAMS ---

def validar_dam_definitiva(dam: schemas.DetalleDamCreate):
    dam.monto_valor_provisional_usd = None
    return dam

def validar_dam_garantizada(dam: schemas.DetalleDamCreate):
    if not dam.monto_valor_provisional_usd or dam.monto_valor_provisional_usd <= Decimal('0'):
        raise HTTPException(
            status_code=400, 
            detail="Operación rechazada. Como el Maestro es 'GARANTIZADO', el monto de valor garantizado es obligatorio y debe ser mayor a 0."
        )
    return dam

ESTRATEGIAS_VALIDACION_DAM = {
    TipoValor.DEFINITIVO: validar_dam_definitiva,
    TipoValor.GARANTIZADO: validar_dam_garantizada,
    TipoValor.PROVISIONAL: validar_dam_garantizada  # Retrocompatibilidad
}

# --- MÁQUINA DE ESTADOS DAM: TRANSICIONES MANUALES PERMITIDAS ---
# Las demás transiciones (proforma, pago de tributos, OMC) son EXCLUSIVAS del motor reactivo
# (services/state_machine.py) y nunca se aceptan desde el cliente.
# Formato: estado_origen -> {estado_destino: tipos_valor permitidos (None = cualquiera)}
TRANSICIONES_MANUALES_DAM = {
    EstadoDam.PENDIENTE_AFORO: {
        EstadoDam.CON_LEVANTE: None,                       # Aforo conforme
        EstadoDam.OBSERVADA: None,            # Reportar observación SUNAT
    },
    EstadoDam.OBSERVADA: {
        EstadoDam.EN_REVISION: {TipoValor.DEFINITIVO},             # Subir sustento (definitivo)
        EstadoDam.CON_LEVANTE_GARANTIA_ACTIVA: {TipoValor.GARANTIZADO, TipoValor.PROVISIONAL},  # Art. 160 LGA
    },
    EstadoDam.EN_REVISION: {
        EstadoDam.CON_LEVANTE: None,                       # Diligencia conforme
    },
    EstadoDam.CON_LEVANTE_GARANTIA_ACTIVA: {
        EstadoDam.EN_REVISION_OMC: None,
        EstadoDam.GARANTIA_CERRADA: None,
    },
    EstadoDam.EN_REVISION_OMC: {
        EstadoDam.GARANTIA_CERRADA: None,
    },
}


def validar_transicion_dam(estado_actual: str, estado_nuevo: str, tipo_valor: str, es_admin: bool):
    """Lanza 400 si la transición manual no está permitida. El SuperAdmin puede forzarla (queda auditado)."""
    if estado_nuevo == estado_actual:
        return
    destinos = TRANSICIONES_MANUALES_DAM.get(estado_actual or "", {})
    if estado_nuevo in destinos:
        tipos = destinos[estado_nuevo]
        if tipos is None or (tipo_valor or TipoValor.DEFINITIVO) in tipos:
            return
    if es_admin:
        return
    raise HTTPException(
        status_code=400,
        detail=(f"Transición no permitida: '{estado_actual}' → '{estado_nuevo}'. "
                "Los estados de proforma, pago y levante automático los asigna el sistema según los pagos registrados.")
    )

# ==========================================
# 1. MAESTRO IMPORTACIONES (OPERACIONES)
# ==========================================

@router.post("/maestros/", response_model=schemas.MaestroImportacion)
def crear_maestro(maestro: schemas.MaestroImportacionCreate, db: Session = Depends(get_db), current_user: models.Usuario = Depends(RoleChecker(ROLES_OPERACIONES))):
    datos = maestro.model_dump()
    # Campos calculados por la máquina de estados: nunca se aceptan del cliente al crear
    datos.update({"estado_documentario": EstadoDocumentario.SIN_NUMERAR, "estado_levante": EstadoLevante.SIN_LEVANTE, "fecha_levante_maestro": None, "version": 1})
    if datos.get("status_llegada") == StatusLlegada.EN_ALMACEN and not datos.get("fecha_recepcion_almacen"):
        raise HTTPException(status_code=400, detail="Para registrar el contenedor EN ALMACÉN debe indicar la fecha de recepción en almacén.")
    nuevo_maestro = models.MaestroImportacion(**datos)
    
    # Automatización CFR
    fob = nuevo_maestro.fob_usd if nuevo_maestro.fob_usd is not None else Decimal('0.00')
    flete = nuevo_maestro.flete_usd if nuevo_maestro.flete_usd is not None else Decimal('0.00')
    nuevo_maestro.cfr_usd = fob + flete
    
    db.add(nuevo_maestro)
    db.commit()
    db.refresh(nuevo_maestro)

    # Disparador Reactivo: Inicializar estado documentario del nuevo contenedor
    sincronizar_estado_maestro(db, nuevo_maestro.id_maestro)
    db.refresh(nuevo_maestro)

    return nuevo_maestro

@router.put("/maestros/{id_maestro}", response_model=schemas.MaestroImportacion)
def actualizar_maestro(id_maestro: int, maestro_editado: schemas.MaestroImportacionUpdate, db: Session = Depends(get_db), current_user: models.Usuario = Depends(RoleChecker(ROLES_OPERACIONES))):
    db_maestro = db.query(models.MaestroImportacion).filter(models.MaestroImportacion.id_maestro == id_maestro).first()
    
    if not db_maestro:
        raise HTTPException(status_code=404, detail="Maestro de importación no encontrado")
        
    # Regla Crítica: Si ya está en ATE. TOTAL, se bloquea la edición normal
    if db_maestro.estado_documentario == EstadoDocumentario.ATENCION_TOTAL and current_user.id_rol != Rol.SUPERADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, 
            detail="Operación Denegada: Los registros con ATENCIÓN TOTAL están blindados. Solicita desbloqueo al Administrador."
        )
    
    update_data = maestro_editado.model_dump(exclude_unset=True)
    
    # Prevención de Bypass: estado_documentario y estado_levante son calculados reactivamente por la máquina de estados
    if "estado_documentario" in update_data and current_user.id_rol != Rol.SUPERADMIN:
        del update_data["estado_documentario"]
    if "estado_levante" in update_data and current_user.id_rol != Rol.SUPERADMIN:
        del update_data["estado_levante"]
    if "fecha_levante_maestro" in update_data and current_user.id_rol != Rol.SUPERADMIN:
        del update_data["fecha_levante_maestro"]  # La sella el cronómetro logístico de la máquina de estados

    # Bloqueo optimista real: la versión que el cliente leyó debe coincidir con la actual.
    # (Antes se asignaba con setattr y SQLAlchemy la tomaba como "nueva versión", sin detectar el conflicto.)
    version_cliente = update_data.pop("version", None)
    if version_cliente is not None and version_cliente != db_maestro.version:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="❌ CONFLICTO DE CONCURRENCIA: Otro usuario (o un proceso automático) modificó este expediente mientras lo editabas. Recarga el registro y vuelve a aplicar tus cambios."
        )

    # Integridad física: EN ALMACÉN exige fecha de recepción
    status_final = update_data.get("status_llegada", db_maestro.status_llegada)
    fecha_recepcion_final = update_data["fecha_recepcion_almacen"] if "fecha_recepcion_almacen" in update_data else db_maestro.fecha_recepcion_almacen
    if status_final == StatusLlegada.EN_ALMACEN and not fecha_recepcion_final:
        raise HTTPException(status_code=400, detail="Para pasar el contenedor a EN ALMACÉN debe indicar la fecha de recepción en almacén.")

    # El tipo de valor (DEFINITIVO/GARANTIZADO) define qué levantes son legales: no puede cambiarse
    # cuando alguna DAM ya avanzó en su trámite aduanero (salvo Administrador).
    if "tipo_valor" in update_data and update_data["tipo_valor"] != db_maestro.tipo_valor and current_user.id_rol != Rol.SUPERADMIN:
        dams_avanzadas = [d for d in db_maestro.dams if d.estado_dam not in (None, EstadoDam.NUMERADA)]
        if dams_avanzadas:
            raise HTTPException(status_code=400, detail="No se puede cambiar el tipo de valor: hay DAMs con trámite aduanero en curso. Solicítelo al Administrador.")

    for key, value in update_data.items():
        setattr(db_maestro, key, value)
        
    # Automatización CFR (Recálculo)
    fob = db_maestro.fob_usd if db_maestro.fob_usd is not None else Decimal('0.00')
    flete = db_maestro.flete_usd if db_maestro.flete_usd is not None else Decimal('0.00')
    db_maestro.cfr_usd = fob + flete
        
    try:
        db.commit()
        db.refresh(db_maestro)
        
        # Disparador Reactivo: Sincronizar estado del contenedor tras actualizar Maestro
        sincronizar_estado_maestro(db, db_maestro.id_maestro)
        db.refresh(db_maestro)

        return db_maestro
    except StaleDataError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="❌ CONFLICTO DE CONCURRENCIA: Otro usuario modificó este registro mientras lo editabas. Por favor, recarga la página."
        )

@router.post("/maestros/{id_maestro}/desbloquear/", response_model=schemas.MaestroImportacion)
async def desbloquear_maestro_con_levante(
    id_maestro: int, 
    request: Request,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user)
):
    if current_user.id_rol != Rol.SUPERADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, 
            detail="Acceso Restringido: Solo el Administrador del Sistema puede abrir un candado post-levante."
        )

    maestro = db.query(models.MaestroImportacion).filter(models.MaestroImportacion.id_maestro == id_maestro).first()
    if not maestro:
        raise HTTPException(status_code=404, detail="Maestro de importación no encontrado")

    try:
        maestro.estado_levante = EstadoLevante.SIN_LEVANTE
        db.flush()
        
        await registrar_auditoria(
            db=db,
            id_usuario=current_user.id_usuario,
            endpoint=request.url.path,
            accion=AccionAuditoria.DESBLOQUEO_LEVANTE,
            detalles=f'{{"id_maestro": {id_maestro}, "nuevo_estado": "SIN LEVANTE"}}',
            ip_address=request.client.host if request.client else "IP Desconocida"
        )

        db.commit()
        db.refresh(maestro)
        return maestro
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise error_interno("Error al desbloquear levante", e, 400)

@router.put("/maestros/{id_maestro}/autorizar-levante", response_model=schemas.MaestroImportacion)
async def autorizar_levante(
    id_maestro: int, 
    request: Request,
    db: Session = Depends(get_db), 
    current_user: models.Usuario = Depends(RoleChecker(ROLES_OPERACIONES)) # 1: Admin, 2: Logística
):
    # 1. Buscar el maestro
    maestro = db.query(models.MaestroImportacion).filter(models.MaestroImportacion.id_maestro == id_maestro).first()
    
    if not maestro:
        raise HTTPException(status_code=404, detail="Maestro de importación no encontrado")
        
    if not maestro.dams:
        raise HTTPException(status_code=400, detail="El maestro no tiene ninguna DAM asociada para evaluar el levante.")

    # 2. Máquina de Estados: Matriz de Canales
    for dam in maestro.dams:
        if dam.canal_control == CanalControl.ROJO and maestro.tipo_valor == TipoValor.DEFINITIVO:
            if not dam.aforo_realizado:
                raise HTTPException(
                    status_code=400, 
                    detail=f"Operación denegada: El Canal Rojo Definitivo exige Aforo Físico antes del Levante para la DAM {dam.numero_de_dam}."
                )

    # 3. Aplicar el Levante y Auditoría Atómica
    try:
        maestro.estado_levante = EstadoLevante.CON_LEVANTE
        db.flush()

        # 4. Bitácora de Auditoría
        detalles_auditoria = f'{{"id_maestro": {id_maestro}, "nuevo_estado": "CON LEVANTE"}}'
        
        await registrar_auditoria(
            db=db,
            id_usuario=current_user.id_usuario,
            endpoint=request.url.path,
            accion=AccionAuditoria.AUTORIZACION_LEVANTE,
            detalles=detalles_auditoria,
            ip_address=request.client.host if request.client else "IP Desconocida"
        )

        db.commit()
        db.refresh(maestro)
        return maestro
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise error_interno("Error al autorizar levante", e, 500)

@router.get("/maestros/lookup", response_model=List[schemas.MaestroLookup])
def lookup_maestros(db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_user)):
    # Retorna solo las columnas necesarias (hasta 2000 activos) sin join pesado
    query = db.query(models.MaestroImportacion.id_maestro, models.MaestroImportacion.numero_factura, models.MaestroImportacion.n_cont_fisico, models.MaestroImportacion.tipo_valor)\
              .filter(models.MaestroImportacion.estado_registro == EstadoRegistro.ACTIVO)\
              .order_by(models.MaestroImportacion.id_maestro.desc())\
              .limit(2000).all()
    return query

@router.get("/maestros/", response_model=schemas.PaginatedResponse[schemas.MaestroImportacion])
def listar_facturas(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=1000),
    search: Optional[str] = None,
    estado_levante: Optional[str] = None,
    status_llegada: Optional[str] = None,
    id_importador: Optional[int] = None,
    tipo_valor: Optional[str] = None,
    db: Session = Depends(get_db), 
    current_user: models.Usuario = Depends(get_current_user)
):
    filtros = [models.MaestroImportacion.estado_registro == EstadoRegistro.ACTIVO]
    if search:
        termino = f"%{search.strip()}%"
        filtros.append(
            models.MaestroImportacion.numero_factura.ilike(termino) |
            models.MaestroImportacion.documento_transporte.ilike(termino) |
            models.MaestroImportacion.n_cont_fisico.ilike(termino)
        )
    if estado_levante:
        filtros.append(models.MaestroImportacion.estado_levante == estado_levante)
    if status_llegada:
        filtros.append(models.MaestroImportacion.status_llegada == status_llegada)
    if id_importador:
        filtros.append(models.MaestroImportacion.id_importador == id_importador)
    if tipo_valor:
        filtros.append(models.MaestroImportacion.tipo_valor == tipo_valor)

    total_registros = db.query(func.count(models.MaestroImportacion.id_maestro)).filter(*filtros).scalar() or 0
    total_paginas = (total_registros + limit - 1) // limit if total_registros > 0 else 0

    data = (
        db.query(models.MaestroImportacion)
        .filter(*filtros)
        .order_by(models.MaestroImportacion.id_maestro.asc())
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )

    return {
        "total_registros": total_registros,
        "pagina": page,
        "limite": limit,
        "total_paginas": total_paginas,
        "data": data
    }

@router.get("/maestros/exportar")
def exportar_maestros_excel(
    search: Optional[str] = None,
    estado_levante: Optional[str] = None,
    status_llegada: Optional[str] = None,
    id_importador: Optional[int] = None,
    tipo_valor: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user)
):
    filtros = [models.MaestroImportacion.estado_registro == EstadoRegistro.ACTIVO]
    if search:
        termino = f"%{search.strip()}%"
        filtros.append(
            models.MaestroImportacion.numero_factura.ilike(termino) |
            models.MaestroImportacion.documento_transporte.ilike(termino) |
            models.MaestroImportacion.n_cont_fisico.ilike(termino)
        )
    if estado_levante:
        filtros.append(models.MaestroImportacion.estado_levante == estado_levante)
    if status_llegada:
        filtros.append(models.MaestroImportacion.status_llegada == status_llegada)
    if id_importador:
        filtros.append(models.MaestroImportacion.id_importador == id_importador)
    if tipo_valor:
        filtros.append(models.MaestroImportacion.tipo_valor == tipo_valor)

    maestros = (
        db.query(models.MaestroImportacion)
        .options(
            joinedload(models.MaestroImportacion.importador_rel),
            joinedload(models.MaestroImportacion.proveedor_rel),
            joinedload(models.MaestroImportacion.agente_rel),
            joinedload(models.MaestroImportacion.almacen_rel)
        )
        .filter(*filtros)
        .order_by(models.MaestroImportacion.numero_factura.asc(), models.MaestroImportacion.id_maestro.asc())
        .all()
    )

    stream, filename = generar_excel_maestros(maestros)
    return StreamingResponse(
        stream,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Access-Control-Expose-Headers": "Content-Disposition"
        }
    )

@router.get("/reporte-maestro/{id_maestro}", response_model=schemas.MaestroConDetalles)
def reporte_completo_factura(id_maestro: int, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_user)):
    factura = db.query(models.MaestroImportacion).filter(models.MaestroImportacion.id_maestro == id_maestro).first()
    if not factura:
        raise HTTPException(status_code=404, detail="Factura no encontrada")
    return factura

@router.get("/maestros/{id_maestro}/estado_cuenta", response_model=schemas.EstadoCuentaFacturaResumen)
def estado_cuenta_factura(
    id_maestro: int, 
    tipo_cambio_referencial: Decimal = Query(Decimal("3.80"), description="Tipo de cambio referencial para gastos en USD"), 
    db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_user)
):
    maestro = db.query(models.MaestroImportacion).filter(models.MaestroImportacion.id_maestro == id_maestro).first()
    
    if not maestro:
        raise HTTPException(status_code=404, detail="Factura/Maestro no encontrado")

    total_general_gastos_pen = Decimal("0.00")
    total_general_pagado_pen = Decimal("0.00")
    desglose_dams = []

    for dam in maestro.dams:
        total_gastos_dam_pen = Decimal("0.00")
        total_pagado_dam_pen = Decimal("0.00")

        # 1. Sumar gastos de la DAM
        for gasto in dam.gastos:
            if gasto.estado_registro == EstadoRegistro.ACTIVO:
                monto_original = Decimal(str(gasto.monto_original)) if gasto.monto_original else Decimal("0.00")
                if gasto.moneda == Moneda.USD:
                    total_gastos_dam_pen += monto_original * tipo_cambio_referencial
                else:
                    total_gastos_dam_pen += monto_original

        # 2. Sumar pagos de la DAM
        for pago in dam.pagos:
            if pago.estado_registro == EstadoRegistro.ACTIVO:
                importe = Decimal(str(pago.importe)) if pago.importe else Decimal("0.00")
                if pago.moneda == Moneda.USD:
                    tc_pago = Decimal(str(pago.tipo_cambio)) if pago.tipo_cambio else Decimal("1.00")
                    total_pagado_dam_pen += importe * tc_pago
                elif pago.moneda == Moneda.PEN:
                    total_pagado_dam_pen += importe

        saldo_pendiente_dam_pen = total_gastos_dam_pen - total_pagado_dam_pen

        total_general_gastos_pen += total_gastos_dam_pen
        total_general_pagado_pen += total_pagado_dam_pen

        desglose_dams.append(schemas.EstadoCuentaDam(
            id_dam=dam.id_dam,
            numero_de_dam=dam.numero_de_dam,
            total_gastos_pen=total_gastos_dam_pen,
            total_pagado_pen=total_pagado_dam_pen,
            saldo_pendiente_pen=saldo_pendiente_dam_pen
        ))

    saldo_general_pendiente_pen = total_general_gastos_pen - total_general_pagado_pen
    
    if total_general_gastos_pen > Decimal("0.00"):
        porcentaje_amortizado = (total_general_pagado_pen / total_general_gastos_pen) * Decimal("100.00")
    else:
        porcentaje_amortizado = Decimal("0.00")

    return schemas.EstadoCuentaFacturaResumen(
        id_maestro=maestro.id_maestro,
        numero_factura=maestro.numero_factura,
        documento_transporte=maestro.documento_transporte,
        total_general_gastos_pen=total_general_gastos_pen,
        total_general_pagado_pen=total_general_pagado_pen,
        saldo_general_pendiente_pen=saldo_general_pendiente_pen,
        porcentaje_amortizado=porcentaje_amortizado,
        desglose_dams=desglose_dams
    )

def obtener_datos_liquidacion_contenedor(id_maestro: int, db: Session, tc_ref: Decimal = Decimal("3.80")) -> dict:
    """Extrae y estructura la liquidación vertical de gastos bimonetarios de un contenedor."""
    maestro = (
        db.query(models.MaestroImportacion)
        .options(
            joinedload(models.MaestroImportacion.importador_rel),
            joinedload(models.MaestroImportacion.proveedor_rel),
            joinedload(models.MaestroImportacion.agente_rel),
            joinedload(models.MaestroImportacion.almacen_rel),
            joinedload(models.MaestroImportacion.dams)
            .joinedload(models.DetalleDam.gastos)
            .joinedload(models.RegistroGasto.concepto_rel),
            joinedload(models.MaestroImportacion.dams)
            .joinedload(models.DetalleDam.gastos)
            .joinedload(models.RegistroGasto.proveedor_rel),
            joinedload(models.MaestroImportacion.dams)
            .joinedload(models.DetalleDam.gastos)
            .joinedload(models.RegistroGasto.tipo_doc_rel),
            joinedload(models.MaestroImportacion.dams)
            .joinedload(models.DetalleDam.gastos)
            .joinedload(models.RegistroGasto.pagos)
            .joinedload(models.RegistroPago.voucher_rel)
            .joinedload(models.VoucherBancario.banco_rel),
        )
        .filter(models.MaestroImportacion.id_maestro == id_maestro)
        .first()
    )
    if not maestro:
        raise HTTPException(status_code=404, detail="Expediente / Maestro no encontrado")

    if tc_ref <= Decimal("0.00"):
        tc_ref = Decimal("3.80")

    gastos_list = []
    total_usd_orig = Decimal("0.00")
    total_usd_pagado = Decimal("0.00")
    total_pen_orig = Decimal("0.00")
    total_pen_pagado = Decimal("0.00")

    subtotales_etapa = {
        TipoGasto.FIJO_DESPACHO: {"usd": Decimal("0.00"), "pen": Decimal("0.00")},
        TipoGasto.POST_LEVANTE: {"usd": Decimal("0.00"), "pen": Decimal("0.00")},
        TipoGasto.EXTRAORDINARIO: {"usd": Decimal("0.00"), "pen": Decimal("0.00")},
    }

    for dam in maestro.dams:
        for g in dam.gastos:
            if g.estado_registro != EstadoRegistro.ACTIVO:
                continue

            monto_orig = Decimal(str(g.monto_original)) if g.monto_original else Decimal("0.00")
            moneda_g = g.moneda or Moneda.USD
            etapa = g.concepto_rel.tipo_gasto if (g.concepto_rel and g.concepto_rel.tipo_gasto) else TipoGasto.FIJO_DESPACHO
            if etapa not in subtotales_etapa:
                subtotales_etapa[etapa] = {"usd": Decimal("0.00"), "pen": Decimal("0.00")}

            total_pagado = Decimal("0.00")
            pagos_detalle = []
            if g.pagos:
                for p in g.pagos:
                    if p.estado_registro == EstadoRegistro.ACTIVO and p.importe:
                        imp = Decimal(str(p.importe))
                        total_pagado += amortizacion_de_pago(p, moneda_g)

                        v_rel = p.voucher_rel
                        banco_nom = v_rel.banco_rel.nombre if (v_rel and v_rel.banco_rel) else "Banco"
                        op_num = v_rel.numero_operacion if v_rel else "S/N"
                        pagos_detalle.append({
                            "id_pago": p.id_pago,
                            "fecha_pago": str(p.fecha_pago) if p.fecha_pago else "-",
                            "importe": float(imp),
                            "moneda": p.moneda,
                            "numero_operacion": op_num,
                            "banco": banco_nom
                        })

            saldo = max(Decimal("0.00"), monto_orig - total_pagado)

            if moneda_g == Moneda.USD:
                total_usd_orig += monto_orig
                total_usd_pagado += total_pagado
                subtotales_etapa[etapa]["usd"] += monto_orig
                equiv_usd = monto_orig
            else:
                total_pen_orig += monto_orig
                total_pen_pagado += total_pagado
                subtotales_etapa[etapa]["pen"] += monto_orig
                equiv_usd = monto_orig / tc_ref

            gastos_list.append({
                "id_gasto": g.id_gasto,
                "id_dam": dam.id_dam,
                "numero_de_dam": dam.numero_de_dam,
                "tipo_gasto": etapa,
                "proveedor_nombre": g.proveedor_rel.nombre if g.proveedor_rel else "-",
                "proveedor_ruc": g.proveedor_rel.ruc if g.proveedor_rel else "-",
                "tipo_doc_nombre": g.tipo_doc_rel.nombre_documento if g.tipo_doc_rel else "-",
                "numero_documento": g.numero_documento or "-",
                "concepto_nombre": g.concepto_rel.nombre if g.concepto_rel else "-",
                "fecha_vencimiento": str(g.fecha_vencimiento) if g.fecha_vencimiento else None,
                "moneda": moneda_g,
                "monto_original": float(monto_orig),
                "total_pagado": float(total_pagado),
                "saldo_pendiente": float(saldo),
                "estado_pago": g.estado_pago or EstadoPago.PENDIENTE,
                "tipo_cambio_ref": float(tc_ref),
                "equivalente_usd": round(float(equiv_usd), 2),
                "pagos_detalle": pagos_detalle
            })

    orden_etapas = {TipoGasto.FIJO_DESPACHO: 1, TipoGasto.POST_LEVANTE: 2, TipoGasto.EXTRAORDINARIO: 3}
    gastos_list.sort(key=lambda x: (orden_etapas.get(x["tipo_gasto"], 99), x["fecha_vencimiento"] or "", x["id_gasto"]))

    saldo_usd = max(Decimal("0.00"), total_usd_orig - total_usd_pagado)
    saldo_pen = max(Decimal("0.00"), total_pen_orig - total_pen_pagado)

    gastos_consolidados_usd = total_usd_orig + (total_pen_orig / tc_ref)
    pagados_consolidados_usd = total_usd_pagado + (total_pen_pagado / tc_ref)
    saldo_consolidado_usd = saldo_usd + (saldo_pen / tc_ref)
    cfr_usd = Decimal(str(maestro.cfr_usd)) if maestro.cfr_usd else Decimal("0.00")
    costo_total_embarque = cfr_usd + gastos_consolidados_usd

    return {
        "id_maestro": maestro.id_maestro,
        "numero_factura": maestro.numero_factura,
        "n_cont_fisico": maestro.n_cont_fisico or "-",
        "documento_transporte": maestro.documento_transporte or "-",
        "importador": maestro.importador_rel.nombre if maestro.importador_rel else "-",
        "importador_ruc": getattr(maestro.importador_rel, "ruc", "-") or "-",
        "proveedor": maestro.proveedor_rel.nombre if maestro.proveedor_rel else "-",
        "agente_aduana": maestro.agente_rel.nombre if maestro.agente_rel else "-",
        "almacen": maestro.almacen_rel.nombre if maestro.almacen_rel else "-",
        "fecha_embarque": str(maestro.fecha_embarque) if maestro.fecha_embarque else "-",
        "fecha_arribo": str(maestro.fecha_arribo) if maestro.fecha_arribo else "-",
        "status_llegada": maestro.status_llegada or "-",
        "estado_levante": maestro.estado_levante or "-",
        "tipo_valor": maestro.tipo_valor or TipoValor.DEFINITIVO,
        "fob_usd": float(maestro.fob_usd or 0.0),
        "flete_usd": float(maestro.flete_usd or 0.0),
        "cfr_usd": float(cfr_usd),
        "tipo_cambio_referencial": float(tc_ref),
        "totales": {
            "usd": {
                "original": float(total_usd_orig),
                "pagado": float(total_usd_pagado),
                "saldo": float(saldo_usd)
            },
            "pen": {
                "original": float(total_pen_orig),
                "pagado": float(total_pen_pagado),
                "saldo": float(saldo_pen)
            },
            "consolidado_usd": {
                "total_gastos": round(float(gastos_consolidados_usd), 2),
                "total_pagado": round(float(pagados_consolidados_usd), 2),
                "saldo_pendiente": round(float(saldo_consolidado_usd), 2),
                "costo_total_embarque_cfr_gastos": round(float(costo_total_embarque), 2)
            },
            "subtotales_etapa": {
                k: {"usd": float(v["usd"]), "pen": float(v["pen"])} for k, v in subtotales_etapa.items()
            }
        },
        "gastos": gastos_list
    }

@router.get("/maestros/{id_maestro}/liquidacion-gastos")
def obtener_liquidacion_gastos_contenedor_api(
    id_maestro: int,
    tipo_cambio_referencial: Decimal = Query(Decimal("3.80"), description="Tipo de cambio referencial para gastos en USD"),
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user)
):
    return obtener_datos_liquidacion_contenedor(id_maestro, db, tipo_cambio_referencial)

@router.get("/maestros/{id_maestro}/liquidacion-gastos/exportar")
def exportar_liquidacion_gastos_excel_api(
    id_maestro: int,
    tipo_cambio_referencial: Decimal = Query(Decimal("3.80"), description="Tipo de cambio referencial para gastos en USD"),
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user)
):
    data = obtener_datos_liquidacion_contenedor(id_maestro, db, tipo_cambio_referencial)
    stream, filename = generar_excel_liquidacion_contenedor(data)
    return StreamingResponse(
        stream,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Access-Control-Expose-Headers": "Content-Disposition"
        }
    )

@router.delete("/maestros/{id_maestro}")
def eliminar_maestro(id_maestro: int, req: schemas.EliminacionRequest, db: Session = Depends(get_db), current_user: models.Usuario = Depends(RoleChecker(ROLES_OPERACIONES))):
    maestro = db.query(models.MaestroImportacion).filter(models.MaestroImportacion.id_maestro == id_maestro).first()
    if not maestro:
        raise HTTPException(status_code=404, detail="Maestro de importación no encontrado")
        
    tiene_dams = db.query(models.DetalleDam).filter(models.DetalleDam.id_maestro == id_maestro).first()
    if tiene_dams:
        raise HTTPException(
            status_code=400, 
            detail="❌ Bloqueo: No se puede eliminar el Maestro porque tiene DAMs asociadas. Elimine primero las DAMs."
        )
        
    cols_respaldo = {c.name for c in models.MaestroEliminado.__table__.columns}
    datos = {c.name: getattr(maestro, c.name) for c in maestro.__table__.columns if c.name in cols_respaldo}
    snapshot = {
        "Agente": maestro.agente_rel.nombre if maestro.agente_rel else "N/A",
        "Importador": maestro.importador_rel.nombre if maestro.importador_rel else "N/A",
        "Proveedor": maestro.proveedor_rel.nombre if maestro.proveedor_rel else "N/A",
        "Almacén": maestro.almacen_rel.nombre if maestro.almacen_rel else "N/A"
    }
    respaldo = models.MaestroEliminado(
        **datos, 
        motivo_eliminacion=req.motivo, 
        usuario_id=current_user.id_usuario,
        nombre_usuario_ejecutor=current_user.username,
        identificador_principal=f"Contenedor/Factura: {maestro.numero_factura}",
        detalles_legibles=snapshot
    )
    
    db.add(respaldo)
    db.delete(maestro)
    db.commit()
    return {"mensaje": f"Maestro de importación {maestro.numero_factura} eliminado físicamente con respaldo de auditoría."}

# ==========================================
# 2. DETALLE DAMS
# ==========================================

@router.get("/dams/lookup", response_model=List[schemas.DamLookup])
def lookup_dams(db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_user)):
    query = db.query(models.DetalleDam.id_dam, models.DetalleDam.numero_de_dam, models.DetalleDam.id_maestro)\
              .order_by(models.DetalleDam.id_dam.desc())\
              .limit(3000).all()
    return query

@router.get("/dams/", response_model=schemas.PaginatedResponse[schemas.DetalleDam])
def listar_dams(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=1000),
    search: Optional[str] = None,
    canal_control: Optional[str] = None,
    aforo_realizado: Optional[bool] = None,
    tipo_valor: Optional[str] = None,
    db: Session = Depends(get_db), 
    current_user: models.Usuario = Depends(get_current_user)
):
    query = db.query(models.DetalleDam).outerjoin(models.DetalleDam.maestro)
    filtros = []

    if search:
        termino = f"%{search.strip()}%"
        filtros.append(
            models.DetalleDam.numero_de_dam.ilike(termino) |
            models.DetalleDam.serie.ilike(termino) |
            models.MaestroImportacion.numero_factura.ilike(termino)
        )
    if canal_control:
        filtros.append(models.DetalleDam.canal_control == canal_control)
    if aforo_realizado is not None:
        filtros.append(models.DetalleDam.aforo_realizado == aforo_realizado)
    if tipo_valor:
        filtros.append(models.MaestroImportacion.tipo_valor == tipo_valor)

    total_registros = query.filter(*filtros).with_entities(func.count(models.DetalleDam.id_dam)).scalar() or 0
    total_paginas = (total_registros + limit - 1) // limit if total_registros > 0 else 0

    data = (
        query
        .filter(*filtros)
        .order_by(models.DetalleDam.id_dam.asc())
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )

    return {
        "total_registros": total_registros,
        "pagina": page,
        "limite": limit,
        "total_paginas": total_paginas,
        "data": data
    }

@router.get("/dams/exportar")
def exportar_dams_excel(
    search: Optional[str] = None,
    canal_control: Optional[str] = None,
    aforo_realizado: Optional[bool] = None,
    tipo_valor: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user)
):
    query = db.query(models.DetalleDam).outerjoin(models.DetalleDam.maestro)
    filtros = []

    if search:
        termino = f"%{search.strip()}%"
        filtros.append(
            models.DetalleDam.numero_de_dam.ilike(termino) |
            models.DetalleDam.serie.ilike(termino) |
            models.MaestroImportacion.numero_factura.ilike(termino)
        )
    if canal_control:
        filtros.append(models.DetalleDam.canal_control == canal_control)
    if aforo_realizado is not None:
        filtros.append(models.DetalleDam.aforo_realizado == aforo_realizado)
    if tipo_valor:
        filtros.append(models.MaestroImportacion.tipo_valor == tipo_valor)

    dams = (
        query
        .filter(*filtros)
        .options(
            joinedload(models.DetalleDam.maestro).joinedload(models.MaestroImportacion.importador_rel)
        )
        .order_by(models.MaestroImportacion.numero_factura.asc(), models.DetalleDam.numero_de_dam.asc())
        .all()
    )

    stream, filename = generar_excel_dams(dams)
    return StreamingResponse(
        stream,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Access-Control-Expose-Headers": "Content-Disposition"
        }
    )

@router.post("/dams/", response_model=schemas.DetalleDam)
def crear_dam(dam: schemas.DetalleDamCreate, db: Session = Depends(get_db), current_user: models.Usuario = Depends(RoleChecker(ROLES_OPERACIONES))):
    maestro = db.query(models.MaestroImportacion).filter(models.MaestroImportacion.id_maestro == dam.id_maestro).first()
    if not maestro:
        raise HTTPException(status_code=404, detail="El Maestro de Importación asociado no existe en la base de datos.")
    if maestro.estado_levante == EstadoLevante.CON_LEVANTE and current_user.id_rol != Rol.SUPERADMIN:
        raise HTTPException(status_code=403, detail="Operación Denegada: No se pueden agregar DAMs a un contenedor que ya cuenta con LEVANTE autorizado.")
    if maestro.estado_documentario == EstadoDocumentario.ATENCION_TOTAL and current_user.id_rol != Rol.SUPERADMIN:
        raise HTTPException(status_code=403, detail="Operación Denegada: El contenedor está en ATENCIÓN TOTAL.")

    estrategia = ESTRATEGIAS_VALIDACION_DAM.get(maestro.tipo_valor)
    if estrategia:
        dam = estrategia(dam)

    datos_dam = dam.model_dump()
    # Toda DAM nace en el estado inicial: el levante/aforo NUNCA se declara desde el cliente
    datos_dam["estado_dam"] = EstadoDam.NUMERADA
    datos_dam["aforo_realizado"] = False
    datos_dam["fecha_levante"] = None

    nueva_dam = models.DetalleDam(**datos_dam)
    db.add(nueva_dam)
    db.commit()
    db.refresh(nueva_dam)

    # Disparador Reactivo: Evaluar consolidación del contenedor al nacer una DAM
    sincronizar_estado_maestro(db, nueva_dam.id_maestro)

    return nueva_dam

@router.put("/dams/{id_dam}", response_model=schemas.DetalleDam)
def actualizar_dam(
    id_dam: int,
    dam_editada: schemas.DetalleDamUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(RoleChecker(ROLES_OPERACIONES))  # 1: Admin, 2: Logística
):
    db_dam = db.query(models.DetalleDam).filter(models.DetalleDam.id_dam == id_dam).first()

    if not db_dam:
        raise HTTPException(status_code=404, detail="DAM no encontrada")

    es_admin = current_user.id_rol == Rol.SUPERADMIN
    update_data = dam_editada.model_dump(exclude_unset=True)
    maestro_actual = db_dam.maestro

    # Candado ATE. TOTAL (contenedor actual y, si se reasigna, el contenedor destino)
    if not es_admin:
        if maestro_actual and maestro_actual.estado_documentario == EstadoDocumentario.ATENCION_TOTAL:
            raise HTTPException(status_code=403, detail="Operación Denegada: El contenedor de esta DAM está en ATENCIÓN TOTAL. Solicita desbloqueo al Administrador.")
        nuevo_id_maestro = update_data.get("id_maestro")
        if nuevo_id_maestro and nuevo_id_maestro != db_dam.id_maestro:
            destino = db.query(models.MaestroImportacion).filter(models.MaestroImportacion.id_maestro == nuevo_id_maestro).first()
            if not destino:
                raise HTTPException(status_code=404, detail="El contenedor destino no existe.")
            if destino.estado_documentario == EstadoDocumentario.ATENCION_TOTAL:
                raise HTTPException(status_code=403, detail="Operación Denegada: El contenedor destino está en ATENCIÓN TOTAL.")
        # La fecha de levante la sella el motor de estados, no el usuario
        update_data.pop("fecha_levante", None)

    estado_anterior = db_dam.estado_dam
    aforo_anterior = db_dam.aforo_realizado

    # Validación de la máquina de estados (solo transiciones manuales de diligencia aduanera)
    if "estado_dam" in update_data:
        nuevo_estado = update_data["estado_dam"]
        if nuevo_estado is None:
            update_data.pop("estado_dam")
        else:
            tipo_valor = maestro_actual.tipo_valor if maestro_actual else TipoValor.DEFINITIVO
            validar_transicion_dam(estado_anterior, nuevo_estado, tipo_valor, es_admin)
            # "Aforo conforme" certifica el aforo físico
            if estado_anterior == EstadoDam.PENDIENTE_AFORO and nuevo_estado == EstadoDam.CON_LEVANTE:
                update_data["aforo_realizado"] = True

    for key, value in update_data.items():
        setattr(db_dam, key, value)

    if db_dam.estado_dam and "LEVANTE" in db_dam.estado_dam and not db_dam.fecha_levante:
        import datetime
        db_dam.fecha_levante = datetime.date.today()

    # Bitácora: todo cambio de estado o de aforo queda trazado con autor e IP
    if db_dam.estado_dam != estado_anterior or db_dam.aforo_realizado != aforo_anterior:
        registrar_auditoria_sync(
            db=db,
            id_usuario=current_user.id_usuario,
            endpoint=request.url.path,
            accion=AccionAuditoria.CAMBIO_ESTADO_DAM,
            detalles=json.dumps({
                "id_dam": id_dam,
                "estado_anterior": estado_anterior, "estado_nuevo": db_dam.estado_dam,
                "aforo_anterior": aforo_anterior, "aforo_nuevo": db_dam.aforo_realizado,
            }, ensure_ascii=False),
            ip_address=request.client.host if request.client else "IP Desconocida"
        )

    db.commit()
    db.refresh(db_dam)

    # Disparador Reactivo: Sincronizar estado del contenedor tras actualizar DAM
    sincronizar_estado_maestro(db, db_dam.id_maestro)

    return db_dam

@router.delete("/dams/{id_dam}")
def eliminar_dam(id_dam: int, req: schemas.EliminacionRequest, db: Session = Depends(get_db), current_user: models.Usuario = Depends(RoleChecker(ROLES_OPERACIONES))):
    dam = db.query(models.DetalleDam).filter(models.DetalleDam.id_dam == id_dam).first()
    if not dam:
        raise HTTPException(status_code=404, detail="DAM no encontrada")

    if dam.maestro and dam.maestro.estado_documentario == EstadoDocumentario.ATENCION_TOTAL and current_user.id_rol != Rol.SUPERADMIN:
        raise HTTPException(status_code=403, detail="Operación Denegada: El contenedor está en ATENCIÓN TOTAL.")

    tiene_gastos = db.query(models.RegistroGasto).filter(models.RegistroGasto.id_dam == id_dam).first()
    if tiene_gastos:
        raise HTTPException(
            status_code=400, 
            detail="❌ Bloqueo: No se puede eliminar la DAM porque tiene Gastos asociados. Elimine primero los Gastos."
        )

    tiene_pagos = db.query(models.RegistroPago).filter(models.RegistroPago.id_dam == id_dam).first()
    if tiene_pagos:
        raise HTTPException(
            status_code=400, 
            detail="❌ Bloqueo: No se puede eliminar la DAM porque tiene Pagos asociados. Elimine primero los Pagos."
        )
        
    cols_respaldo = {c.name for c in models.DamEliminada.__table__.columns}
    datos = {c.name: getattr(dam, c.name) for c in dam.__table__.columns if c.name in cols_respaldo}
    snapshot = {
        "Contenedor/Factura": dam.maestro.numero_factura if dam.maestro else "N/A"
    }
    respaldo = models.DamEliminada(
        **datos, 
        motivo_eliminacion=req.motivo, 
        usuario_id=current_user.id_usuario,
        nombre_usuario_ejecutor=current_user.username,
        identificador_principal=f"DAM: {dam.numero_de_dam}",
        detalles_legibles=snapshot
    )
    
    id_maestro_padre = dam.id_maestro
    db.add(respaldo)
    db.delete(dam)
    db.commit()

    # Disparador Reactivo: Sincronizar estado del contenedor tras eliminar DAM
    sincronizar_estado_maestro(db, id_maestro_padre)

    return {"mensaje": f"DAM {dam.numero_de_dam} eliminada físicamente con respaldo de auditoría."}

# ==========================================
# 4. MOTOR DE KPIS LOGÍSTICOS (BFF)
# ==========================================

@router.get("/maestros/{id_maestro}/kpi-gastos")
def kpi_gastos_maestro(
    id_maestro: int, 
    db: Session = Depends(get_db), 
    current_user: models.Usuario = Depends(get_current_user)
):
    """Calcula el estado de avance de pago de los gastos del contenedor según su etapa operativa."""
    # 1. Obtener el Maestro y sus DAMs
    maestro = db.query(models.MaestroImportacion).filter(models.MaestroImportacion.id_maestro == id_maestro).first()
    if not maestro:
        raise HTTPException(status_code=404, detail="Maestro no encontrado")
        
    dam_ids = [d.id_dam for d in maestro.dams] if maestro.dams else []
    
    # 2. Obtener Gastos de esas DAMs con sus conceptos precargados
    gastos = []
    if dam_ids:
        gastos = db.query(models.RegistroGasto).options(
            joinedload(models.RegistroGasto.concepto_rel)
        ).filter(
            models.RegistroGasto.id_dam.in_(dam_ids),
            models.RegistroGasto.estado_registro == EstadoRegistro.ACTIVO
        ).all()

    # 3. Obtener Catálogo Completo de Conceptos Fijos Activos
    conceptos_fijos = db.query(models.CatConceptoPago).filter(
        models.CatConceptoPago.tipo_gasto == TipoGasto.FIJO_DESPACHO,
        models.CatConceptoPago.estado_registro == EstadoRegistro.ACTIVO
    ).all()
    
    # Función auxiliar para resolver colores dinámicos del semáforo
    def resolver_color(pct: int, total: int) -> str:
        if total == 0:
            return "slate"
        if pct == 100:
            return "emerald"
        if pct >= 50:
            return "amber"
        return "rose"

    # 4. Procesamiento Matemático
    # A) FIJO_DESPACHO (Denominador = Todo el catálogo obligatorio de la empresa)
    fijos_total = len(conceptos_fijos)
    fijos_checklist = []
    fijos_pagados = 0
    fijos_pendientes = 0
    fijos_no_registrados = 0
    
    for concepto in conceptos_fijos:
        gastos_concepto = [g for g in gastos if g.id_concepto == concepto.id_concepto]
        if not gastos_concepto:
            fijos_no_registrados += 1
            fijos_checklist.append({
                "nombre_concepto": concepto.nombre,
                "concepto": concepto.nombre,
                "estado": "NO_REGISTRADO",
                "saldo_pendiente": 0.0
            })
        else:
            if all(g.estado_pago == EstadoPago.PAGADO for g in gastos_concepto):
                fijos_pagados += 1
                fijos_checklist.append({
                    "nombre_concepto": concepto.nombre,
                    "concepto": concepto.nombre,
                    "estado": EstadoPago.PAGADO,
                    "saldo_pendiente": 0.0
                })
            else:
                fijos_pendientes += 1
                # Calcular saldo pendiente estimado si existe
                saldo_est = sum(float(g.monto_original) for g in gastos_concepto if g.estado_pago != EstadoPago.PAGADO)
                fijos_checklist.append({
                    "nombre_concepto": concepto.nombre,
                    "concepto": concepto.nombre,
                    "estado": EstadoPago.PENDIENTE,
                    "saldo_pendiente": saldo_est
                })
                
    fijos_pct = int((fijos_pagados / fijos_total) * 100) if fijos_total > 0 else 100
    
    # B) Procesar etapas dinámicas (POST_LEVANTE / EXTRAORDINARIO)
    def procesar_dinamico(tipo_gasto_str: str, titulo_str: str):
        gastos_filtrados = [g for g in gastos if g.concepto_rel and g.concepto_rel.tipo_gasto == tipo_gasto_str]
        total = len(gastos_filtrados)
        pagados = sum(1 for g in gastos_filtrados if g.estado_pago == EstadoPago.PAGADO)
        pendientes = total - pagados
        pct = int((pagados / total) * 100) if total > 0 else 100
        
        checklist = []
        for g in gastos_filtrados:
            saldo_est = float(g.monto_original) if g.estado_pago != EstadoPago.PAGADO else 0.0
            checklist.append({
                "nombre_concepto": g.concepto_rel.nombre,
                "concepto": g.concepto_rel.nombre,
                "estado": g.estado_pago,
                "saldo_pendiente": saldo_est
            })
            
        color_resuelto = resolver_color(pct, total)
        return {
            "nombre_etapa": titulo_str,
            "titulo": titulo_str,
            "total_conceptos_universo": total,
            "total": total,
            "conceptos_pagados": pagados,
            "pagados": pagados,
            "conceptos_pendientes": pendientes,
            "pendientes": pendientes,
            "conceptos_no_registrados": 0,
            "no_registrados": 0,
            "porcentaje": pct,
            "color": color_resuelto,
            "items": checklist,
            "checklist": checklist
        }
        
    post_levante_data = procesar_dinamico(TipoGasto.POST_LEVANTE, "Gastos Post-Levante")
    extra_data = procesar_dinamico(TipoGasto.EXTRAORDINARIO, "Gastos Extraordinarios")
    
    # C) GLOBAL (Consolidado integral)
    global_total = fijos_total + post_levante_data["total"] + extra_data["total"]
    global_pagados = fijos_pagados + post_levante_data["pagados"] + extra_data["pagados"]
    global_pendientes = fijos_pendientes + post_levante_data["pendientes"] + extra_data["pendientes"]
    global_pct = int((global_pagados / global_total) * 100) if global_total > 0 else 100
    global_checklist = fijos_checklist + post_levante_data["checklist"] + extra_data["checklist"]
    global_color = resolver_color(global_pct, global_total)

    fijo_data = {
        "nombre_etapa": "Gastos Fijos (Despacho)",
        "titulo": "Gastos Fijos (Despacho)",
        "total_conceptos_universo": fijos_total,
        "total": fijos_total,
        "conceptos_pagados": fijos_pagados,
        "pagados": fijos_pagados,
        "conceptos_pendientes": fijos_pendientes,
        "pendientes": fijos_pendientes,
        "conceptos_no_registrados": fijos_no_registrados,
        "no_registrados": fijos_no_registrados,
        "porcentaje": fijos_pct,
        "color": resolver_color(fijos_pct, fijos_total),
        "items": fijos_checklist,
        "checklist": fijos_checklist
    }

    global_data = {
        "nombre_etapa": "Consolidado Total",
        "titulo": "Consolidado Total",
        "total_conceptos_universo": global_total,
        "total": global_total,
        "conceptos_pagados": global_pagados,
        "pagados": global_pagados,
        "conceptos_pendientes": global_pendientes,
        "pendientes": global_pendientes,
        "conceptos_no_registrados": fijos_no_registrados,
        "no_registrados": fijos_no_registrados,
        "porcentaje": global_pct,
        "color": global_color,
        "items": global_checklist,
        "checklist": global_checklist
    }

    payload_etapas = {
        TipoGasto.FIJO_DESPACHO: fijo_data,
        TipoGasto.POST_LEVANTE: post_levante_data,
        TipoGasto.EXTRAORDINARIO: extra_data,
        "GLOBAL": global_data
    }

    # 5. Estructura JSON BFF limpia y enriquecida (Soporta kpis y etapas)
    return {
        "id_maestro": id_maestro,
        "kpis": payload_etapas,
        "etapas": payload_etapas
    }
