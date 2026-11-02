from typing import Optional, List
from datetime import date, timedelta
from decimal import Decimal
from fastapi import APIRouter, Depends, Query, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func

import models
from dependencies import get_db, get_current_user
from services.excel_exporter import generar_excel_sabana_global

router = APIRouter(prefix="/reportes", tags=["Reportes"])

@router.get("/analytics-cockpit")
def obtener_analytics_cockpit(
    fecha_inicio: Optional[date] = None,
    fecha_fin: Optional[date] = None,
    id_importador: Optional[int] = None,
    tipo_cambio_referencial: Optional[Decimal] = Query(default=Decimal("3.80")),
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user)
):
    """
    Retorna los datos agregados para el Cockpit Ejecutivo de Analítica:
    1. Pipeline del Embudo Logístico (En Tránsito -> En Puerto -> En Almacén -> Con Levante).
    2. Semáforo de Tesorería (Vencidos vs Por Vencer 7D vs Al Día en USD y PEN).
    3. Distribución de Gastos por Etapa Operativa (Fijos vs Post vs Extraordinarios).
    """
    try:
        raw_tc = tipo_cambio_referencial.default if hasattr(tipo_cambio_referencial, "default") else tipo_cambio_referencial
        tc_ref = Decimal(str(raw_tc or "3.80"))
        if tc_ref <= Decimal("0.00"):
            tc_ref = Decimal("3.80")
    except Exception:
        tc_ref = Decimal("3.80")

    hoy = date.today()

    # --- 1. PIPELINE DEL EMBUDO LOGÍSTICO ---
    m_filtros = [models.MaestroImportacion.estado_registro == "ACTIVO"]
    if id_importador:
        m_filtros.append(models.MaestroImportacion.id_importador == id_importador)
    if fecha_inicio:
        m_filtros.append(models.MaestroImportacion.created_at >= fecha_inicio)
    if fecha_fin:
        m_filtros.append(models.MaestroImportacion.created_at <= fecha_fin)

    maestros = db.query(models.MaestroImportacion).filter(*m_filtros).all()

    en_transito = 0
    en_puerto = 0
    en_almacen = 0
    con_levante = 0

    for m in maestros:
        if m.estado_levante == "CON LEVANTE":
            con_levante += 1
        elif m.status_llegada == "EN PUERTO":
            en_puerto += 1
        elif m.status_llegada == "EN ALMACÉN":
            en_almacen += 1
        else:
            en_transito += 1

    pipeline_logistico = {
        "en_transito": en_transito,
        "en_puerto": en_puerto,
        "en_almacen": en_almacen,
        "con_levante": con_levante,
        "total_contenedores": len(maestros)
    }

    # --- 2. SEMÁFORO DE TESORERÍA & 3. DISTRIBUCIÓN DE GASTOS POR ETAPA ---
    g_query = (
        db.query(models.RegistroGasto)
        .join(models.RegistroGasto.dam)
        .join(models.DetalleDam.maestro)
        .options(
            joinedload(models.RegistroGasto.pagos),
            joinedload(models.RegistroGasto.concepto_rel)
        )
        .filter(models.RegistroGasto.estado_registro == "ACTIVO")
    )
    if id_importador:
        g_query = g_query.filter(models.MaestroImportacion.id_importador == id_importador)
    if fecha_inicio:
        g_query = g_query.filter(models.RegistroGasto.created_at >= fecha_inicio)
    if fecha_fin:
        g_query = g_query.filter(models.RegistroGasto.created_at <= fecha_fin)

    gastos = g_query.all()

    # Acumuladores del Semáforo de Deuda
    semaforo_usd = {"vencidos": Decimal("0.00"), "por_vencer_7d": Decimal("0.00"), "al_dia": Decimal("0.00"), "total_deuda": Decimal("0.00")}
    semaforo_pen = {"vencidos": Decimal("0.00"), "por_vencer_7d": Decimal("0.00"), "al_dia": Decimal("0.00"), "total_deuda": Decimal("0.00")}

    # Acumuladores de Universos de Gasto
    etapas = {
        "FIJO_DESPACHO": {"usd": Decimal("0.00"), "pen": Decimal("0.00")},
        "POST_LEVANTE": {"usd": Decimal("0.00"), "pen": Decimal("0.00")},
        "EXTRAORDINARIO": {"usd": Decimal("0.00"), "pen": Decimal("0.00")}
    }

    limite_7d = hoy + timedelta(days=7)

    for g in gastos:
        monto_orig = Decimal(str(g.monto_original)) if g.monto_original else Decimal("0.00")
        moneda_g = g.moneda or "USD"
        etapa = g.concepto_rel.tipo_gasto if (g.concepto_rel and g.concepto_rel.tipo_gasto) else "FIJO_DESPACHO"
        if etapa not in etapas:
            etapas[etapa] = {"usd": Decimal("0.00"), "pen": Decimal("0.00")}

        # Acumular a la etapa
        if moneda_g == "USD":
            etapas[etapa]["usd"] += monto_orig
        else:
            etapas[etapa]["pen"] += monto_orig

        # Calcular saldo pendiente real
        total_pagado = Decimal("0.00")
        for p in g.pagos:
            if p.estado_registro == "ACTIVO" and p.importe:
                imp = Decimal(str(p.importe))
                tc_p = Decimal(str(p.tipo_cambio_aplicado or p.tipo_cambio or "1.00"))
                if tc_p <= Decimal("0.00"):
                    tc_p = Decimal("1.00")
                if moneda_g == p.moneda:
                    total_pagado += imp
                elif moneda_g == "USD" and p.moneda == "PEN":
                    total_pagado += imp / tc_p
                elif moneda_g == "PEN" and p.moneda == "USD":
                    total_pagado += imp * tc_p
                else:
                    total_pagado += imp

        saldo = max(Decimal("0.00"), monto_orig - total_pagado)

        # Si hay saldo pendiente, clasificar en el semáforo de tesorería
        if saldo > Decimal("0.00") and g.estado_pago != "PAGADO":
            sem_target = semaforo_usd if moneda_g == "USD" else semaforo_pen
            sem_target["total_deuda"] += saldo

            if g.fecha_vencimiento:
                if g.fecha_vencimiento < hoy:
                    sem_target["vencidos"] += saldo
                elif g.fecha_vencimiento <= limite_7d:
                    sem_target["por_vencer_7d"] += saldo
                else:
                    sem_target["al_dia"] += saldo
            else:
                sem_target["al_dia"] += saldo

    # Calcular equivalentes en USD para las etapas
    distribucion_etapas = {}
    for k, v in etapas.items():
        equiv = v["usd"] + (v["pen"] / tc_ref)
        distribucion_etapas[k] = {
            "usd": float(v["usd"]),
            "pen": float(v["pen"]),
            "total_equiv_usd": round(float(equiv), 2)
        }

    return {
        "pipeline_logistico": pipeline_logistico,
        "semaforo_tesoreria": {
            "usd": {k: float(v) for k, v in semaforo_usd.items()},
            "pen": {k: float(v) for k, v in semaforo_pen.items()}
        },
        "distribucion_etapas": distribucion_etapas,
        "tipo_cambio_referencial": float(tc_ref)
    }


@router.get("/sabana-liquidaciones/exportar")
def exportar_sabana_liquidaciones(
    fecha_inicio: Optional[date] = None,
    fecha_fin: Optional[date] = None,
    id_importador: Optional[int] = None,
    tipo_cambio_referencial: Optional[Decimal] = Query(default=Decimal("3.80")),
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user)
):
    """
    Genera y descarga la Sábana Consolidada de Liquidaciones de Todos los Contenedores en Excel Plano.
    """
    try:
        raw_tc = tipo_cambio_referencial.default if hasattr(tipo_cambio_referencial, "default") else tipo_cambio_referencial
        tc_ref = Decimal(str(raw_tc or "3.80"))
        if tc_ref <= Decimal("0.00"):
            tc_ref = Decimal("3.80")
    except Exception:
        tc_ref = Decimal("3.80")

    query = (
        db.query(models.RegistroGasto)
        .join(models.RegistroGasto.dam)
        .join(models.DetalleDam.maestro)
        .options(
            joinedload(models.RegistroGasto.dam).joinedload(models.DetalleDam.maestro).joinedload(models.MaestroImportacion.importador_rel),
            joinedload(models.RegistroGasto.dam).joinedload(models.DetalleDam.maestro).joinedload(models.MaestroImportacion.agente_rel),
            joinedload(models.RegistroGasto.dam).joinedload(models.DetalleDam.maestro).joinedload(models.MaestroImportacion.almacen_rel),
            joinedload(models.RegistroGasto.concepto_rel),
            joinedload(models.RegistroGasto.proveedor_rel),
            joinedload(models.RegistroGasto.tipo_doc_rel),
            joinedload(models.RegistroGasto.pagos).joinedload(models.RegistroPago.voucher_rel).joinedload(models.VoucherBancario.banco_rel)
        )
        .filter(models.RegistroGasto.estado_registro == "ACTIVO")
    )

    if id_importador:
        query = query.filter(models.MaestroImportacion.id_importador == id_importador)
    if fecha_inicio:
        query = query.filter(models.RegistroGasto.created_at >= fecha_inicio)
    if fecha_fin:
        query = query.filter(models.RegistroGasto.created_at <= fecha_fin)

    gastos = query.order_by(
        models.MaestroImportacion.numero_factura.asc(),
        models.DetalleDam.numero_de_dam.asc(),
        models.RegistroGasto.fecha_vencimiento.asc(),
        models.RegistroGasto.id_gasto.asc()
    ).all()

    filas = []
    for g in gastos:
        dam = g.dam
        maestro = dam.maestro if dam else None
        imp = maestro.importador_rel if maestro else None
        agente = maestro.agente_rel if maestro else None
        almacen = maestro.almacen_rel if maestro else None

        monto_orig = Decimal(str(g.monto_original)) if g.monto_original else Decimal("0.00")
        moneda_g = g.moneda or "USD"

        # Pagos
        total_pagado = Decimal("0.00")
        vouchers_list = []
        if g.pagos:
            for p in g.pagos:
                if p.estado_registro == "ACTIVO" and p.importe:
                    imp_p = Decimal(str(p.importe))
                    tc_p = Decimal(str(p.tipo_cambio_aplicado or p.tipo_cambio or "1.00"))
                    if tc_p <= Decimal("0.00"):
                        tc_p = Decimal("1.00")

                    if moneda_g == p.moneda:
                        total_pagado += imp_p
                    elif moneda_g == "USD" and p.moneda == "PEN":
                        total_pagado += imp_p / tc_p
                    elif moneda_g == "PEN" and p.moneda == "USD":
                        total_pagado += imp_p * tc_p
                    else:
                        total_pagado += imp_p

                    v_rel = p.voucher_rel
                    banco_nom = v_rel.banco_rel.nombre if (v_rel and v_rel.banco_rel) else "Banco"
                    op_num = v_rel.numero_operacion if v_rel else "S/N"
                    vouchers_list.append(f"{banco_nom}: OP-{op_num} ({p.moneda} {float(imp_p):,.2f})")

        saldo = max(Decimal("0.00"), monto_orig - total_pagado)
        equiv_usd = monto_orig if moneda_g == "USD" else (monto_orig / tc_ref)

        filas.append({
            "numero_factura": maestro.numero_factura if maestro else "-",
            "n_cont_fisico": maestro.n_cont_fisico if (maestro and maestro.n_cont_fisico) else "-",
            "documento_transporte": maestro.documento_transporte if maestro else "-",
            "importador_nombre": imp.nombre if imp else "-",
            "importador_ruc": getattr(imp, "ruc", "-") or "-",
            "agente_nombre": agente.nombre if agente else "-",
            "almacen_nombre": almacen.nombre if almacen else "-",
            "status_llegada": maestro.status_llegada if maestro else "-",
            "estado_levante": maestro.estado_levante if maestro else "-",
            "fecha_arribo": maestro.fecha_arribo if maestro else None,
            "numero_de_dam": dam.numero_de_dam if dam else "-",
            "tipo_gasto": g.concepto_rel.tipo_gasto if (g.concepto_rel and g.concepto_rel.tipo_gasto) else "FIJO_DESPACHO",
            "proveedor_nombre": g.proveedor_rel.nombre if g.proveedor_rel else "-",
            "proveedor_ruc": g.proveedor_rel.ruc if (g.proveedor_rel and g.proveedor_rel.ruc) else "-",
            "tipo_doc_nombre": g.tipo_doc_rel.nombre_documento if g.tipo_doc_rel else "-",
            "numero_documento": g.numero_documento or "-",
            "concepto_nombre": g.concepto_rel.nombre if g.concepto_rel else "-",
            "fecha_vencimiento": g.fecha_vencimiento if g.fecha_vencimiento else None,
            "moneda": moneda_g,
            "monto_original": float(monto_orig),
            "total_pagado": float(total_pagado),
            "saldo_pendiente": float(saldo),
            "estado_pago": g.estado_pago or "PENDIENTE",
            "tipo_cambio_ref": float(tc_ref),
            "equivalente_usd": round(float(equiv_usd), 2),
            "vouchers_str": "; ".join(vouchers_list) if vouchers_list else "-"
        })

    stream, filename = generar_excel_sabana_global(filas)
    return StreamingResponse(
        stream,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Access-Control-Expose-Headers": "Content-Disposition"
        }
    )
