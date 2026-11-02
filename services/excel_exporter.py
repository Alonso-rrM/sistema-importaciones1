import io
import time
import random
from datetime import date, datetime
from decimal import Decimal
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

# Generador de tickets correlativos únicos sin fecha para nombres de archivos
def generar_ticket_reporte(prefijo: str = "REP") -> str:
    """
    Genera un identificador único numérico de 5 dígitos (ej: REP-48291)
    evitando el uso de fechas para no confundir al usuario en descargas recurrentes.
    """
    semilla = int(time.time() * 100) % 90000 + 10000
    sub = random.randint(10, 99)
    return f"{prefijo}-{semilla}{sub}"

def aplicar_estilos_profesionales(ws, columnas, datos, formatos=None, alineaciones=None):
    """
    Aplica una plantilla visual moderna y corporativa a la hoja de cálculo:
    - Cabeceras Slate Dark con texto blanco en negrita
    - Bordes sutiles y filas con sombreado alterno para máxima legibilidad
    - Formato de celdas según tipo (Moneda, Fecha, Texto)
    - Auto-ajuste de ancho de columnas y congelamiento de la fila de cabecera
    - Autofiltros nativos de Excel activados
    """
    # 1. Estilos de cabecera
    header_fill = PatternFill(start_color="1E293B", end_color="1E293B", fill_type="solid")
    header_font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
    header_border = Border(
        bottom=Side(style="medium", color="0F172A"),
        top=Side(style="thin", color="334155"),
        left=Side(style="thin", color="334155"),
        right=Side(style="thin", color="334155")
    )

    # 2. Estilos de datos
    cell_font = Font(name="Calibri", size=10, color="0F172A")
    even_fill = PatternFill(start_color="F8FAFC", end_color="F8FAFC", fill_type="solid")
    odd_fill = PatternFill(start_color="FFFFFF", end_color="FFFFFF", fill_type="solid")
    thin_border = Border(
        bottom=Side(style="thin", color="E2E8F0"),
        top=Side(style="thin", color="E2E8F0"),
        left=Side(style="thin", color="E2E8F0"),
        right=Side(style="thin", color="E2E8F0")
    )

    # 3. Escribir cabecera
    ws.append(columnas)
    ws.row_dimensions[1].height = 26

    for col_num, _ in enumerate(columnas, 1):
        cell = ws.cell(row=1, column=col_num)
        cell.fill = header_fill
        cell.font = header_font
        cell.border = header_border
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=False)

    # 4. Escribir filas de datos
    for row_idx, fila in enumerate(datos, start=2):
        ws.append(fila)
        ws.row_dimensions[row_idx].height = 20
        fill_actual = even_fill if row_idx % 2 == 0 else odd_fill

        for col_idx, valor in enumerate(fila, start=1):
            cell = ws.cell(row=row_idx, column=col_idx)
            cell.font = cell_font
            cell.fill = fill_actual
            cell.border = thin_border

            # Alineación
            h_align = "left"
            if alineaciones and col_idx - 1 < len(alineaciones):
                h_align = alineaciones[col_idx - 1]
            elif isinstance(valor, (int, float, Decimal)):
                h_align = "right"
            elif isinstance(valor, (date, datetime)):
                h_align = "center"

            cell.alignment = Alignment(horizontal=h_align, vertical="center")

            # Formato numérico
            if formatos and col_idx - 1 < len(formatos) and formatos[col_idx - 1]:
                cell.number_format = formatos[col_idx - 1]
            elif isinstance(valor, (date, datetime)):
                cell.number_format = "yyyy-mm-dd"
            elif isinstance(valor, (int, float, Decimal)):
                cell.number_format = "#,##0.00"

    # 5. Autofiltros y congelar fila superior
    if len(datos) > 0:
        ws.auto_filter.ref = ws.dimensions
    ws.freeze_panes = "A2"

    # 6. Auto-ajuste de ancho de columnas
    for col in ws.columns:
        col_letter = get_column_letter(col[0].column)
        max_len = 0
        for cell in col:
            val_str = ""
            if cell.value is not None:
                if isinstance(cell.value, (date, datetime)):
                    val_str = "YYYY-MM-DD"
                elif isinstance(cell.value, (int, float, Decimal)):
                    val_str = f"{cell.value:,.2f}"
                else:
                    val_str = str(cell.value)
            if len(val_str) > max_len:
                max_len = len(val_str)
        ws.column_dimensions[col_letter].width = max(max_len + 4, 12)


def generar_excel_maestros(maestros) -> tuple[io.BytesIO, str]:
    """Genera el reporte en Excel de Expedientes Logísticos."""
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Expedientes_Logistica"
    ws.views.sheetView[0].showGridLines = True

    columnas = [
        "ID",
        "Factura Comercial",
        "Contenedor Físico",
        "Doc. Transporte (B/L)",
        "Importador",
        "Proveedor Extranjero",
        "Agente de Aduana",
        "Almacén Aduanero",
        "Fecha Embarque",
        "Fecha Arribo",
        "Status Llegada",
        "Estado Levante",
        "Tipo de Valor",
        "Venta Sucesiva",
        "FOB (USD)",
        "Flete (USD)",
        "CFR (USD)"
    ]

    alineaciones = [
        "center", "center", "center", "center", "left", "left", "left", "left",
        "center", "center", "center", "center", "center", "center",
        "right", "right", "right"
    ]

    formatos = [
        "0", "@", "@", "@", "@", "@", "@", "@",
        "yyyy-mm-dd", "yyyy-mm-dd", "@", "@", "@", "@",
        "$#,##0.00", "$#,##0.00", "$#,##0.00"
    ]

    datos = []
    for m in maestros:
        datos.append([
            m.id_maestro,
            m.numero_factura or "-",
            m.n_cont_fisico or "-",
            m.documento_transporte or "-",
            m.importador_rel.nombre if m.importador_rel else "-",
            m.proveedor_rel.nombre if m.proveedor_rel else "-",
            m.agente_rel.nombre if m.agente_rel else "-",
            m.almacen_rel.nombre if m.almacen_rel else "-",
            m.fecha_embarque if m.fecha_embarque else None,
            m.fecha_arribo if m.fecha_arribo else None,
            m.status_llegada or "-",
            m.estado_levante or "-",
            m.tipo_valor or "DEFINITIVO",
            m.venta_sucesiva or "NO",
            float(m.fob_usd) if m.fob_usd is not None else 0.00,
            float(m.flete_usd) if m.flete_usd is not None else 0.00,
            float(m.cfr_usd) if m.cfr_usd is not None else 0.00,
        ])

    aplicar_estilos_profesionales(ws, columnas, datos, formatos, alineaciones)

    stream = io.BytesIO()
    wb.save(stream)
    stream.seek(0)
    
    ticket = generar_ticket_reporte("REP")
    filename = f"Reporte_Logistica_{ticket}.xlsx"
    return stream, filename


def generar_excel_dams(dams) -> tuple[io.BytesIO, str]:
    """Genera el reporte en Excel de Declaraciones DAMs."""
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Declaraciones_DAMs"
    ws.views.sheetView[0].showGridLines = True

    columnas = [
        "ID DAM",
        "N° de DAM",
        "Serie",
        "Factura Comercial",
        "Contenedor Físico",
        "Importador",
        "Canal de Control",
        "Aforo Realizado",
        "Tipo de Valor",
        "Monto Prov. (USD)",
        "Levante Contenedor",
        "Fecha Registro"
    ]

    alineaciones = [
        "center", "center", "center", "center", "center", "left",
        "center", "center", "center", "right", "center", "center"
    ]

    formatos = [
        "0", "@", "@", "@", "@", "@",
        "@", "@", "@", "$#,##0.00", "@", "yyyy-mm-dd hh:mm"
    ]

    datos = []
    for d in dams:
        m = d.maestro
        datos.append([
            d.id_dam,
            d.numero_de_dam or "-",
            d.serie or "-",
            m.numero_factura if m else "-",
            m.n_cont_fisico if m and m.n_cont_fisico else "-",
            m.importador_rel.nombre if m and m.importador_rel else "-",
            d.canal_control or "-",
            "SÍ" if d.aforo_realizado else "NO",
            m.tipo_valor if m and m.tipo_valor else "DEFINITIVO",
            float(d.monto_valor_provisional_usd) if d.monto_valor_provisional_usd is not None else 0.00,
            m.estado_levante if m and m.estado_levante else "-",
            d.created_at if d.created_at else None
        ])

    aplicar_estilos_profesionales(ws, columnas, datos, formatos, alineaciones)

    stream = io.BytesIO()
    wb.save(stream)
    stream.seek(0)
    
    ticket = generar_ticket_reporte("REP")
    filename = f"Reporte_Dams_{ticket}.xlsx"
    return stream, filename


def generar_excel_gastos(gastos) -> tuple[io.BytesIO, str]:
    """
    Genera el reporte en Excel de Gastos y Cuentas por Pagar.
    Ordenado jerárquicamente por Factura, DAM, Vencimiento e ID de Gasto.
    """
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Gastos_Operativos"
    ws.views.sheetView[0].showGridLines = True

    columnas = [
        "ID Gasto",
        "Factura Comercial",
        "Contenedor Físico",
        "N° DAM",
        "Importador",
        "N° Documento Gasto",
        "Tipo Documento",
        "Concepto de Pago",
        "Etapa / Tipo Gasto",
        "Proveedor / Beneficiario",
        "RUC Proveedor",
        "Moneda",
        "Monto Original",
        "Total Pagado",
        "Saldo Pendiente",
        "Estado Pago",
        "Fecha Vencimiento",
        "Situación Vencimiento"
    ]

    alineaciones = [
        "center", "center", "center", "center", "left", "center",
        "center", "left", "center", "left", "center", "center",
        "right", "right", "right", "center", "center", "center"
    ]

    formatos = [
        "0", "@", "@", "@", "@", "@",
        "@", "@", "@", "@", "@", "@",
        "#,##0.00", "#,##0.00", "#,##0.00", "@", "yyyy-mm-dd", "@"
    ]

    hoy = date.today()
    datos = []

    for g in gastos:
        dam = g.dam
        maestro = dam.maestro if dam else None
        importador = maestro.importador_rel if maestro else None
        proveedor = g.proveedor_rel
        concepto = g.concepto_rel
        tipo_doc = g.tipo_doc_rel

        # Cálculo de amortizaciones activas
        total_pagado = Decimal("0.00")
        if g.pagos:
            for p in g.pagos:
                if p.estado_registro == "ACTIVO" and p.importe:
                    total_pagado += Decimal(str(p.importe))
        
        monto_orig = Decimal(str(g.monto_original)) if g.monto_original is not None else Decimal("0.00")
        saldo = monto_orig - total_pagado
        if saldo < Decimal("0.00"):
            saldo = Decimal("0.00")

        # Situación de vencimiento
        if g.estado_pago == "PAGADO":
            situacion = "LIQUIDADO"
        elif g.fecha_vencimiento:
            dias = (g.fecha_vencimiento - hoy).days
            if dias < 0:
                situacion = f"VENCIDO ({abs(dias)} d)"
            elif dias == 0:
                situacion = "VENCE HOY"
            else:
                situacion = f"POR VENCER ({dias} d)"
        else:
            situacion = "SIN VENCIMIENTO"

        datos.append([
            g.id_gasto,
            maestro.numero_factura if maestro else "-",
            maestro.n_cont_fisico if maestro and maestro.n_cont_fisico else "-",
            dam.numero_de_dam if dam else "-",
            importador.nombre if importador else "-",
            g.numero_documento or "-",
            tipo_doc.nombre_documento if tipo_doc else "-",
            concepto.nombre if concepto else "-",
            concepto.tipo_gasto if concepto and concepto.tipo_gasto else "FIJO_DESPACHO",
            proveedor.nombre if proveedor else "-",
            proveedor.ruc if proveedor and proveedor.ruc else "-",
            g.moneda or "USD",
            float(monto_orig),
            float(total_pagado),
            float(saldo),
            g.estado_pago or "PENDIENTE",
            g.fecha_vencimiento if g.fecha_vencimiento else None,
            situacion
        ])

    aplicar_estilos_profesionales(ws, columnas, datos, formatos, alineaciones)

    stream = io.BytesIO()
    wb.save(stream)
    stream.seek(0)
    
    ticket = generar_ticket_reporte("REP")
    filename = f"Reporte_Gastos_{ticket}.xlsx"
    return stream, filename


def generar_excel_liquidacion_contenedor(liq_data: dict) -> tuple[io.BytesIO, str]:
    """
    Genera un Excel en Formato Tabular Plano (Tidy Data) de la liquidación de un contenedor.
    Diseñado específicamente para que los usuarios puedan crear Tablas Dinámicas inmediatamente:
    - 1 fila = 1 registro de gasto continuo.
    - CERO celdas combinadas y CERO filas vacías intermedias.
    - Metadatos completos repetidos en cada fila (Factura, Contenedor, Etapa, DAM).
    - Columnas bimonetarias con Tipo de Cambio y Equivalente en USD.
    """
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Liquidacion_Plana"
    ws.views.sheetView[0].showGridLines = True

    columnas = [
        "Factura Comercial",
        "Contenedor Físico",
        "Doc. Transporte (B/L)",
        "N° DAM",
        "Etapa de Gasto",
        "Proveedor",
        "RUC Proveedor",
        "Tipo Documento",
        "N° Documento Gasto",
        "Concepto de Gasto",
        "Fecha Vencimiento",
        "Moneda",
        "Monto Original",
        "Total Pagado",
        "Saldo Pendiente",
        "Estado Pago",
        "TC Referencial",
        "Equivalente USD",
        "Vouchers / Pagos"
    ]

    alineaciones = [
        "center", "center", "center", "center", "center",
        "left", "center", "center", "center", "left",
        "center", "center", "right", "right", "right",
        "center", "right", "right", "left"
    ]

    formatos = [
        "@", "@", "@", "@", "@",
        "@", "@", "@", "@", "@",
        "yyyy-mm-dd", "@", "#,##0.00", "#,##0.00", "#,##0.00",
        "@", "0.000", "$#,##0.00", "@"
    ]

    datos = []
    factura = liq_data.get("numero_factura") or "-"
    contenedor = liq_data.get("n_cont_fisico") or "-"
    bl = liq_data.get("documento_transporte") or "-"
    tc_global = liq_data.get("tipo_cambio_referencial") or 3.80

    for g in liq_data.get("gastos", []):
        vouchers_str = "-"
        if g.get("pagos_detalle"):
            vouchers_str = "; ".join(
                f"{p.get('banco', 'Banco')}: OP-{p.get('numero_operacion', 'S/N')} ({p.get('moneda', '')} {float(p.get('importe', 0)):,.2f})"
                for p in g["pagos_detalle"]
            )

        datos.append([
            factura,
            contenedor,
            bl,
            g.get("numero_de_dam") or "-",
            g.get("tipo_gasto") or "FIJO_DESPACHO",
            g.get("proveedor_nombre") or "-",
            g.get("proveedor_ruc") or "-",
            g.get("tipo_doc_nombre") or "-",
            g.get("numero_documento") or "-",
            g.get("concepto_nombre") or "-",
            g.get("fecha_vencimiento") if g.get("fecha_vencimiento") else None,
            g.get("moneda") or "USD",
            float(g.get("monto_original") or 0.0),
            float(g.get("total_pagado") or 0.0),
            float(g.get("saldo_pendiente") or 0.0),
            g.get("estado_pago") or "PENDIENTE",
            float(g.get("tipo_cambio_ref") or tc_global),
            float(g.get("equivalente_usd") or 0.0),
            vouchers_str
        ])

    aplicar_estilos_profesionales(ws, columnas, datos, formatos, alineaciones)

    stream = io.BytesIO()
    wb.save(stream)
    stream.seek(0)

    identificador = contenedor if contenedor and contenedor != "-" else factura
    clean_id = "".join(c for c in identificador if c.isalnum() or c in ("-", "_"))
    ticket = generar_ticket_reporte("REP")
    filename = f"Liquidacion_Gastos_{clean_id}_{ticket}.xlsx"
    return stream, filename


def generar_excel_sabana_global(filas_sabana: list[dict]) -> tuple[io.BytesIO, str]:
    """
    Genera el archivo Maestro Consolidado (Sábana Global) de todos los contenedores y sus gastos.
    Diseñado específicamente para el área de finanzas/contabilidad para construir Tablas Dinámicas:
    - 1 fila continua por cada gasto registrado en cualquier contenedor.
    - CERO celdas combinadas y CERO filas intermedias vacías.
    - Metadatos de la importación y del gasto completos en cada línea.
    """
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Sabana_Liquidaciones"
    ws.views.sheetView[0].showGridLines = True

    columnas = [
        "Factura Comercial",
        "Contenedor Físico",
        "Doc. Transporte (B/L)",
        "Importador",
        "RUC Importador",
        "Agente Aduana",
        "Almacén Aduanero",
        "Status Llegada",
        "Estado Levante",
        "Fecha Arribo",
        "N° DAM",
        "Etapa de Gasto",
        "Proveedor",
        "RUC Proveedor",
        "Tipo Documento",
        "N° Documento Gasto",
        "Concepto de Gasto",
        "Fecha Vencimiento",
        "Moneda",
        "Monto Original",
        "Total Pagado",
        "Saldo Pendiente",
        "Estado Pago",
        "TC Referencial",
        "Equivalente USD",
        "Vouchers / Pagos"
    ]

    alineaciones = [
        "center", "center", "center", "left", "center",
        "left", "left", "center", "center", "center",
        "center", "center", "left", "center", "center",
        "center", "left", "center", "center",
        "right", "right", "right", "center", "right", "right", "left"
    ]

    formatos = [
        "@", "@", "@", "@", "@",
        "@", "@", "@", "@", "yyyy-mm-dd",
        "@", "@", "@", "@", "@",
        "@", "@", "yyyy-mm-dd", "@",
        "#,##0.00", "#,##0.00", "#,##0.00", "@", "0.000", "$#,##0.00", "@"
    ]

    datos = []
    for f in filas_sabana:
        datos.append([
            f.get("numero_factura") or "-",
            f.get("n_cont_fisico") or "-",
            f.get("documento_transporte") or "-",
            f.get("importador_nombre") or "-",
            f.get("importador_ruc") or "-",
            f.get("agente_nombre") or "-",
            f.get("almacen_nombre") or "-",
            f.get("status_llegada") or "-",
            f.get("estado_levante") or "-",
            f.get("fecha_arribo") if f.get("fecha_arribo") else None,
            f.get("numero_de_dam") or "-",
            f.get("tipo_gasto") or "FIJO_DESPACHO",
            f.get("proveedor_nombre") or "-",
            f.get("proveedor_ruc") or "-",
            f.get("tipo_doc_nombre") or "-",
            f.get("numero_documento") or "-",
            f.get("concepto_nombre") or "-",
            f.get("fecha_vencimiento") if f.get("fecha_vencimiento") else None,
            f.get("moneda") or "USD",
            float(f.get("monto_original") or 0.0),
            float(f.get("total_pagado") or 0.0),
            float(f.get("saldo_pendiente") or 0.0),
            f.get("estado_pago") or "PENDIENTE",
            float(f.get("tipo_cambio_ref") or 3.80),
            float(f.get("equivalente_usd") or 0.0),
            f.get("vouchers_str") or "-"
        ])

    aplicar_estilos_profesionales(ws, columnas, datos, formatos, alineaciones)

    stream = io.BytesIO()
    wb.save(stream)
    stream.seek(0)

    ticket = generar_ticket_reporte("REP")
    filename = f"Sabana_Consolidada_Liquidaciones_{ticket}.xlsx"
    return stream, filename

