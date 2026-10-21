from typing import List, Optional
from datetime import date
from decimal import Decimal, ROUND_HALF_UP
import json
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.encoders import jsonable_encoder
from sqlalchemy.orm import Session, joinedload
from sqlalchemy.exc import IntegrityError, OperationalError
from sqlalchemy import func, case

import models
import schemas
from dependencies import get_db, get_current_user, RoleChecker
from services.audit import registrar_auditoria
from domain.finanzas import calcular_amortizacion_cruzada

router = APIRouter(tags=["Finanzas"])

# ==========================================
# 1. GASTOS
# ==========================================

@router.post("/gastos/", response_model=schemas.RegistroGasto)
async def crear_gasto(
    request: Request,
    gasto: schemas.RegistroGastoCreate, 
    db: Session = Depends(get_db), 
    current_user: models.Usuario = Depends(RoleChecker([1, 3])) # 1: Admin, 3: Logística
):
    # 1. Consultar información del Proveedor
    proveedor = db.query(models.CatProveedor).filter(models.CatProveedor.id_proveedor == gasto.id_proveedor).first()
    if not proveedor:
        raise HTTPException(status_code=404, detail="El proveedor especificado no existe.")

    # 2. Normalización Estricta del Número de Documento
    if proveedor.categoria != "ESTADO_O_TRIBUTO" and gasto.numero_documento and "-" in gasto.numero_documento:
        partes = gasto.numero_documento.split("-", 1)
        if len(partes) == 2:
            serie = partes[0]
            correlativo = partes[1].zfill(8) # Rellena con ceros a la izquierda hasta 8 dígitos
            gasto.numero_documento = f"{serie}-{correlativo}"

    # 3. Candado Lógico Anti-Duplicados Documentales
    if gasto.numero_documento:
        gasto_duplicado = db.query(models.RegistroGasto).filter(
            models.RegistroGasto.id_proveedor == gasto.id_proveedor,
            models.RegistroGasto.id_tipo_doc == gasto.id_tipo_doc,
            models.RegistroGasto.numero_documento == gasto.numero_documento,
            models.RegistroGasto.estado_registro == "ACTIVO"
        ).first()
        
        if gasto_duplicado:
            raise HTTPException(
                status_code=400, 
                detail=f"Duplicidad detectada: Ya existe un gasto registrado con el documento {gasto.numero_documento} para este proveedor."
            )

    # 4. Guardar en Base de Datos (Transacción Atómica ACID)
    try:
        nuevo_gasto = models.RegistroGasto(**gasto.model_dump())
        db.add(nuevo_gasto)
        db.flush()
        
        # --- AUDITORÍA: Registro de Creación ---
        await registrar_auditoria(
            db=db,
            id_usuario=current_user.id_usuario,
            endpoint=request.url.path,
            accion="CREACION GASTO",
            detalles=gasto.model_dump_json(), # Pydantic V2 convierte el payload a string JSON
            ip_address=request.client.host if request.client else "IP Desconocida"
        )
        
        db.commit()
        db.refresh(nuevo_gasto)
        return nuevo_gasto
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Error al crear gasto: {str(e)}")

@router.put("/gastos/{id_gasto}", response_model=schemas.RegistroGasto)
def actualizar_gasto(id_gasto: int, gasto_editado: schemas.RegistroGastoUpdate, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_user)):
    db_gasto = db.query(models.RegistroGasto).filter(models.RegistroGasto.id_gasto == id_gasto).first()
    if not db_gasto:
        raise HTTPException(status_code=404, detail="Gasto no encontrado")
        
    # Candado de Auditoría Financiera
    if db_gasto.estado_pago == "PAGADO":
        raise HTTPException(
            status_code=403, 
            detail="Acción rechazada por Auditoría: No se permite modificar un gasto que ya ha sido PAGADO."
        )
        
    update_data = gasto_editado.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_gasto, key, value)
        
    db.commit()
    db.refresh(db_gasto)
    return db_gasto

@router.get("/gastos/", response_model=schemas.PaginatedResponse[schemas.RegistroGasto])
def listar_gastos(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    search: Optional[str] = None,
    estado_pago: Optional[str] = None,
    db: Session = Depends(get_db), 
    current_user: models.Usuario = Depends(get_current_user)
):
    query = (
        db.query(models.RegistroGasto)
        .outerjoin(models.RegistroGasto.dam)
        .outerjoin(models.DetalleDam.maestro)
        .outerjoin(models.MaestroImportacion.importador_rel)
    )

    filtros = [models.RegistroGasto.estado_registro == "ACTIVO"]
    if estado_pago:
        if "," in estado_pago:
            estados = [e.strip() for e in estado_pago.split(",")]
            filtros.append(models.RegistroGasto.estado_pago.in_(estados))
        else:
            filtros.append(models.RegistroGasto.estado_pago == estado_pago)

    if search:
        termino = f"%{search}%"
        filtros.append(
            models.RegistroGasto.numero_documento.ilike(termino) |
            models.RegistroGasto.estado_pago.ilike(termino) |
            models.DetalleDam.numero_de_dam.ilike(termino) |
            models.MaestroImportacion.numero_factura.ilike(termino) |
            models.CatImportador.nombre.ilike(termino)
        )

    total_registros = query.filter(*filtros).with_entities(func.count(models.RegistroGasto.id_gasto)).scalar() or 0
    total_paginas = (total_registros + limit - 1) // limit if total_registros > 0 else 0

    data = (
        query
        .filter(*filtros)
        .options(
            joinedload(models.RegistroGasto.dam)
            .joinedload(models.DetalleDam.maestro)
            .joinedload(models.MaestroImportacion.importador_rel),
            joinedload(models.RegistroGasto.pagos)
        )
        .order_by(models.RegistroGasto.id_gasto.desc())
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )

    resultado = []
    for g in data:
        total_pagado = Decimal("0.00")
        for p in g.pagos:
            if p.estado_registro == "ACTIVO":
                importe_db = Decimal(str(p.importe))
                tc_db = Decimal(str(p.tipo_cambio_aplicado or p.tipo_cambio or "1.00"))
                if tc_db <= Decimal("0.00"):
                    tc_db = Decimal("1.00")
                total_pagado += calcular_amortizacion_cruzada(importe_db, tc_db, g.moneda, p.moneda)

        monto_base = Decimal(str(g.monto_original)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        saldo_calc = max(Decimal("0.00"), (monto_base - total_pagado).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))

        dam_obj = g.dam
        maestro_obj = dam_obj.maestro if dam_obj else None
        imp_obj = maestro_obj.importador_rel if maestro_obj else None

        g_dict = schemas.RegistroGasto(
            id_gasto=g.id_gasto,
            id_dam=g.id_dam,
            id_concepto=g.id_concepto,
            id_proveedor=g.id_proveedor,
            id_tipo_doc=g.id_tipo_doc,
            numero_documento=g.numero_documento,
            fecha_vencimiento=g.fecha_vencimiento,
            monto_original=g.monto_original,
            moneda=g.moneda,
            estado_pago=g.estado_pago,
            estado_registro=g.estado_registro,
            created_at=g.created_at,
            saldo_pendiente=saldo_calc,
            dam_numero=dam_obj.numero_de_dam if dam_obj else "N/A",
            maestro_factura=maestro_obj.numero_factura if maestro_obj else "N/A",
            id_importador=imp_obj.id_importador if imp_obj else None,
            importador_nombre=imp_obj.nombre if imp_obj else "Desconocido"
        )
        resultado.append(g_dict)

    return {
        "total_registros": total_registros,
        "pagina": page,
        "limite": limit,
        "total_paginas": total_paginas,
        "data": resultado
    }


@router.delete("/gastos/{id_gasto}")
def eliminar_gasto(id_gasto: int, req: schemas.EliminacionRequest, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_user)):
    gasto = db.query(models.RegistroGasto).filter(models.RegistroGasto.id_gasto == id_gasto).first()
    if not gasto:
        raise HTTPException(status_code=404, detail="Gasto no encontrado")
        
    tiene_pagos = db.query(models.RegistroPago).filter(models.RegistroPago.id_gasto == id_gasto).first()
    if tiene_pagos:
        raise HTTPException(
            status_code=400, 
            detail="❌ Bloqueo: No se puede eliminar el Gasto porque tiene Pagos asociados. Elimine primero los Pagos."
        )
        
    datos = {c.name: getattr(gasto, c.name) for c in gasto.__table__.columns}
    snapshot = {
        "Proveedor": gasto.proveedor_rel.nombre if gasto.proveedor_rel else "N/A",
        "Concepto": gasto.concepto_rel.nombre if gasto.concepto_rel else "N/A",
        "Tipo Documento": gasto.tipo_doc_rel.nombre_documento if hasattr(gasto, 'tipo_doc_rel') and gasto.tipo_doc_rel else "N/A"
    }
    respaldo = models.GastoEliminado(
        **datos, 
        motivo_eliminacion=req.motivo, 
        usuario_id=current_user.id_usuario,
        nombre_usuario_ejecutor=current_user.username,
        identificador_principal=f"Gasto {gasto.moneda}: {gasto.monto_original} (DAM: {gasto.id_dam})",
        detalles_legibles=snapshot
    )
    
    db.add(respaldo)
    db.delete(gasto)
    db.commit()
    return {"mensaje": f"Gasto {id_gasto} eliminado físicamente con respaldo de auditoría."}

# ==========================================
# 2. VOUCHERS
# ==========================================

@router.post("/vouchers/", response_model=schemas.VoucherBancarioResponse)
def crear_voucher(voucher: schemas.VoucherBancarioCreate, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_user)):
    nuevo_voucher = models.VoucherBancario(
        banco_id=voucher.banco_id,
        id_importador=voucher.id_importador,
        numero_operacion=voucher.numero_operacion,
        monto_total=voucher.monto_total,
        saldo_disponible=voucher.monto_total, # Saldo inicial = Monto total
        moneda=voucher.moneda,
        fecha_transferencia=voucher.fecha_transferencia
    )
    db.add(nuevo_voucher)
    db.commit()
    db.refresh(nuevo_voucher)
    return nuevo_voucher

@router.get("/vouchers/", response_model=schemas.PaginatedResponse[schemas.VoucherBancarioResponse])
def listar_vouchers(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    search: Optional[str] = None,
    saldo_mayor_cero: bool = False, 
    id_importador: Optional[int] = None, 
    db: Session = Depends(get_db), 
    current_user: models.Usuario = Depends(get_current_user)
):
    filtros = [models.VoucherBancario.estado_registro == "ACTIVO"]
    if saldo_mayor_cero:
        filtros.append(models.VoucherBancario.saldo_disponible > 0)
    if id_importador is not None:
        filtros.append(models.VoucherBancario.id_importador == id_importador)
    if search:
        filtros.append(models.VoucherBancario.numero_operacion.ilike(f"%{search}%"))

    total_registros = db.query(func.count(models.VoucherBancario.id_voucher)).filter(*filtros).scalar() or 0
    total_paginas = (total_registros + limit - 1) // limit if total_registros > 0 else 0

    data = (
        db.query(models.VoucherBancario)
        .filter(*filtros)
        .order_by(models.VoucherBancario.id_voucher.desc())
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

@router.put("/vouchers/{id_voucher}", response_model=schemas.VoucherBancarioResponse)
def actualizar_voucher(
    id_voucher: int, 
    voucher_editado: schemas.VoucherBancarioUpdate, 
    db: Session = Depends(get_db), 
    current_user: models.Usuario = Depends(get_current_user)
):
    voucher = db.query(models.VoucherBancario).filter(models.VoucherBancario.id_voucher == id_voucher).first()
    if not voucher:
        raise HTTPException(status_code=404, detail="Voucher no encontrado")

    update_data = voucher_editado.model_dump(exclude_unset=True)

    # Verificación de integridad contable
    tiene_pagos = voucher.monto_total != voucher.saldo_disponible

    if tiene_pagos:
        # Si ya tiene pagos aplicados, bloqueamos cambios que afecten liquidaciones
        if "monto_total" in update_data and update_data["monto_total"] != voucher.monto_total:
            raise HTTPException(
                status_code=400, 
                detail="❌ Bloqueo contable: No se puede modificar el monto total de un voucher que ya tiene pagos aplicados."
            )
        if "moneda" in update_data and update_data["moneda"] != voucher.moneda:
            raise HTTPException(
                status_code=400, 
                detail="❌ Bloqueo contable: No se puede cambiar la moneda de un voucher con pagos aplicados."
            )
        if "id_importador" in update_data and update_data["id_importador"] != voucher.id_importador:
            raise HTTPException(
                status_code=400, 
                detail="❌ Bloqueo contable: No se puede reasignar el importador de un voucher con pagos aplicados."
            )
    else:
        # Si aún no tiene pagos y se actualiza el monto_total, actualizamos también el saldo disponible
        if "monto_total" in update_data and update_data["monto_total"] is not None:
            voucher.saldo_disponible = update_data["monto_total"]

    for key, value in update_data.items():
        if key != "saldo_disponible":
            setattr(voucher, key, value)

    db.commit()
    db.refresh(voucher)
    return voucher

@router.delete("/vouchers/{id_voucher}")
def eliminar_voucher(id_voucher: int, req: schemas.EliminacionRequest, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_user)):
    voucher = db.query(models.VoucherBancario).filter(models.VoucherBancario.id_voucher == id_voucher).first()
    if not voucher:
        raise HTTPException(status_code=404, detail="Voucher no encontrado")
        
    if voucher.monto_total != voucher.saldo_disponible:
        raise HTTPException(status_code=400, detail="❌ Bloqueo: No se puede eliminar el voucher porque ya tiene pagos amarrados (saldo disponible menor al total).")

    cols_respaldo = {c.name for c in models.VoucherEliminado.__table__.columns}
    datos = {c.name: getattr(voucher, c.name) for c in voucher.__table__.columns if c.name in cols_respaldo}
    snapshot = {
        "Banco": getattr(voucher.banco_rel, "nombre", "N/A") if voucher.banco_rel else "N/A",
        "Numero Operacion": voucher.numero_operacion,
        "Importador": getattr(voucher.importador_rel, "nombre", "N/A") if voucher.importador_rel else "N/A"
    }
    respaldo = models.VoucherEliminado(
        **datos,
        motivo_eliminacion=req.motivo,
        usuario_id=current_user.id_usuario,
        nombre_usuario_ejecutor=current_user.username,
        identificador_principal=f"Voucher {voucher.numero_operacion} ({voucher.moneda})",
        detalles_legibles=snapshot
    )
    db.add(respaldo)
    db.delete(voucher)
    db.commit()
    return {"mensaje": f"Voucher {id_voucher} eliminado físicamente con respaldo de auditoría."}

# ==========================================
# 3. PAGOS
# ==========================================

@router.post("/pagos/", response_model=schemas.RegistroPago)
async def registrar_pago(
    request: Request,
    pago: schemas.RegistroPagoCreate, 
    db: Session = Depends(get_db), 
    current_user: models.Usuario = Depends(RoleChecker([1, 2])) # 1: Admin, 2: Tesorería
):
    # 0. Verificación de Idempotencia (Evita cobros dobles)
    clave_idempotencia = request.headers.get("Idempotency-Key") or request.headers.get("idempotency-key")
    if clave_idempotencia:
        registro_previo = db.query(models.RegistroIdempotencia).filter(
            models.RegistroIdempotencia.clave_idempotencia == clave_idempotencia
        ).first()
        if registro_previo:
            return json.loads(registro_previo.respuesta_json)

    if pago.id_gasto is None:
        raise HTTPException(status_code=400, detail="Debe proporcionar un id_gasto válido.")

    # 1. Búsqueda y Bloqueo de Pagados
    try:
        gasto = db.query(models.RegistroGasto).filter(models.RegistroGasto.id_gasto == pago.id_gasto).with_for_update(nowait=True).first()
    except OperationalError:
        raise HTTPException(status_code=409, detail="El registro está siendo modificado por otro usuario.")

    if not gasto:
        raise HTTPException(status_code=404, detail="El gasto asociado no existe.")
    
    if gasto.estado_pago == "PAGADO":
        raise HTTPException(status_code=400, detail="Operación rechazada: El gasto ya se encuentra totalmente PAGADO.")
    
    # Bloqueo de Voucher:
    voucher = None
    if pago.voucher_id:
        try:
            voucher = db.query(models.VoucherBancario).filter(models.VoucherBancario.id_voucher == pago.voucher_id).with_for_update(nowait=True).first()
        except OperationalError:
            raise HTTPException(status_code=409, detail="El voucher está siendo modificado por otro usuario.")
        
        if not voucher:
            raise HTTPException(status_code=404, detail="El voucher especificado no existe.")
            
        if voucher.id_importador != gasto.dam.maestro.id_importador:
            raise HTTPException(status_code=400, detail="Violación de integridad transaccional: El voucher no pertenece a la entidad importadora del gasto.")

        # Matemática y Validación de Saldos
        if voucher.saldo_disponible < pago.monto_moneda_origen:
            raise HTTPException(status_code=400, detail="Saldo insuficiente en el voucher.")
            
        # Resta el dinero del voucher
        voucher.saldo_disponible -= pago.monto_moneda_origen

    pago_dict = pago.model_dump()
    # Heredar datos operativos del gasto
    pago_dict["id_dam"] = gasto.id_dam
    pago_dict["id_concepto"] = gasto.id_concepto

    # Validar que el concepto exista
    concepto_existe = db.query(models.CatConceptoPago).filter(models.CatConceptoPago.id_concepto == pago_dict["id_concepto"]).first()
    if not concepto_existe:
        raise HTTPException(status_code=404, detail="El concepto de pago no existe en el catálogo.")

    # 2. Lógica de Parche de Auditoría (Tipo de Cambio SUNAT)
    tc_aplicado = pago_dict["tipo_cambio"]
    if not tc_aplicado or tc_aplicado <= Decimal("0.00"):
        tc_sunat = db.query(models.HistorialTipoCambio).filter(models.HistorialTipoCambio.fecha == date.today()).first()
        if not tc_sunat:
            raise HTTPException(
                status_code=400, 
                detail="No se proporcionó un tipo de cambio y no hay registro oficial de SUNAT para el día de hoy. Regístrelo en el sistema."
            )
        tc_aplicado = tc_sunat.precio_venta
        pago_dict["tipo_cambio"] = tc_aplicado
    
    # 3. Validación Financiera Estricta con Cuantización SUNAT (ROUND_HALF_UP - Dominio Puro)
    pagos_existentes = db.query(models.RegistroPago).filter(
        models.RegistroPago.id_gasto == pago_dict["id_gasto"],
        models.RegistroPago.estado_registro == "ACTIVO"
    ).all()

    total_ya_pagado = Decimal("0.00")
    for p in pagos_existentes:
        importe_db = Decimal(str(p.importe))
        tc_db = Decimal(str(p.tipo_cambio_aplicado or p.tipo_cambio or "1.00"))
        if tc_db <= Decimal("0.00"):
            tc_db = Decimal("1.00")
        total_ya_pagado += calcular_amortizacion_cruzada(importe_db, tc_db, gasto.moneda, p.moneda)

    monto_gasto_base = Decimal(str(gasto.monto_original)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    saldo_pendiente = (monto_gasto_base - total_ya_pagado).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    # Calcular el importe amortizado por el nuevo pago en la moneda del gasto
    nuevo_importe_amortizado = calcular_amortizacion_cruzada(
        Decimal(str(pago_dict["importe"])),
        tc_aplicado,
        gasto.moneda,
        pago_dict["moneda"]
    )

    # Tolerancia por diferenciales cambiarios
    margen_tolerancia = Decimal("0.05")
    
    if nuevo_importe_amortizado > (saldo_pendiente + margen_tolerancia):
        saldo_formateado = saldo_pendiente.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        raise HTTPException(
            status_code=400, 
            detail=f"Sobrepago detectado. El importe ingresado supera el saldo pendiente. Saldo restante: {gasto.moneda} {saldo_formateado}"
        )

    # 4. Guardar Pago Principal y Registrar Auditoría (Transacción Atómica ACID)
    try:
        nuevo_pago = models.RegistroPago(**pago_dict)
        db.add(nuevo_pago)
        
        saldo_pendiente_nuevo = (saldo_pendiente - nuevo_importe_amortizado).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

        # Cerrar el gasto si el pago es exacto (o se pasa por centavos permitidos)
        if saldo_pendiente_nuevo <= Decimal("0.00"):
            gasto.estado_pago = "PAGADO"
            
        # 5. Cierre Automático ZD (Ajuste Ficticio por centavos restantes reales)
        elif Decimal("0.00") < saldo_pendiente_nuevo <= margen_tolerancia:
            pago_ajuste = models.RegistroPago(
                id_dam=gasto.id_dam,
                id_concepto=gasto.id_concepto,
                moneda=gasto.moneda,
                importe=saldo_pendiente_nuevo,
                tipo_cambio=Decimal("1.00"),
                tipo_cambio_aplicado=Decimal("1.00"),
                estado_pago="PAGADO",
                fecha_pago=date.today(),
                id_importador=pago_dict.get("id_importador"),
                id_gasto=gasto.id_gasto,
                es_ajuste_sistema=True,
                voucher_id=None,
                pago_moneda_cruzada=False,
                gasto_financiero_tc=Decimal("0.00"),
                monto_moneda_origen=saldo_pendiente_nuevo
            )
            db.add(pago_ajuste)
            gasto.estado_pago = "PAGADO"
        else:
            gasto.estado_pago = "PARCIAL"

        # db.flush() asigna los IDs autoincrementales sin cerrar la transacción física
        db.flush()

        # Guardar registro de idempotencia si se envió la cabecera
        if clave_idempotencia:
            pago_serializado = json.dumps(jsonable_encoder(schemas.RegistroPago.model_validate(nuevo_pago)))
            nuevo_idemp = models.RegistroIdempotencia(
                clave_idempotencia=clave_idempotencia,
                endpoint=request.url.path,
                respuesta_json=pago_serializado
            )
            db.add(nuevo_idemp)

        # --- AUDITORÍA: Registro de Creación ---
        await registrar_auditoria(
            db=db,
            id_usuario=current_user.id_usuario,
            endpoint=request.url.path,
            accion="CREACION PAGO",
            detalles=pago.model_dump_json(), # Pydantic V2
            ip_address=request.client.host if request.client else "IP Desconocida"
        )

        # db.commit() al final absoluto para sellar pago + ajuste + idempotencia + auditoría simultáneamente
        db.commit()
        db.refresh(nuevo_pago)
        return nuevo_pago
        
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Error en transacción: {str(e)}")

@router.put("/pagos/{id_pago}", response_model=schemas.RegistroPago)
def actualizar_pago(id_pago: int, pago_editado: schemas.RegistroPagoUpdate, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_user)):
    db_pago = db.query(models.RegistroPago).filter(models.RegistroPago.id_pago == id_pago).first()
    if not db_pago:
        raise HTTPException(status_code=404, detail="Pago no encontrado")
        
    update_data = pago_editado.model_dump(exclude_unset=True)
    
    # Candado de Auditoría Financiera
    if "importe" in update_data or "moneda" in update_data:
        raise HTTPException(
            status_code=403,
            detail="Acción rechazada por Auditoría: No se permite modificar el importe ni la moneda de un pago ya registrado. Si hubo un error, proceda a la anulación o extorno."
        )
        
    for key, value in update_data.items():
        setattr(db_pago, key, value)
        
    db.commit()
    db.refresh(db_pago)
    return db_pago

@router.get("/pagos/", response_model=schemas.PaginatedResponse[schemas.RegistroPago])
def listar_pagos(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    search: Optional[str] = None,
    db: Session = Depends(get_db), 
    current_user: models.Usuario = Depends(get_current_user)
):
    filtros = []
    if search:
        termino = f"%{search}%"
        filtros.append(
            models.RegistroPago.estado_pago.ilike(termino) |
            models.RegistroPago.moneda.ilike(termino)
        )

    total_registros = db.query(func.count(models.RegistroPago.id_pago)).filter(*filtros).scalar() or 0
    total_paginas = (total_registros + limit - 1) // limit if total_registros > 0 else 0

    data = (
        db.query(models.RegistroPago)
        .filter(*filtros)
        .order_by(models.RegistroPago.id_pago.desc())
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

@router.delete("/pagos/{id_pago}")
def eliminar_pago(id_pago: int, req: schemas.EliminacionRequest, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_user)):
    pago = db.query(models.RegistroPago).filter(models.RegistroPago.id_pago == id_pago).first()
    if not pago:
        raise HTTPException(status_code=404, detail="Pago no encontrado")
        
    id_gasto_afectado = pago.id_gasto
    es_ajuste_actual = pago.es_ajuste_sistema

    try:
        # Reversión de Dinero al Voucher
        if pago.voucher_rel:
            pago.voucher_rel.saldo_disponible += pago.monto_moneda_origen
            
        # 1. Respaldo del pago principal
        datos = {c.name: getattr(pago, c.name) for c in pago.__table__.columns}
        snapshot = {
            "Voucher": pago.voucher_rel.numero_operacion if pago.voucher_rel else "N/A",
            "Banco": pago.voucher_rel.banco_rel.nombre if (pago.voucher_rel and pago.voucher_rel.banco_rel) else "N/A",
            "Importador": pago.importador.nombre if pago.importador else "N/A",
            "Concepto": pago.concepto_rel.nombre if pago.concepto_rel else "N/A",
            "DAM": pago.dam.numero_de_dam if pago.dam else "N/A",
            "Ref. Gasto": f"{pago.gasto_rel.monto_original} {pago.gasto_rel.moneda}" if pago.gasto_rel else "N/A"
        }
        respaldo = models.PagoEliminado(
            **datos, 
            motivo_eliminacion=req.motivo, 
            usuario_id=current_user.id_usuario,
            nombre_usuario_ejecutor=current_user.username,
            identificador_principal=f"Pago {pago.id_pago}",
            detalles_legibles=snapshot
        )
        db.add(respaldo)
        
        # 2. Ejecución Física del pago principal
        db.delete(pago)
        db.flush() 
        
        # 3. Lógica Contable: Reversión ZD y Recálculo Dinámico
        if id_gasto_afectado:
            gasto = db.query(models.RegistroGasto).filter(models.RegistroGasto.id_gasto == id_gasto_afectado).first()
            
            if gasto:
                # A. Reversión de Ajuste ZD huérfano
                if not es_ajuste_actual:
                    pago_zd = db.query(models.RegistroPago).filter(
                        models.RegistroPago.id_gasto == id_gasto_afectado,
                        models.RegistroPago.es_ajuste_sistema == True
                    ).first()
                    
                    if pago_zd:
                        if pago_zd.voucher_rel:
                            pago_zd.voucher_rel.saldo_disponible += pago_zd.monto_moneda_origen
                        
                        datos_zd = {c.name: getattr(pago_zd, c.name) for c in pago_zd.__table__.columns}
                        snapshot_zd = {
                            "Voucher": pago_zd.voucher_rel.numero_operacion if pago_zd.voucher_rel else "N/A",
                            "Banco": pago_zd.voucher_rel.banco_rel.nombre if (pago_zd.voucher_rel and pago_zd.voucher_rel.banco_rel) else "N/A",
                            "Importador": pago_zd.importador.nombre if pago_zd.importador else "N/A",
                            "Concepto": pago_zd.concepto_rel.nombre if pago_zd.concepto_rel else "N/A",
                            "DAM": pago_zd.dam.numero_de_dam if pago_zd.dam else "N/A",
                            "Ref. Gasto": f"{pago_zd.gasto_rel.monto_original} {pago_zd.gasto_rel.moneda}" if pago_zd.gasto_rel else "N/A"
                        }
                        respaldo_zd = models.PagoEliminado(
                            **datos_zd,
                            motivo_eliminacion=f"Reversión contable automática por eliminación del pago padre ID: {id_pago}",
                            usuario_id=current_user.id_usuario,
                            nombre_usuario_ejecutor=current_user.username,
                            identificador_principal=f"Pago ZD {pago_zd.id_pago}",
                            detalles_legibles=snapshot_zd
                        )
                        db.add(respaldo_zd)
                        db.delete(pago_zd)
                        db.flush() 
                
                # B. Cálculo de saldos dinámicos según la moneda del gasto
                if gasto.moneda == "USD":
                    case_expr = case(
                        (models.RegistroPago.moneda == "USD", models.RegistroPago.importe),
                        (models.RegistroPago.moneda == "PEN", models.RegistroPago.importe / func.coalesce(models.RegistroPago.tipo_cambio_aplicado, models.RegistroPago.tipo_cambio, 1)),
                        else_=0
                    )
                else: # gasto.moneda == "PEN"
                    case_expr = case(
                        (models.RegistroPago.moneda == "PEN", models.RegistroPago.importe),
                        (models.RegistroPago.moneda == "USD", models.RegistroPago.importe * func.coalesce(models.RegistroPago.tipo_cambio_aplicado, models.RegistroPago.tipo_cambio, 1)),
                        else_=0
                    )

                total_pagado_base = db.query(func.sum(case_expr)).filter(
                    models.RegistroPago.id_gasto == id_gasto_afectado,
                    models.RegistroPago.estado_registro == "ACTIVO"
                ).scalar()
                
                total_pagado_base = (Decimal(str(total_pagado_base)) if total_pagado_base else Decimal("0.00")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
                monto_gasto_base = Decimal(str(gasto.monto_original)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
                
                saldo_pendiente = (monto_gasto_base - total_pagado_base).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
                margen_tolerancia = Decimal("0.05")
                
                # C. Asignación Dinámica del Estado
                if saldo_pendiente >= monto_gasto_base:
                    gasto.estado_pago = "PENDIENTE"
                elif saldo_pendiente > margen_tolerancia:
                    gasto.estado_pago = "PARCIAL"
                else:
                    gasto.estado_pago = "PAGADO"
                    
        db.commit()
        return {"mensaje": f"Pago {id_pago} eliminado exitosamente. Saldos recalculados y sincronizados en los registros de auditoría."}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Error al eliminar pago: {str(e)}")
