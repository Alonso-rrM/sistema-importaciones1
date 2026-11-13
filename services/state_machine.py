import datetime
from sqlalchemy.orm import Session
import json
from models import MaestroImportacion, DetalleDam, AuditLog
from constantes import (
    AccionAuditoria,
    CanalControl,
    EstadoDam,
    EstadoDocumentario,
    EstadoPago,
    EstadoRegistro,
    StatusLlegada,
    TipoValor,
)

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
        if maestro.estado_documentario != EstadoDocumentario.SIN_NUMERAR:
            maestro.estado_documentario = EstadoDocumentario.SIN_NUMERAR
            db.commit()
        return

    total_dams = len(dams)
    dams_con_levante = 0
    tiene_omc_pendiente = False
    max_fecha_levante = None

    # Estados que físicamente permiten el retiro del contenedor
    estados_levante_fisico = [
        EstadoDam.CON_LEVANTE,
        EstadoDam.CON_LEVANTE_GARANTIA_ACTIVA,
        EstadoDam.EN_REVISION_OMC,
        EstadoDam.PENDIENTE_PAGO_OMC,
        EstadoDam.GARANTIA_CERRADA
    ]

    for dam in dams:
        if dam.estado_dam in estados_levante_fisico:
            # Excepción: En DEFINITIVO, PENDIENTE PAGO OMC bloquea el levante físico
            if maestro.tipo_valor == TipoValor.DEFINITIVO and dam.estado_dam == EstadoDam.PENDIENTE_PAGO_OMC:
                pass # No suma a dams_con_levante
            else:
                dams_con_levante += 1
                if dam.fecha_levante:
                    if not max_fecha_levante or dam.fecha_levante > max_fecha_levante:
                        max_fecha_levante = dam.fecha_levante
        
        if dam.estado_dam in [EstadoDam.EN_REVISION_OMC, EstadoDam.PENDIENTE_PAGO_OMC]:
            tiene_omc_pendiente = True

    nuevo_estado = maestro.estado_documentario

    # Matemática de Consolidación (Regla 0/N, Parcial/N, Total/N)
    if dams_con_levante == 0:
        nuevo_estado = EstadoDocumentario.EN_PROCESO
    elif 0 < dams_con_levante < total_dams:
        nuevo_estado = EstadoDocumentario.ATENCION_PARCIAL
    elif dams_con_levante == total_dams:
        if maestro.status_llegada == StatusLlegada.EN_ALMACEN:
            if tiene_omc_pendiente:
                nuevo_estado = EstadoDocumentario.EN_ALMACEN_PENDIENTE_OMC
            else:
                nuevo_estado = EstadoDocumentario.ATENCION_TOTAL
        else:
            nuevo_estado = EstadoDocumentario.CON_LEVANTE_PENDIENTE_INGRESO

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
    EstadoDam.PENDIENTE_AFORO, EstadoDam.CON_LEVANTE, EstadoDam.CON_LEVANTE_GARANTIA_ACTIVA, EstadoDam.OBSERVADA,
    EstadoDam.EN_REVISION, EstadoDam.EN_REVISION_OMC, EstadoDam.PENDIENTE_PAGO_OMC, EstadoDam.GARANTIA_CERRADA,
}
# Estados que el sistema concede automáticamente al pagarse la OMC
ESTADOS_POR_PAGO_OMC = {EstadoDam.CON_LEVANTE, EstadoDam.GARANTIA_CERRADA}


def resultado_automatico_proforma(dam) -> set:
    """Estados a los que llega una DAM SOLO por el pago de la proforma (sin diligencias manuales)."""
    tipo_valor = dam.maestro.tipo_valor if dam.maestro else TipoValor.DEFINITIVO
    if dam.canal_control == CanalControl.VERDE:
        return {EstadoDam.CON_LEVANTE_GARANTIA_ACTIVA if tipo_valor == TipoValor.GARANTIZADO else EstadoDam.CON_LEVANTE}
    return {EstadoDam.PENDIENTE_AFORO}


def clasificar_gastos_dam(dam) -> dict:
    """
    Clasifica los gastos aduaneros de la DAM. Un grupo cuenta como pagado solo si TODOS sus gastos
    activos están PAGADOS (antes bastaba con uno: dos gastos de tributos y uno solo pagado daba levante).
    """
    grupos = {"tributos": [], "percepcion": [], "omc": []}
    for g in dam.gastos:
        if g.estado_registro != EstadoRegistro.ACTIVO or not g.concepto_rel:
            continue
        nombre = g.concepto_rel.nombre.upper()
        if "TRIBUTO" in nombre:
            grupos["tributos"].append(g)
        elif "PERCEPCI" in nombre:
            grupos["percepcion"].append(g)
        elif "OMC" in nombre:
            grupos["omc"].append(g)
    def pagado(lista):
        return bool(lista) and all(g.estado_pago == EstadoPago.PAGADO for g in lista)

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
    tipo_valor = dam.maestro.tipo_valor if dam.maestro else TipoValor.DEFINITIVO
    motivo_reversion = None

    # ===== REVERSIONES (tienen prioridad: primero se corrige lo que perdió sustento) =====
    # R1: La proforma dejó de estar pagada -> todo lo posterior al pago de la proforma se deshace
    if c["tiene_proforma"] and not c["proforma_pagada"] and estado_actual in ESTADOS_POST_PROFORMA:
        nuevo_estado = EstadoDam.PENDIENTE_PAGO_PROFORMA
        dam.fecha_levante = None
        motivo_reversion = "El pago de la proforma (tributos/percepción) fue anulado o quedó incompleto."
    # R1b: Se eliminaron los gastos de la proforma -> vuelve al estado inicial
    elif estado_actual == EstadoDam.PENDIENTE_PAGO_PROFORMA and not c["tiene_proforma"]:
        nuevo_estado = EstadoDam.NUMERADA
        motivo_reversion = "Ya no hay gastos de tributos y percepción registrados."
    # R2: La OMC dejó de estar pagada -> se deshace el levante/cierre que concedió su pago
    elif c["tiene_omc"] and not c["omc_pagado"] and estado_actual in ESTADOS_POR_PAGO_OMC:
        nuevo_estado = EstadoDam.PENDIENTE_PAGO_OMC
        if tipo_valor != TipoValor.GARANTIZADO:
            dam.fecha_levante = None  # En GARANTIZADO el levante con garantía previo sigue siendo válido
        motivo_reversion = "El pago de la OMC fue anulado o quedó incompleto."

    # ===== AVANCES =====
    # Gatillo 1: Proforma Registrada (AND estricto)
    elif estado_actual == EstadoDam.NUMERADA:
        if c["tiene_proforma"]:
            nuevo_estado = EstadoDam.PENDIENTE_PAGO_PROFORMA

    # Gatillo 2: Pago de Proforma (Salto por Canal)
    elif estado_actual == EstadoDam.PENDIENTE_PAGO_PROFORMA:
        if c["proforma_pagada"]:
            if dam.canal_control == CanalControl.VERDE:
                nuevo_estado = EstadoDam.CON_LEVANTE_GARANTIA_ACTIVA if tipo_valor == TipoValor.GARANTIZADO else EstadoDam.CON_LEVANTE
                dam.fecha_levante = dam.fecha_levante or datetime.date.today()
            else:
                nuevo_estado = EstadoDam.PENDIENTE_AFORO
    
    # Gatillo 3: OMC Registrada en proceso
    elif estado_actual in [EstadoDam.EN_REVISION, EstadoDam.EN_REVISION_OMC]:
        if c["tiene_omc"] and not c["omc_pagado"]:
            nuevo_estado = EstadoDam.PENDIENTE_PAGO_OMC
    
    # Gatillo 4: OMC Pagada en Tesorería
    elif estado_actual == EstadoDam.PENDIENTE_PAGO_OMC:
        if c["omc_pagado"]:
            if tipo_valor == TipoValor.GARANTIZADO:
                nuevo_estado = EstadoDam.GARANTIA_CERRADA
            else:
                nuevo_estado = EstadoDam.CON_LEVANTE
                dam.fecha_levante = dam.fecha_levante or datetime.date.today()

    if nuevo_estado != estado_actual:
        dam.estado_dam = nuevo_estado
        if motivo_reversion:
            # Evento explícito y fácil de filtrar en la bitácora ("REVERSION")
            db.add(AuditLog(
                id_usuario=db.info.get("audit_usuario"),
                endpoint=(db.info.get("audit_endpoint") or "(proceso interno)")[:255],
                accion=AccionAuditoria.REVERSION_AUTOMATICA_DAM,
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
