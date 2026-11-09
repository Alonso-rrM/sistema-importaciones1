import datetime
from sqlalchemy.orm import Session
import json
from models import MaestroImportacion, DetalleDam, AuditLog

def sincronizar_estado_maestro(db: Session, id_maestro: int):
    """
    Evalúa el estado consolidado del Contenedor (Maestro) basándose en 
    el estado de todas sus DAMs y su ubicación física actual.
    """
    maestro = db.query(MaestroImportacion).filter(MaestroImportacion.id_maestro == id_maestro).first()
    if not maestro: 
        return

    dams = maestro.dams
    if not dams:
        if maestro.estado_documentario != "SIN NUMERAR":
            maestro.estado_documentario = "SIN NUMERAR"
            db.commit()
        return

    total_dams = len(dams)
    dams_con_levante = 0
    tiene_omc_pendiente = False
    max_fecha_levante = None

    # Estados que físicamente permiten el retiro del contenedor
    estados_levante_fisico = [
        "CON LEVANTE",
        "CON LEVANTE (GARANTÍA ACTIVA)",
        "EN REVISIÓN OMC (POST-LEVANTE)",
        "PENDIENTE PAGO OMC",
        "GARANTÍA CERRADA / LIQUIDADA"
    ]

    for dam in dams:
        if dam.estado_dam in estados_levante_fisico:
            # Excepción: En DEFINITIVO, PENDIENTE PAGO OMC bloquea el levante físico
            if maestro.tipo_valor == "DEFINITIVO" and dam.estado_dam == "PENDIENTE PAGO OMC":
                pass # No suma a dams_con_levante
            else:
                dams_con_levante += 1
                if dam.fecha_levante:
                    if not max_fecha_levante or dam.fecha_levante > max_fecha_levante:
                        max_fecha_levante = dam.fecha_levante
        
        if dam.estado_dam in ["EN REVISIÓN OMC (POST-LEVANTE)", "PENDIENTE PAGO OMC"]:
            tiene_omc_pendiente = True

    nuevo_estado = maestro.estado_documentario

    # Matemática de Consolidación (Regla 0/N, Parcial/N, Total/N)
    if dams_con_levante == 0:
        nuevo_estado = "EN PROCESO"
    elif 0 < dams_con_levante < total_dams:
        nuevo_estado = "ATE. PARCIAL"
    elif dams_con_levante == total_dams:
        if maestro.status_llegada == "EN ALMACÉN":
            if tiene_omc_pendiente:
                nuevo_estado = "EN ALMACÉN (PEND. OMC)"
            else:
                nuevo_estado = "ATE. TOTAL"
        else:
            nuevo_estado = "CON LEVANTE (PEND. INGRESO)"

    # Actualización atómica del Maestro
    if maestro.estado_documentario != nuevo_estado:
        maestro.estado_documentario = nuevo_estado
        
    # Cronómetro Logístico: Sellar fecha de levante del contenedor
    if dams_con_levante == total_dams and maestro.fecha_levante_maestro is None:
        maestro.fecha_levante_maestro = max_fecha_levante or datetime.date.today()
    elif dams_con_levante < total_dams and maestro.fecha_levante_maestro is not None:
        # Una reversión dejó al contenedor sin levante total: se apaga el cronómetro "DURMIENDO EN TEMP."
        maestro.fecha_levante_maestro = None

    db.commit()


# --- REVERSIÓN DE TRANSICIONES AUTOMÁTICAS ---
# El sistema concede ciertos estados de forma AUTOMÁTICA al registrarse un pago (proforma u OMC).
# Si ese pago se anula (por ejemplo, porque se registró en el contenedor equivocado), el estado que el
# propio sistema otorgó deja de tener sustento y debe deshacerse: SUNAT nunca dio ese levante.

# Estados posteriores al pago de la proforma (no pueden sostenerse si la proforma ya no está pagada)
ESTADOS_POST_PROFORMA = {
    "PENDIENTE DE AFORO", "CON LEVANTE", "CON LEVANTE (GARANTÍA ACTIVA)", "OBSERVADA / NOTIFICADA",
    "EN REVISIÓN", "EN REVISIÓN OMC (POST-LEVANTE)", "PENDIENTE PAGO OMC", "GARANTÍA CERRADA / LIQUIDADA",
}
# Estados que el sistema concede automáticamente al pagarse la OMC
ESTADOS_POR_PAGO_OMC = {"CON LEVANTE", "GARANTÍA CERRADA / LIQUIDADA"}


def resultado_automatico_proforma(dam) -> set:
    """Estados a los que llega una DAM SOLO por el pago de la proforma (sin diligencias manuales)."""
    tipo_valor = dam.maestro.tipo_valor if dam.maestro else "DEFINITIVO"
    if dam.canal_control == "VERDE":
        return {"CON LEVANTE (GARANTÍA ACTIVA)" if tipo_valor == "GARANTIZADO" else "CON LEVANTE"}
    return {"PENDIENTE DE AFORO"}


def clasificar_gastos_dam(dam) -> dict:
    """
    Clasifica los gastos aduaneros de la DAM. Un grupo cuenta como pagado solo si TODOS sus gastos
    activos están PAGADOS (antes bastaba con uno: dos gastos de tributos y uno solo pagado daba levante).
    """
    grupos = {"tributos": [], "percepcion": [], "omc": []}
    for g in dam.gastos:
        if g.estado_registro != "ACTIVO" or not g.concepto_rel:
            continue
        nombre = g.concepto_rel.nombre.upper()
        if "TRIBUTO" in nombre:
            grupos["tributos"].append(g)
        elif "PERCEPCI" in nombre:
            grupos["percepcion"].append(g)
        elif "OMC" in nombre:
            grupos["omc"].append(g)
    pagado = lambda lista: bool(lista) and all(g.estado_pago == "PAGADO" for g in lista)
    return {
        "tiene_proforma": bool(grupos["tributos"]) and bool(grupos["percepcion"]),
        "proforma_pagada": pagado(grupos["tributos"]) and pagado(grupos["percepcion"]),
        "tiene_omc": bool(grupos["omc"]),
        "omc_pagado": pagado(grupos["omc"]),
    }


def evaluar_gatillos_gastos_dam(db: Session, id_dam: int):
    """
    Intercepta la canasta de gastos y pagos de una DAM para AVANZAR su estado documentario
    o REVERTIR los estados que el sistema concedió automáticamente si su pago fue anulado.
    Devuelve (estado_anterior, estado_nuevo) o None si la DAM no existe.
    """
    dam = db.query(DetalleDam).filter(DetalleDam.id_dam == id_dam).first()
    if not dam: 
        return None

    c = clasificar_gastos_dam(dam)
    estado_actual = dam.estado_dam
    nuevo_estado = estado_actual
    tipo_valor = dam.maestro.tipo_valor if dam.maestro else "DEFINITIVO"
    motivo_reversion = None

    # ===== REVERSIONES (tienen prioridad: primero se corrige lo que perdió sustento) =====
    # R1: La proforma dejó de estar pagada -> todo lo posterior al pago de la proforma se deshace
    if c["tiene_proforma"] and not c["proforma_pagada"] and estado_actual in ESTADOS_POST_PROFORMA:
        nuevo_estado = "PENDIENTE PAGO PROFORMA"
        dam.fecha_levante = None
        motivo_reversion = "El pago de la proforma (tributos/percepción) fue anulado o quedó incompleto."
    # R1b: Se eliminaron los gastos de la proforma -> vuelve al estado inicial
    elif estado_actual == "PENDIENTE PAGO PROFORMA" and not c["tiene_proforma"]:
        nuevo_estado = "NUMERADA / EN EVALUACIÓN"
        motivo_reversion = "Ya no hay gastos de tributos y percepción registrados."
    # R2: La OMC dejó de estar pagada -> se deshace el levante/cierre que concedió su pago
    elif c["tiene_omc"] and not c["omc_pagado"] and estado_actual in ESTADOS_POR_PAGO_OMC:
        nuevo_estado = "PENDIENTE PAGO OMC"
        if tipo_valor != "GARANTIZADO":
            dam.fecha_levante = None  # En GARANTIZADO el levante con garantía previo sigue siendo válido
        motivo_reversion = "El pago de la OMC fue anulado o quedó incompleto."

    # ===== AVANCES =====
    # Gatillo 1: Proforma Registrada (AND estricto)
    elif estado_actual == "NUMERADA / EN EVALUACIÓN":
        if c["tiene_proforma"]:
            nuevo_estado = "PENDIENTE PAGO PROFORMA"

    # Gatillo 2: Pago de Proforma (Salto por Canal)
    elif estado_actual == "PENDIENTE PAGO PROFORMA":
        if c["proforma_pagada"]:
            if dam.canal_control == "VERDE":
                nuevo_estado = "CON LEVANTE (GARANTÍA ACTIVA)" if tipo_valor == "GARANTIZADO" else "CON LEVANTE"
                dam.fecha_levante = dam.fecha_levante or datetime.date.today()
            else:
                nuevo_estado = "PENDIENTE DE AFORO"
    
    # Gatillo 3: OMC Registrada en proceso
    elif estado_actual in ["EN REVISIÓN", "EN REVISIÓN OMC (POST-LEVANTE)"]:
        if c["tiene_omc"] and not c["omc_pagado"]:
            nuevo_estado = "PENDIENTE PAGO OMC"
    
    # Gatillo 4: OMC Pagada en Tesorería
    elif estado_actual == "PENDIENTE PAGO OMC":
        if c["omc_pagado"]:
            if tipo_valor == "GARANTIZADO":
                nuevo_estado = "GARANTÍA CERRADA / LIQUIDADA"
            else:
                nuevo_estado = "CON LEVANTE"
                dam.fecha_levante = dam.fecha_levante or datetime.date.today()

    if nuevo_estado != estado_actual:
        dam.estado_dam = nuevo_estado
        if motivo_reversion:
            # Evento explícito y fácil de filtrar en la bitácora ("REVERSION")
            db.add(AuditLog(
                id_usuario=db.info.get("audit_usuario"),
                endpoint=(db.info.get("audit_endpoint") or "(proceso interno)")[:255],
                accion="REVERSION AUTOMATICA DAM",
                ip_address=db.info.get("audit_ip"),
                detalles=json.dumps({
                    "id_dam": dam.id_dam, "numero_de_dam": dam.numero_de_dam,
                    "contenedor": dam.maestro.numero_factura if dam.maestro else None,
                    "estado_anterior": estado_actual, "estado_nuevo": nuevo_estado, "motivo": motivo_reversion,
                }, ensure_ascii=False),
            ))
        db.commit()
        
    # Indistintamente de si la DAM cambió o no, siempre refrescamos el Contenedor
    sincronizar_estado_maestro(db, dam.id_maestro)
    return (estado_actual, nuevo_estado)
