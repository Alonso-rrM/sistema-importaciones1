from typing import List, Optional
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP
import json
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, joinedload
from sqlalchemy.orm.exc import StaleDataError
from sqlalchemy import func

import models
from services.errores import error_interno, rechazar_si_invalido
from domain.validaciones import limpiar_texto, normalizar_cda, normalizar_comprobante
import schemas
from dependencies import get_db, get_current_user, RoleChecker
from services.audit import registrar_auditoria, registrar_auditoria_sync
from services.state_machine import evaluar_gatillos_gastos_dam
from services.excel_exporter import generar_excel_gastos
import services.pagos as servicio_pagos
from services.pagos import TC_MAXIMO, TC_MINIMO, ContextoPeticion, expediente_cerrado
from domain.finanzas import calcular_amortizacion_cruzada
from constantes import (
    AccionAuditoria,
    CategoriaProveedor,
    ClaseAduanera,
    EstadoDocumentario,
    EstadoPago,
    EstadoRegistro,
    ROLES_FINANZAS,
    ROLES_OPERACIONES,
    ROLES_OPERACIONES_Y_FINANZAS,
    Rol,
)

router = APIRouter(tags=["Finanzas"])

# ==========================================
# 0. REGLAS DEL SERVIDOR (las de pagos viven en services/pagos.py)
# ==========================================
def validar_voucher_unico(db: Session, banco_id: int, numero_operacion: str, excluir_id: Optional[int] = None):
    """Un mismo depósito (banco + N° de operación) no puede registrarse dos veces: duplicaría fondos."""
    q = db.query(models.VoucherBancario).filter(
        models.VoucherBancario.banco_id == banco_id,
        func.upper(func.trim(models.VoucherBancario.numero_operacion)) == (numero_operacion or "").strip().upper(),
        models.VoucherBancario.estado_registro == EstadoRegistro.ACTIVO,
    )
    if excluir_id is not None:
        q = q.filter(models.VoucherBancario.id_voucher != excluir_id)
    if q.first():
        raise HTTPException(status_code=400, detail=f"Duplicidad detectada: ya existe un voucher con el N° de operación '{numero_operacion}' en este banco.")


# ==========================================
# 1. GASTOS
# ==========================================

def _numero_documento_del_gasto(proveedor: models.CatProveedor, concepto: Optional[models.CatConceptoPago],
                                numero: Optional[str]) -> Optional[str]:
    """
    Forma canónica del N° de documento de un gasto:
    - concepto del Estado (clase aduanera tributo, percepción u OMC) -> C.D.A. de SUNAT
      (118-26-10-535304-25-4-01): cada uno de esos gastos tiene su propio C.D.A.;
    - si no, proveedor nacional -> comprobante SERIE-CORRELATIVO (F001-00000123);
      del exterior o el Estado -> el texto tal como se digitó, sin espacios sobrantes.
    """
    if concepto is not None and concepto.clase_aduanera not in (None, ClaseAduanera.NINGUNA):
        return rechazar_si_invalido(normalizar_cda, numero)
    if proveedor.categoria in (CategoriaProveedor.INTERNACIONAL, CategoriaProveedor.ESTADO_O_TRIBUTO):
        return limpiar_texto(numero)
    return rechazar_si_invalido(normalizar_comprobante, numero)


def _rechazar_documento_repetido(db: Session, id_proveedor: int, id_tipo_doc: int, numero: Optional[str],
                                 excepto_id: Optional[int] = None) -> None:
    """Candado anti-duplicados: un mismo comprobante del mismo proveedor solo se registra una vez."""
    if not numero:
        return
    consulta = db.query(models.RegistroGasto.id_gasto).filter(
        models.RegistroGasto.id_proveedor == id_proveedor,
        models.RegistroGasto.id_tipo_doc == id_tipo_doc,
        models.RegistroGasto.numero_documento == numero,
        models.RegistroGasto.estado_registro == EstadoRegistro.ACTIVO,
    )
    if excepto_id is not None:
        consulta = consulta.filter(models.RegistroGasto.id_gasto != excepto_id)
    if consulta.first():
        raise HTTPException(
            status_code=400,
            detail=f"Duplicidad detectada: Ya existe un gasto registrado con el documento {numero} para este proveedor."
        )


@router.post("/gastos/", response_model=schemas.RegistroGasto)
async def crear_gasto(
    request: Request,
    gasto: schemas.RegistroGastoCreate, 
    db: Session = Depends(get_db), 
    current_user: models.Usuario = Depends(RoleChecker(ROLES_OPERACIONES)) # 1: Admin, 2: Logística
):
    # 1. Consultar información del Proveedor
    proveedor = db.query(models.CatProveedor).filter(models.CatProveedor.id_proveedor == gasto.id_proveedor).first()
    if not proveedor:
        raise HTTPException(status_code=404, detail="El proveedor especificado no existe.")

    # Candado Asimétrico de Cierre: Solo se bloquea si el expediente culminó todo su ciclo físico en almacén
    dam_padre = db.query(models.DetalleDam).filter(models.DetalleDam.id_dam == gasto.id_dam).first()
    if dam_padre and dam_padre.maestro and dam_padre.maestro.estado_documentario == EstadoDocumentario.ATENCION_TOTAL and current_user.id_rol != Rol.SUPERADMIN:
        raise HTTPException(status_code=403, detail="Operación Denegada: El expediente se encuentra en ATENCIÓN TOTAL. No se pueden agregar nuevos gastos a una operación concluida.")

    # 2. Número de documento en su forma canónica (según el proveedor) y 3. candado anti-duplicados
    concepto = db.get(models.CatConceptoPago, gasto.id_concepto)
    gasto.numero_documento = _numero_documento_del_gasto(proveedor, concepto, gasto.numero_documento)
    _rechazar_documento_repetido(db, gasto.id_proveedor, gasto.id_tipo_doc, gasto.numero_documento)

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
            accion=AccionAuditoria.CREACION_GASTO,
            detalles=gasto.model_dump_json(), # Pydantic V2 convierte el payload a string JSON
            ip_address=request.client.host if request.client else "IP Desconocida"
        )
        
        db.commit()
        db.refresh(nuevo_gasto)
        
        # Disparador Reactivo: Evaluar si el gasto activa Proforma u OMC
        evaluar_gatillos_gastos_dam(db, nuevo_gasto.id_dam)
        
        return nuevo_gasto
    except Exception as e:
        db.rollback()
        raise error_interno("Error al crear gasto", e, 400)

@router.put("/gastos/{id_gasto}", response_model=schemas.RegistroGasto)
def actualizar_gasto(id_gasto: int, gasto_editado: schemas.RegistroGastoUpdate, db: Session = Depends(get_db), current_user: models.Usuario = Depends(RoleChecker(ROLES_OPERACIONES_Y_FINANZAS))):  # 1: Admin, 2: Logística, 3: Tesorería (solo observaciones)
    db_gasto = db.query(models.RegistroGasto).filter(models.RegistroGasto.id_gasto == id_gasto).first()
    if not db_gasto:
        raise HTTPException(status_code=404, detail="Gasto no encontrado")

    update_data = gasto_editado.model_dump(exclude_unset=True)

    if current_user.id_rol == Rol.FINANZAS and set(update_data) - {"observaciones"}:
        raise HTTPException(status_code=403, detail="Tesorería solo puede editar las observaciones de un gasto.")

    # Candado ATE. TOTAL
    maestro_gasto = db_gasto.dam.maestro if db_gasto.dam else None
    if maestro_gasto and maestro_gasto.estado_documentario == EstadoDocumentario.ATENCION_TOTAL and current_user.id_rol != Rol.SUPERADMIN:
        raise HTTPException(status_code=403, detail="Operación Denegada: El expediente se encuentra en ATENCIÓN TOTAL.")

    # Candado de Auditoría Financiera: con pagos aplicados (PARCIAL o PAGADO), solo se permite actualizar observaciones
    if db_gasto.estado_pago in (EstadoPago.PAGADO, EstadoPago.PARCIAL):
        campos_protegidos = ["id_dam", "id_concepto", "id_proveedor", "id_tipo_doc", "numero_documento", "fecha_vencimiento", "monto_original", "moneda"]
        cambio_protegido = False
        for campo in campos_protegidos:
            if campo in update_data:
                val_nuevo = update_data[campo]
                val_actual = getattr(db_gasto, campo)
                if campo == "monto_original" and val_nuevo is not None and val_actual is not None:
                    if Decimal(str(val_nuevo)).quantize(Decimal("0.01")) != Decimal(str(val_actual)).quantize(Decimal("0.01")):
                        cambio_protegido = True
                elif val_nuevo != val_actual:
                    cambio_protegido = True
        if cambio_protegido:
            raise HTTPException(
                status_code=403, 
                detail="Acción rechazada por Auditoría: No se permite modificar montos ni documentos de un gasto con pagos aplicados (solo se permite editar Observaciones). Anule primero los pagos."
            )
        if "observaciones" in update_data:
            db_gasto.observaciones = update_data["observaciones"]
            db.commit()
            db.refresh(db_gasto)
        return db_gasto

    # Documento: se normaliza y se revisa contra duplicados solo si cambia él o su emisor
    # (un gasto antiguo con otro formato se puede seguir editando sin tocar su documento)
    if any(campo in update_data and update_data[campo] != getattr(db_gasto, campo)
           for campo in ("numero_documento", "id_proveedor", "id_tipo_doc", "id_concepto")):
        id_proveedor = update_data.get("id_proveedor") or db_gasto.id_proveedor
        proveedor = db.query(models.CatProveedor).filter(models.CatProveedor.id_proveedor == id_proveedor).first()
        if not proveedor:
            raise HTTPException(status_code=404, detail="El proveedor especificado no existe.")
        numero = update_data["numero_documento"] if "numero_documento" in update_data else db_gasto.numero_documento
        concepto = db.get(models.CatConceptoPago, update_data.get("id_concepto") or db_gasto.id_concepto)
        numero = _numero_documento_del_gasto(proveedor, concepto, numero)
        if "numero_documento" in update_data or numero != db_gasto.numero_documento:
            update_data["numero_documento"] = numero
        _rechazar_documento_repetido(db, id_proveedor, update_data.get("id_tipo_doc") or db_gasto.id_tipo_doc,
                                     numero, excepto_id=id_gasto)

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
    moneda: Optional[str] = None,
    tipo_gasto: Optional[str] = None,
    id_concepto: Optional[int] = None,
    id_proveedor: Optional[int] = None,
    vencimiento: Optional[str] = None,
    db: Session = Depends(get_db), 
    current_user: models.Usuario = Depends(get_current_user)
):
    query = (
        db.query(models.RegistroGasto)
        .outerjoin(models.RegistroGasto.dam)
        .outerjoin(models.DetalleDam.maestro)
        .outerjoin(models.MaestroImportacion.importador_rel)
        .outerjoin(models.RegistroGasto.concepto_rel)
        .outerjoin(models.RegistroGasto.proveedor_rel)
    )

    filtros = [models.RegistroGasto.estado_registro == EstadoRegistro.ACTIVO]
    if estado_pago:
        if "," in estado_pago:
            estados = [e.strip() for e in estado_pago.split(",")]
            filtros.append(models.RegistroGasto.estado_pago.in_(estados))
        else:
            filtros.append(models.RegistroGasto.estado_pago == estado_pago)

    if moneda:
        filtros.append(models.RegistroGasto.moneda == moneda)

    if tipo_gasto:
        filtros.append(models.CatConceptoPago.tipo_gasto == tipo_gasto)

    if id_concepto:
        filtros.append(models.RegistroGasto.id_concepto == id_concepto)

    if id_proveedor:
        filtros.append(models.RegistroGasto.id_proveedor == id_proveedor)

    if vencimiento:
        hoy = date.today()
        if vencimiento == "VENCIDOS":
            filtros.append(
                (models.RegistroGasto.fecha_vencimiento < hoy) &
                (models.RegistroGasto.estado_pago != EstadoPago.PAGADO)
            )
        elif vencimiento == "POR_VENCER_7D":
            limite_7d = hoy + timedelta(days=7)
            filtros.append(
                (models.RegistroGasto.fecha_vencimiento >= hoy) &
                (models.RegistroGasto.fecha_vencimiento <= limite_7d) &
                (models.RegistroGasto.estado_pago != EstadoPago.PAGADO)
            )

    if search:
        termino = f"%{search.strip()}%"
        filtros.append(
            models.RegistroGasto.numero_documento.ilike(termino) |
            models.RegistroGasto.observaciones.ilike(termino) |
            models.RegistroGasto.estado_pago.ilike(termino) |
            models.DetalleDam.numero_de_dam.ilike(termino) |
            models.MaestroImportacion.numero_factura.ilike(termino) |
            models.CatImportador.nombre.ilike(termino) |
            models.CatProveedor.nombre.ilike(termino) |
            models.CatConceptoPago.nombre.ilike(termino)
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
            .joinedload(models.RegistroPago.voucher_rel)
            .joinedload(models.VoucherBancario.banco_rel),
            joinedload(models.RegistroGasto.proveedor_rel),
            joinedload(models.RegistroGasto.concepto_rel),
            joinedload(models.RegistroGasto.tipo_doc_rel)
        )
        .order_by(models.RegistroGasto.id_gasto.asc())
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )

    resultado = []
    for g in data:
        total_pagado = Decimal("0.00")
        pagos_lista = []
        for p in g.pagos:
            if p.estado_registro == EstadoRegistro.ACTIVO:
                importe_db = Decimal(str(p.importe))
                tc_db = Decimal(str(p.tipo_cambio_aplicado or p.tipo_cambio or "1.00"))
                if tc_db <= Decimal("0.00"):
                    tc_db = Decimal("1.00")
                total_pagado += calcular_amortizacion_cruzada(importe_db, tc_db, g.moneda, p.moneda)

                v_rel = p.voucher_rel
                banco_nom = v_rel.banco_rel.nombre if (v_rel and v_rel.banco_rel) else None
                num_op = v_rel.numero_operacion if v_rel else ("Ajuste ZD" if p.es_ajuste_sistema else "S/V")
                pagos_lista.append(schemas.PagoDetalleSimple(
                    id_pago=p.id_pago,
                    fecha_pago=p.fecha_pago,
                    moneda=p.moneda,
                    importe=p.importe,
                    tipo_cambio=tc_db,
                    voucher_id=p.voucher_id,
                    numero_operacion=num_op,
                    banco_nombre=banco_nom,
                    monto_moneda_origen=p.monto_moneda_origen,
                    es_ajuste_sistema=p.es_ajuste_sistema or False
                ))

        monto_base = Decimal(str(g.monto_original)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        saldo_calc = max(Decimal("0.00"), (monto_base - total_pagado).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))

        dam_obj = g.dam
        maestro_obj = dam_obj.maestro if dam_obj else None
        imp_obj = maestro_obj.importador_rel if maestro_obj else None

        prov_nombre = None
        if g.proveedor_rel:
            prov_nombre = f"{g.proveedor_rel.ruc} - {g.proveedor_rel.nombre}" if g.proveedor_rel.ruc else g.proveedor_rel.nombre

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
            observaciones=g.observaciones,
            estado_pago=g.estado_pago,
            estado_registro=g.estado_registro,
            created_at=g.created_at,
            saldo_pendiente=saldo_calc,
            dam_numero=dam_obj.numero_de_dam if dam_obj else "N/A",
            maestro_factura=maestro_obj.numero_factura if maestro_obj else "N/A",
            id_importador=imp_obj.id_importador if imp_obj else None,
            importador_nombre=imp_obj.nombre if imp_obj else "Desconocido",
            proveedor_nombre=prov_nombre,
            concepto_nombre=g.concepto_rel.nombre if g.concepto_rel else None,
            tipo_doc_nombre=g.tipo_doc_rel.nombre_documento if g.tipo_doc_rel else None,
            pagos_detalle=pagos_lista
        )
        resultado.append(g_dict)

    return {
        "total_registros": total_registros,
        "pagina": page,
        "limite": limit,
        "total_paginas": total_paginas,
        "data": resultado
    }

@router.get("/gastos/exportar")
def exportar_gastos_excel(
    search: Optional[str] = None,
    estado_pago: Optional[str] = None,
    moneda: Optional[str] = None,
    tipo_gasto: Optional[str] = None,
    id_concepto: Optional[int] = None,
    id_proveedor: Optional[int] = None,
    vencimiento: Optional[str] = None,
    db: Session = Depends(get_db), 
    current_user: models.Usuario = Depends(get_current_user)
):
    query = (
        db.query(models.RegistroGasto)
        .outerjoin(models.RegistroGasto.dam)
        .outerjoin(models.DetalleDam.maestro)
        .outerjoin(models.MaestroImportacion.importador_rel)
        .outerjoin(models.RegistroGasto.concepto_rel)
        .outerjoin(models.RegistroGasto.proveedor_rel)
        .outerjoin(models.RegistroGasto.tipo_doc_rel)
    )

    filtros = [models.RegistroGasto.estado_registro == EstadoRegistro.ACTIVO]
    if estado_pago:
        if "," in estado_pago:
            estados = [e.strip() for e in estado_pago.split(",")]
            filtros.append(models.RegistroGasto.estado_pago.in_(estados))
        else:
            filtros.append(models.RegistroGasto.estado_pago == estado_pago)

    if moneda:
        filtros.append(models.RegistroGasto.moneda == moneda)

    if tipo_gasto:
        filtros.append(models.CatConceptoPago.tipo_gasto == tipo_gasto)

    if id_concepto:
        filtros.append(models.RegistroGasto.id_concepto == id_concepto)

    if id_proveedor:
        filtros.append(models.RegistroGasto.id_proveedor == id_proveedor)

    if vencimiento:
        hoy = date.today()
        if vencimiento == "VENCIDOS":
            filtros.append(
                (models.RegistroGasto.fecha_vencimiento < hoy) &
                (models.RegistroGasto.estado_pago != EstadoPago.PAGADO)
            )
        elif vencimiento == "POR_VENCER_7D":
            limite_7d = hoy + timedelta(days=7)
            filtros.append(
                (models.RegistroGasto.fecha_vencimiento >= hoy) &
                (models.RegistroGasto.fecha_vencimiento <= limite_7d) &
                (models.RegistroGasto.estado_pago != EstadoPago.PAGADO)
            )

    if search:
        termino = f"%{search.strip()}%"
        filtros.append(
            models.RegistroGasto.numero_documento.ilike(termino) |
            models.RegistroGasto.observaciones.ilike(termino) |
            models.RegistroGasto.estado_pago.ilike(termino) |
            models.DetalleDam.numero_de_dam.ilike(termino) |
            models.MaestroImportacion.numero_factura.ilike(termino) |
            models.CatImportador.nombre.ilike(termino) |
            models.CatProveedor.nombre.ilike(termino) |
            models.CatConceptoPago.nombre.ilike(termino)
        )

    gastos = (
        query
        .filter(*filtros)
        .options(
            joinedload(models.RegistroGasto.dam)
            .joinedload(models.DetalleDam.maestro)
            .joinedload(models.MaestroImportacion.importador_rel),
            joinedload(models.RegistroGasto.pagos),
            joinedload(models.RegistroGasto.proveedor_rel),
            joinedload(models.RegistroGasto.concepto_rel),
            joinedload(models.RegistroGasto.tipo_doc_rel)
        )
        .order_by(
            models.MaestroImportacion.numero_factura.asc(),
            models.DetalleDam.numero_de_dam.asc(),
            models.RegistroGasto.fecha_vencimiento.asc(),
            models.RegistroGasto.id_gasto.asc()
        )
        .all()
    )

    stream, filename = generar_excel_gastos(gastos)
    return StreamingResponse(
        stream,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Access-Control-Expose-Headers": "Content-Disposition"
        }
    )

@router.get("/gastos/{id_gasto}/pagos", response_model=List[schemas.PagoDetalleSimple])
def obtener_pagos_de_gasto(
    id_gasto: int,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user)
):
    pagos = (
        db.query(models.RegistroPago)
        .filter(
            models.RegistroPago.id_gasto == id_gasto,
            models.RegistroPago.estado_registro == EstadoRegistro.ACTIVO
        )
        .options(
            joinedload(models.RegistroPago.voucher_rel).joinedload(models.VoucherBancario.banco_rel)
        )
        .order_by(models.RegistroPago.id_pago.asc())
        .all()
    )
    resultado = []
    for p in pagos:
        v_rel = p.voucher_rel
        banco_nom = v_rel.banco_rel.nombre if (v_rel and v_rel.banco_rel) else None
        num_op = v_rel.numero_operacion if v_rel else ("Ajuste ZD" if p.es_ajuste_sistema else "S/V")
        tc_val = Decimal(str(p.tipo_cambio_aplicado or p.tipo_cambio or "1.00"))
        resultado.append(schemas.PagoDetalleSimple(
            id_pago=p.id_pago,
            fecha_pago=p.fecha_pago,
            moneda=p.moneda,
            importe=p.importe,
            tipo_cambio=tc_val,
            voucher_id=p.voucher_id,
            numero_operacion=num_op,
            banco_nombre=banco_nom,
            monto_moneda_origen=p.monto_moneda_origen,
            es_ajuste_sistema=p.es_ajuste_sistema or False
        ))
    return resultado

@router.delete("/gastos/{id_gasto}")
def eliminar_gasto(
    id_gasto: int, 
    req: schemas.EliminacionRequest, 
    forzar_reversion_pagos: bool = Query(False),
    db: Session = Depends(get_db), 
    current_user: models.Usuario = Depends(RoleChecker(ROLES_OPERACIONES)) # 1: Admin, 2: Logística
):
    gasto = db.query(models.RegistroGasto).filter(models.RegistroGasto.id_gasto == id_gasto).first()
    if not gasto:
        raise HTTPException(status_code=404, detail="Gasto no encontrado")

    if expediente_cerrado(gasto) and current_user.id_rol != Rol.SUPERADMIN:
        raise HTTPException(status_code=403, detail="Operación Denegada: El expediente se encuentra en ATENCIÓN TOTAL. Solicite desbloqueo al Administrador.")

    pagos_asociados = (
        db.query(models.RegistroPago)
        .filter(
            models.RegistroPago.id_gasto == id_gasto,
            models.RegistroPago.estado_registro == EstadoRegistro.ACTIVO
        )
        .options(
            joinedload(models.RegistroPago.voucher_rel).joinedload(models.VoucherBancario.banco_rel),
            joinedload(models.RegistroPago.dam),
            joinedload(models.RegistroPago.importador),
            joinedload(models.RegistroPago.concepto_rel)
        )
        .all()
    )
    
    if pagos_asociados:
        if not forzar_reversion_pagos:
            total_amortizado = sum([Decimal(str(p.importe)) for p in pagos_asociados])
            raise HTTPException(
                status_code=400, 
                detail=f"❌ Bloqueo: El gasto tiene {len(pagos_asociados)} pago(s) asociado(s) por un total de {total_amortizado} {gasto.moneda}. Puede eliminarlos individualmente o confirmar la eliminación con reversión de pagos."
            )
        # Segregación de funciones: revertir pagos es potestad de Tesorería; Logística no puede deshacer egresos.
        if current_user.id_rol != Rol.SUPERADMIN:
            raise HTTPException(
                status_code=403,
                detail="Segregación de funciones: solo el Administrador puede eliminar un gasto revirtiendo sus pagos. Solicite a Tesorería anular primero los pagos."
            )

        # Reversión de pagos en cascada
        cols_respaldo_pago = {c.name for c in models.PagoEliminado.__table__.columns}
        for pago in pagos_asociados:
            if pago.voucher_rel:
                pago.voucher_rel.saldo_disponible += pago.monto_moneda_origen
                
            datos_pago = {c.name: getattr(pago, c.name) for c in pago.__table__.columns if c.name in cols_respaldo_pago}
            snapshot_pago = {
                "Voucher": pago.voucher_rel.numero_operacion if pago.voucher_rel else "N/A",
                "Banco": pago.voucher_rel.banco_rel.nombre if (pago.voucher_rel and pago.voucher_rel.banco_rel) else "N/A",
                "Importador": pago.importador.nombre if pago.importador else "N/A",
                "Concepto": pago.concepto_rel.nombre if pago.concepto_rel else "N/A",
                "DAM": pago.dam.numero_de_dam if pago.dam else "N/A",
                "Ref. Gasto": f"Gasto #{id_gasto} ({gasto.monto_original} {gasto.moneda})"
            }
            respaldo_pago = models.PagoEliminado(
                **datos_pago,
                motivo_eliminacion=f"Reversión automática en cascada por anulación de Gasto #{id_gasto}: {req.motivo}",
                usuario_id=current_user.id_usuario,
                nombre_usuario_ejecutor=current_user.username,
                identificador_principal=f"Pago {pago.id_pago}",
                detalles_legibles=snapshot_pago
            )
            db.add(respaldo_pago)
            db.delete(pago)
            
        db.flush()
        
    cols_respaldo = {c.name for c in models.GastoEliminado.__table__.columns}
    datos = {c.name: getattr(gasto, c.name) for c in gasto.__table__.columns if c.name in cols_respaldo}
    snapshot = {
        "Proveedor": gasto.proveedor_rel.nombre if gasto.proveedor_rel else "N/A",
        "Concepto": gasto.concepto_rel.nombre if gasto.concepto_rel else "N/A",
        "Tipo Documento": gasto.tipo_doc_rel.nombre_documento if hasattr(gasto, 'tipo_doc_rel') and gasto.tipo_doc_rel else "N/A",
        "Observaciones": gasto.observaciones or "Sin observaciones"
    }
    respaldo = models.GastoEliminado(
        **datos, 
        motivo_eliminacion=req.motivo, 
        usuario_id=current_user.id_usuario,
        nombre_usuario_ejecutor=current_user.username,
        identificador_principal=f"Gasto {gasto.moneda}: {gasto.monto_original} (DAM: {gasto.id_dam})",
        detalles_legibles=snapshot
    )
    
    id_dam_padre = gasto.id_dam
    db.add(respaldo)
    db.delete(gasto)
    db.commit()

    if id_dam_padre:
        evaluar_gatillos_gastos_dam(db, id_dam_padre)

    return {"mensaje": f"Gasto {id_gasto} eliminado físicamente con respaldo de auditoría y reversión de amortizaciones."}

# ==========================================
# 2. VOUCHERS
# ==========================================

@router.post("/vouchers/", response_model=schemas.VoucherBancarioResponse)
def crear_voucher(voucher: schemas.VoucherBancarioCreate, db: Session = Depends(get_db), current_user: models.Usuario = Depends(RoleChecker(ROLES_FINANZAS))): # 1: Admin, 3: Tesorería
    validar_voucher_unico(db, voucher.banco_id, voucher.numero_operacion)
    if voucher.fecha_transferencia > date.today():
        raise HTTPException(status_code=400, detail="La fecha de transferencia no puede ser futura.")
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
    saldo_cero: bool = False,
    id_importador: Optional[int] = None, 
    db: Session = Depends(get_db), 
    current_user: models.Usuario = Depends(get_current_user)
):
    filtros = [models.VoucherBancario.estado_registro == EstadoRegistro.ACTIVO]
    if saldo_mayor_cero:
        filtros.append(models.VoucherBancario.saldo_disponible > 0)
    if saldo_cero:
        filtros.append(models.VoucherBancario.saldo_disponible <= 0)
    if id_importador is not None:
        filtros.append(models.VoucherBancario.id_importador == id_importador)
    if search:
        filtros.append(models.VoucherBancario.numero_operacion.ilike(f"%{search}%"))

    total_registros = db.query(func.count(models.VoucherBancario.id_voucher)).filter(*filtros).scalar() or 0
    total_paginas = (total_registros + limit - 1) // limit if total_registros > 0 else 0

    data = (
        db.query(models.VoucherBancario)
        .filter(*filtros)
        .order_by(models.VoucherBancario.id_voucher.asc())
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
    current_user: models.Usuario = Depends(RoleChecker(ROLES_FINANZAS))  # 1: Admin, 3: Tesorería
):
    voucher = db.query(models.VoucherBancario).filter(models.VoucherBancario.id_voucher == id_voucher).first()
    if not voucher:
        raise HTTPException(status_code=404, detail="Voucher no encontrado")

    update_data = voucher_editado.model_dump(exclude_unset=True)
    update_data.pop("saldo_disponible", None)  # El saldo solo lo mueve el motor de pagos

    # Bloqueo optimista real (cada pago también incrementa la versión del voucher)
    version_cliente = update_data.pop("version", None)
    if version_cliente is not None and version_cliente != voucher.version:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Conflicto de concurrencia: el voucher cambió (otro usuario o un pago aplicado) desde que lo abriste. Recárgalo y vuelve a intentar."
        )

    # Antifraude: el mismo número de operación no puede registrarse dos veces en el mismo banco
    nuevo_num = update_data.get("numero_operacion", voucher.numero_operacion)
    nuevo_banco = update_data.get("banco_id", voucher.banco_id)
    if (nuevo_num, nuevo_banco) != (voucher.numero_operacion, voucher.banco_id):
        validar_voucher_unico(db, nuevo_banco, nuevo_num, excluir_id=voucher.id_voucher)

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

    try:
        db.commit()
        db.refresh(voucher)
        return voucher
    except StaleDataError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Conflicto de concurrencia: Otro usuario modificó este voucher mientras intentabas actualizarlo."
        )

@router.delete("/vouchers/{id_voucher}")
def eliminar_voucher(id_voucher: int, req: schemas.EliminacionRequest, db: Session = Depends(get_db), current_user: models.Usuario = Depends(RoleChecker(ROLES_FINANZAS))): # 1: Admin, 3: Tesorería
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
    current_user: models.Usuario = Depends(RoleChecker(ROLES_FINANZAS))
):
    """Registra un pago contra un gasto. La lógica completa está en services/pagos.py."""
    contexto = ContextoPeticion(
        usuario=current_user,
        endpoint=request.url.path,
        ip=request.client.host if request.client else "IP Desconocida",
        clave_idempotencia_cliente=request.headers.get("Idempotency-Key") or request.headers.get("idempotency-key"),
    )
    return servicio_pagos.registrar_pago(db, pago, contexto)

@router.put("/pagos/{id_pago}", response_model=schemas.RegistroPago)
def actualizar_pago(
    id_pago: int,
    pago_editado: schemas.RegistroPagoUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(RoleChecker(ROLES_FINANZAS))  # 1: Admin, 3: Tesorería
):
    """
    Candado de Auditoría Financiera: el schema solo admite 'fecha_pago' (extra='forbid').
    Cualquier intento de tocar importe, moneda, TC, voucher, gasto o débito se rechaza con 422.
    Para corregir montos se anula el pago (DELETE con motivo) y se registra de nuevo.
    """
    db_pago = db.query(models.RegistroPago).filter(models.RegistroPago.id_pago == id_pago).first()
    if not db_pago:
        raise HTTPException(status_code=404, detail="Pago no encontrado")
    if db_pago.es_ajuste_sistema:
        raise HTTPException(status_code=403, detail="Los Ajustes ZD del sistema no se pueden modificar.")

    update_data = pago_editado.model_dump(exclude_unset=True)
    fecha_anterior = db_pago.fecha_pago
    if update_data.get("fecha_pago") is not None:
        db_pago.fecha_pago = update_data["fecha_pago"]
        registrar_auditoria_sync(
            db=db,
            id_usuario=current_user.id_usuario,
            endpoint=request.url.path,
            accion=AccionAuditoria.EDICION_FECHA_PAGO,
            detalles=json.dumps({"id_pago": id_pago, "fecha_anterior": str(fecha_anterior), "fecha_nueva": str(db_pago.fecha_pago)}),
            ip_address=request.client.host if request.client else "IP Desconocida"
        )

    db.commit()
    db.refresh(db_pago)
    return db_pago

@router.get("/vouchers/{id_voucher}/pagos", response_model=List[schemas.RegistroPago])
def obtener_pagos_de_voucher(
    id_voucher: int,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user)
):
    pagos = (
        db.query(models.RegistroPago)
        .filter(
            models.RegistroPago.voucher_id == id_voucher,
            models.RegistroPago.estado_registro == EstadoRegistro.ACTIVO
        )
        .options(
            joinedload(models.RegistroPago.dam),
            joinedload(models.RegistroPago.importador),
            joinedload(models.RegistroPago.concepto_rel),
            joinedload(models.RegistroPago.voucher_rel).joinedload(models.VoucherBancario.banco_rel),
            joinedload(models.RegistroPago.gasto_rel).joinedload(models.RegistroGasto.proveedor_rel)
        )
        .order_by(models.RegistroPago.id_pago.asc())
        .all()
    )
    resultado = []
    for p in pagos:
        resultado.append(schemas.RegistroPago(
            id_pago=p.id_pago,
            id_dam=p.id_dam,
            id_concepto=p.id_concepto,
            moneda=p.moneda,
            importe=p.importe,
            tipo_cambio=p.tipo_cambio,
            estado_pago=p.estado_pago,
            fecha_pago=p.fecha_pago,
            id_importador=p.id_importador,
            id_gasto=p.id_gasto,
            es_ajuste_sistema=p.es_ajuste_sistema or False,
            tipo_cambio_aplicado=p.tipo_cambio_aplicado,
            voucher_id=p.voucher_id,
            pago_moneda_cruzada=p.pago_moneda_cruzada or False,
            gasto_financiero_tc=p.gasto_financiero_tc or Decimal("0.00"),
            monto_moneda_origen=p.monto_moneda_origen,
            created_at=p.created_at,
            dam_numero=p.dam.numero_de_dam if p.dam else "N/A",
            importador_nombre=p.importador.nombre if p.importador else "N/A",
            concepto_nombre=p.concepto_rel.nombre if p.concepto_rel else "N/A",
            numero_operacion=p.voucher_rel.numero_operacion if p.voucher_rel else ("Ajuste ZD" if p.es_ajuste_sistema else "S/V"),
            banco_nombre=p.voucher_rel.banco_rel.nombre if (p.voucher_rel and p.voucher_rel.banco_rel) else None,
            gasto_documento=p.gasto_rel.numero_documento if (p.gasto_rel and p.gasto_rel.numero_documento) else (f"Gasto #{p.id_gasto}" if p.id_gasto else "N/A"),
            proveedor_nombre=p.gasto_rel.proveedor_rel.nombre if (p.gasto_rel and p.gasto_rel.proveedor_rel) else None,
            gasto_moneda=p.gasto_rel.moneda if p.gasto_rel else None,
            gasto_monto=p.gasto_rel.monto_original if p.gasto_rel else None,
            gasto_observaciones=p.gasto_rel.observaciones if p.gasto_rel else None
        ))
    return resultado

@router.get("/pagos/", response_model=schemas.PaginatedResponse[schemas.RegistroPago])
def listar_pagos(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    search: Optional[str] = None,
    db: Session = Depends(get_db), 
    current_user: models.Usuario = Depends(get_current_user)
):
    query = (
        db.query(models.RegistroPago)
        .outerjoin(models.RegistroPago.dam)
        .outerjoin(models.RegistroPago.importador)
        .outerjoin(models.RegistroPago.concepto_rel)
        .outerjoin(models.RegistroPago.voucher_rel)
        .outerjoin(models.RegistroPago.gasto_rel)
    )

    filtros = [models.RegistroPago.estado_registro == EstadoRegistro.ACTIVO]
    if search:
        termino = f"%{search.strip()}%"
        filtros.append(
            models.RegistroPago.estado_pago.ilike(termino) |
            models.RegistroPago.moneda.ilike(termino) |
            models.DetalleDam.numero_de_dam.ilike(termino) |
            models.CatImportador.nombre.ilike(termino) |
            models.CatConceptoPago.nombre.ilike(termino) |
            models.VoucherBancario.numero_operacion.ilike(termino) |
            models.RegistroGasto.numero_documento.ilike(termino) |
            models.RegistroGasto.observaciones.ilike(termino)
        )

    total_registros = query.filter(*filtros).with_entities(func.count(models.RegistroPago.id_pago)).scalar() or 0
    total_paginas = (total_registros + limit - 1) // limit if total_registros > 0 else 0

    data = (
        query
        .filter(*filtros)
        .options(
            joinedload(models.RegistroPago.dam),
            joinedload(models.RegistroPago.importador),
            joinedload(models.RegistroPago.concepto_rel),
            joinedload(models.RegistroPago.voucher_rel).joinedload(models.VoucherBancario.banco_rel),
            joinedload(models.RegistroPago.gasto_rel).joinedload(models.RegistroGasto.proveedor_rel)
        )
        .order_by(models.RegistroPago.id_pago.desc())
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )

    resultado = []
    for p in data:
        resultado.append(schemas.RegistroPago(
            id_pago=p.id_pago,
            id_dam=p.id_dam,
            id_concepto=p.id_concepto,
            moneda=p.moneda,
            importe=p.importe,
            tipo_cambio=p.tipo_cambio,
            estado_pago=p.estado_pago,
            fecha_pago=p.fecha_pago,
            id_importador=p.id_importador,
            id_gasto=p.id_gasto,
            es_ajuste_sistema=p.es_ajuste_sistema or False,
            tipo_cambio_aplicado=p.tipo_cambio_aplicado,
            voucher_id=p.voucher_id,
            pago_moneda_cruzada=p.pago_moneda_cruzada or False,
            gasto_financiero_tc=p.gasto_financiero_tc or Decimal("0.00"),
            monto_moneda_origen=p.monto_moneda_origen,
            created_at=p.created_at,
            dam_numero=p.dam.numero_de_dam if p.dam else "N/A",
            importador_nombre=p.importador.nombre if p.importador else "N/A",
            concepto_nombre=p.concepto_rel.nombre if p.concepto_rel else "N/A",
            numero_operacion=p.voucher_rel.numero_operacion if p.voucher_rel else ("Ajuste ZD" if p.es_ajuste_sistema else "S/V"),
            banco_nombre=p.voucher_rel.banco_rel.nombre if (p.voucher_rel and p.voucher_rel.banco_rel) else None,
            gasto_documento=p.gasto_rel.numero_documento if (p.gasto_rel and p.gasto_rel.numero_documento) else (f"Gasto #{p.id_gasto}" if p.id_gasto else "N/A"),
            proveedor_nombre=p.gasto_rel.proveedor_rel.nombre if (p.gasto_rel and p.gasto_rel.proveedor_rel) else None,
            gasto_moneda=p.gasto_rel.moneda if p.gasto_rel else None,
            gasto_monto=p.gasto_rel.monto_original if p.gasto_rel else None,
            gasto_observaciones=p.gasto_rel.observaciones if p.gasto_rel else None
        ))

    return {
        "total_registros": total_registros,
        "pagina": page,
        "limite": limit,
        "total_paginas": total_paginas,
        "data": resultado
    }

@router.delete("/pagos/{id_pago}")
def eliminar_pago(id_pago: int, req: schemas.EliminacionRequest, db: Session = Depends(get_db), current_user: models.Usuario = Depends(RoleChecker(ROLES_FINANZAS))):
    """Anula un pago y recalcula saldos y estados. La lógica completa está en services/pagos.py."""
    return servicio_pagos.anular_pago(db, id_pago, req.motivo, current_user)


# ==========================================
# 4. TIPO DE CAMBIO OFICIAL (SUNAT)
# ==========================================
# Alimenta la validación de pagos en moneda cruzada (banda ±MARGEN_TC_OFICIAL respecto al TC del día).

@router.get("/tipo-cambio/", response_model=List[schemas.HistorialTipoCambio], tags=["Tipo de Cambio"])
def listar_tipo_cambio(
    limit: int = Query(30, ge=1, le=366),
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user)
):
    return db.query(models.HistorialTipoCambio).order_by(models.HistorialTipoCambio.fecha.desc()).limit(limit).all()


@router.get("/tipo-cambio/{fecha}", response_model=schemas.HistorialTipoCambio, tags=["Tipo de Cambio"])
def obtener_tipo_cambio(fecha: date, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_user)):
    tc = db.query(models.HistorialTipoCambio).filter(models.HistorialTipoCambio.fecha == fecha).first()
    if not tc:
        raise HTTPException(status_code=404, detail=f"No hay tipo de cambio oficial registrado para {fecha}.")
    return tc


@router.put("/tipo-cambio/", response_model=schemas.HistorialTipoCambio, tags=["Tipo de Cambio"])
def registrar_tipo_cambio(
    datos: schemas.HistorialTipoCambioCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(RoleChecker(ROLES_FINANZAS))  # 1: Admin, 3: Tesorería
):
    """Registra (o corrige) el TC oficial SUNAT de una fecha. Cada cambio queda en la bitácora."""
    compra = Decimal(str(datos.precio_compra)).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
    venta = Decimal(str(datos.precio_venta)).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
    for etiqueta, valor in (("compra", compra), ("venta", venta)):
        if not (TC_MINIMO <= valor <= TC_MAXIMO):
            raise HTTPException(status_code=400, detail=f"TC de {etiqueta} {valor} fuera de la banda de control ({TC_MINIMO} – {TC_MAXIMO}).")
    if compra > venta:
        raise HTTPException(status_code=400, detail="El TC de compra no puede ser mayor que el de venta.")
    if datos.fecha > date.today():
        raise HTTPException(status_code=400, detail="No se puede registrar el tipo de cambio de una fecha futura.")

    existente = db.query(models.HistorialTipoCambio).filter(models.HistorialTipoCambio.fecha == datos.fecha).first()
    anterior = {"compra": str(existente.precio_compra), "venta": str(existente.precio_venta)} if existente else None
    if existente:
        existente.precio_compra, existente.precio_venta = compra, venta
        tc = existente
    else:
        tc = models.HistorialTipoCambio(fecha=datos.fecha, precio_compra=compra, precio_venta=venta)
        db.add(tc)

    registrar_auditoria_sync(
        db=db,
        id_usuario=current_user.id_usuario,
        endpoint=request.url.path,
        accion=AccionAuditoria.CORRECCION_TIPO_CAMBIO if existente else AccionAuditoria.REGISTRO_TIPO_CAMBIO,
        detalles=json.dumps({"fecha": str(datos.fecha), "anterior": anterior, "nuevo": {"compra": str(compra), "venta": str(venta)}}),
        ip_address=request.client.host if request.client else "IP Desconocida"
    )
    db.commit()
    db.refresh(tc)
    return tc
