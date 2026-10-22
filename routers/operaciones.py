from typing import List, Optional
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session
from sqlalchemy.orm.exc import StaleDataError
from sqlalchemy import func

import models
import schemas
from dependencies import get_db, get_current_user, RoleChecker
from services.audit import registrar_auditoria

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
    "DEFINITIVO": validar_dam_definitiva,
    "GARANTIZADO": validar_dam_garantizada,
    "PROVISIONAL": validar_dam_garantizada  # Retrocompatibilidad
}

# ==========================================
# 1. MAESTRO IMPORTACIONES (OPERACIONES)
# ==========================================

@router.post("/maestros/", response_model=schemas.MaestroImportacion)
def crear_maestro(maestro: schemas.MaestroImportacionCreate, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_user)):
    nuevo_maestro = models.MaestroImportacion(**maestro.model_dump())
    
    # Automatización CFR
    fob = nuevo_maestro.fob_usd if nuevo_maestro.fob_usd is not None else Decimal('0.00')
    flete = nuevo_maestro.flete_usd if nuevo_maestro.flete_usd is not None else Decimal('0.00')
    nuevo_maestro.cfr_usd = fob + flete
    
    db.add(nuevo_maestro)
    db.commit()
    db.refresh(nuevo_maestro)
    return nuevo_maestro

@router.put("/maestros/{id_maestro}", response_model=schemas.MaestroImportacion)
def actualizar_maestro(id_maestro: int, maestro_editado: schemas.MaestroImportacionUpdate, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_user)):
    db_maestro = db.query(models.MaestroImportacion).filter(models.MaestroImportacion.id_maestro == id_maestro).first()
    
    if not db_maestro:
        raise HTTPException(status_code=404, detail="Maestro de importación no encontrado")
        
    # Regla Crítica B.1: Si ya tiene LEVANTE, se bloquea la edición normal
    if db_maestro.estado_levante == "CON LEVANTE" and current_user.id_rol != 1:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, 
            detail="Operación Denegada: Los registros con LEVANTE están blindados. Solicita desbloqueo al Administrador."
        )
    
    update_data = maestro_editado.model_dump(exclude_unset=True)
    
    # Prevención de Bypass: estado_levante es calculado reactivamente por la máquina de estados
    if "estado_levante" in update_data and current_user.id_rol != 1:
        del update_data["estado_levante"]
    
    for key, value in update_data.items():
        setattr(db_maestro, key, value)
        
    # Automatización CFR (Recálculo)
    fob = db_maestro.fob_usd if db_maestro.fob_usd is not None else Decimal('0.00')
    flete = db_maestro.flete_usd if db_maestro.flete_usd is not None else Decimal('0.00')
    db_maestro.cfr_usd = fob + flete
        
    try:
        db.commit()
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
    if current_user.id_rol != 1:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, 
            detail="Acceso Restringido: Solo el Administrador del Sistema puede abrir un candado post-levante."
        )

    maestro = db.query(models.MaestroImportacion).filter(models.MaestroImportacion.id_maestro == id_maestro).first()
    if not maestro:
        raise HTTPException(status_code=404, detail="Maestro de importación no encontrado")

    try:
        maestro.estado_levante = "SIN LEVANTE"
        db.flush()
        
        await registrar_auditoria(
            db=db,
            id_usuario=current_user.id_usuario,
            endpoint=request.url.path,
            accion="DESBLOQUEO LEVANTE",
            detalles=f'{{"id_maestro": {id_maestro}, "nuevo_estado": "SIN LEVANTE"}}',
            ip_address=request.client.host if request.client else "IP Desconocida"
        )

        db.commit()
        db.refresh(maestro)
        return maestro
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Error al desbloquear levante: {str(e)}")

@router.put("/maestros/{id_maestro}/autorizar-levante", response_model=schemas.MaestroImportacion)
async def autorizar_levante(
    id_maestro: int, 
    request: Request,
    db: Session = Depends(get_db), 
    current_user: models.Usuario = Depends(RoleChecker([1, 3])) # 1: Admin, 3: Logística
):
    # 1. Buscar el maestro
    maestro = db.query(models.MaestroImportacion).filter(models.MaestroImportacion.id_maestro == id_maestro).first()
    
    if not maestro:
        raise HTTPException(status_code=404, detail="Maestro de importación no encontrado")
        
    if not maestro.dams:
        raise HTTPException(status_code=400, detail="El maestro no tiene ninguna DAM asociada para evaluar el levante.")

    # 2. Máquina de Estados: Matriz de Canales
    for dam in maestro.dams:
        if dam.canal_control == 'ROJO' and maestro.tipo_valor == 'DEFINITIVO':
            if not dam.aforo_realizado:
                raise HTTPException(
                    status_code=400, 
                    detail=f"Operación denegada: El Canal Rojo Definitivo exige Aforo Físico antes del Levante para la DAM {dam.numero_de_dam}."
                )

    # 3. Aplicar el Levante y Auditoría Atómica
    try:
        maestro.estado_levante = 'CON LEVANTE'
        db.flush()

        # 4. Bitácora de Auditoría
        detalles_auditoria = f'{{"id_maestro": {id_maestro}, "nuevo_estado": "CON LEVANTE"}}'
        
        await registrar_auditoria(
            db=db,
            id_usuario=current_user.id_usuario,
            endpoint=request.url.path,
            accion="AUTORIZACION LEVANTE",
            detalles=detalles_auditoria,
            ip_address=request.client.host if request.client else "IP Desconocida"
        )

        db.commit()
        db.refresh(maestro)
        return maestro
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Error al autorizar levante: {str(e)}")

@router.get("/maestros/", response_model=schemas.PaginatedResponse[schemas.MaestroImportacion])
def listar_facturas(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=1000),
    search: Optional[str] = None,
    db: Session = Depends(get_db), 
    current_user: models.Usuario = Depends(get_current_user)
):
    filtros = []
    if search:
        termino = f"%{search}%"
        filtros.append(
            models.MaestroImportacion.numero_factura.ilike(termino) |
            models.MaestroImportacion.documento_transporte.ilike(termino)
        )

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
            if gasto.estado_registro == "ACTIVO":
                monto_original = Decimal(str(gasto.monto_original)) if gasto.monto_original else Decimal("0.00")
                if gasto.moneda == "USD":
                    total_gastos_dam_pen += monto_original * tipo_cambio_referencial
                else:
                    total_gastos_dam_pen += monto_original

        # 2. Sumar pagos de la DAM
        for pago in dam.pagos:
            if pago.estado_registro == "ACTIVO":
                importe = Decimal(str(pago.importe)) if pago.importe else Decimal("0.00")
                if pago.moneda == "USD":
                    tc_pago = Decimal(str(pago.tipo_cambio)) if pago.tipo_cambio else Decimal("1.00")
                    total_pagado_dam_pen += importe * tc_pago
                elif pago.moneda == "PEN":
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

@router.delete("/maestros/{id_maestro}")
def eliminar_maestro(id_maestro: int, req: schemas.EliminacionRequest, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_user)):
    maestro = db.query(models.MaestroImportacion).filter(models.MaestroImportacion.id_maestro == id_maestro).first()
    if not maestro:
        raise HTTPException(status_code=404, detail="Maestro de importación no encontrado")
        
    tiene_dams = db.query(models.DetalleDam).filter(models.DetalleDam.id_maestro == id_maestro).first()
    if tiene_dams:
        raise HTTPException(
            status_code=400, 
            detail="❌ Bloqueo: No se puede eliminar el Maestro porque tiene DAMs asociadas. Elimine primero las DAMs."
        )
        
    datos = {c.name: getattr(maestro, c.name) for c in maestro.__table__.columns}
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

@router.get("/dams/", response_model=schemas.PaginatedResponse[schemas.DetalleDam])
def listar_dams(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=1000),
    search: Optional[str] = None,
    db: Session = Depends(get_db), 
    current_user: models.Usuario = Depends(get_current_user)
):
    filtros = []
    if search:
        termino = f"%{search}%"
        filtros.append(
            models.DetalleDam.numero_de_dam.ilike(termino)
        )

    total_registros = db.query(func.count(models.DetalleDam.id_dam)).filter(*filtros).scalar() or 0
    total_paginas = (total_registros + limit - 1) // limit if total_registros > 0 else 0

    data = (
        db.query(models.DetalleDam)
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

def evaluar_levante_reactivo(db: Session, id_maestro: int):
    """Disparador Reactivo: Evalúa si el Maestro puede obtener o mantener el estado CON LEVANTE."""
    maestro_padre = db.query(models.MaestroImportacion).filter(models.MaestroImportacion.id_maestro == id_maestro).first()
    if not maestro_padre:
        return
    
    todas_listas = True
    for dam in maestro_padre.dams:
        if dam.canal_control == 'ROJO' and maestro_padre.tipo_valor == 'DEFINITIVO':
            if not dam.aforo_realizado:
                todas_listas = False
                break
    
    if todas_listas and len(maestro_padre.dams) > 0:
        if maestro_padre.estado_levante != "CON LEVANTE":
            maestro_padre.estado_levante = "CON LEVANTE"
            db.commit()
    else:
        if maestro_padre.estado_levante == "CON LEVANTE":
            maestro_padre.estado_levante = "SIN LEVANTE"
            db.commit()

@router.post("/dams/", response_model=schemas.DetalleDam)
def crear_dam(dam: schemas.DetalleDamCreate, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_user)):
    maestro = db.query(models.MaestroImportacion).filter(models.MaestroImportacion.id_maestro == dam.id_maestro).first()
    
    if not maestro:
        raise HTTPException(status_code=404, detail="El Maestro de Importación asociado no existe en la base de datos.")

    estrategia = ESTRATEGIAS_VALIDACION_DAM.get(maestro.tipo_valor)
    if estrategia:
        dam = estrategia(dam)

    nueva_dam = models.DetalleDam(**dam.model_dump())
    db.add(nueva_dam)
    db.commit()
    db.refresh(nueva_dam)

    # Disparador Reactivo: Evaluar levante tras registrar nueva DAM
    evaluar_levante_reactivo(db, nueva_dam.id_maestro)

    return nueva_dam

@router.put("/dams/{id_dam}", response_model=schemas.DetalleDam)
def actualizar_dam(id_dam: int, dam_editada: schemas.DetalleDamUpdate, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_user)):
    db_dam = db.query(models.DetalleDam).filter(models.DetalleDam.id_dam == id_dam).first()
    
    if not db_dam:
        raise HTTPException(status_code=404, detail="DAM no encontrada")
        
    update_data = dam_editada.model_dump(exclude_unset=True)
    
    for key, value in update_data.items():
        setattr(db_dam, key, value)
        
    db.commit()
    db.refresh(db_dam)

    # Disparador Reactivo: Evaluar si el Maestro puede obtener Levante Automático
    evaluar_levante_reactivo(db, db_dam.id_maestro)

    return db_dam

@router.delete("/dams/{id_dam}")
def eliminar_dam(id_dam: int, req: schemas.EliminacionRequest, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_user)):
    dam = db.query(models.DetalleDam).filter(models.DetalleDam.id_dam == id_dam).first()
    if not dam:
        raise HTTPException(status_code=404, detail="DAM no encontrada")
        
    tiene_gastos = db.query(models.RegistroGasto).filter(models.RegistroGasto.id_dam == id_dam).first()
    if tiene_gastos:
        raise HTTPException(
            status_code=400, 
            detail="❌ Bloqueo: No se puede eliminar la DAM porque tiene Gastos asociados. Elimine primero los Gastos."
        )
        
    datos = {c.name: getattr(dam, c.name) for c in dam.__table__.columns}
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

    # Disparador Reactivo: Reevaluar levante tras eliminar DAM
    evaluar_levante_reactivo(db, id_maestro_padre)

    return {"mensaje": f"DAM {dam.numero_de_dam} eliminada físicamente con respaldo de auditoría."}
