import datetime
import json
from dataclasses import dataclass
from enum import Enum
from typing import Optional

from sqlalchemy.orm import Session

from models import MaestroImportacion, DetalleDam, AuditLog
from constantes import (
    ClaseAduanera,
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


# A qué grupo de la DAM pertenece un gasto según la clase aduanera de su concepto.
# Los conceptos de clase NINGUNA (fletes, almacenaje, multas...) no intervienen en el levante.
GRUPO_POR_CLASE_ADUANERA = {
    ClaseAduanera.TRIBUTO: "tributos",
    ClaseAduanera.PERCEPCION: "percepcion",
    ClaseAduanera.OMC: "omc",
}


def clasificar_gastos_dam(dam) -> dict:
    """
    Clasifica los gastos aduaneros de la DAM. Un grupo cuenta como pagado solo si TODOS sus gastos
    activos están PAGADOS (antes bastaba con uno: dos gastos de tributos y uno solo pagado daba levante).
    """
    grupos = {"tributos": [], "percepcion": [], "omc": []}
    for g in dam.gastos:
        if g.estado_registro != EstadoRegistro.ACTIVO or not g.concepto_rel:
            continue
        grupo = GRUPO_POR_CLASE_ADUANERA.get(g.concepto_rel.clase_aduanera)
        if grupo:
            grupos[grupo].append(g)
    def pagado(lista):
        return bool(lista) and all(g.estado_pago == EstadoPago.PAGADO for g in lista)

    return {
        "tiene_proforma": bool(grupos["tributos"]) and bool(grupos["percepcion"]),
        "proforma_pagada": pagado(grupos["tributos"]) and pagado(grupos["percepcion"]),
        "tiene_omc": bool(grupos["omc"]),
        "omc_pagado": pagado(grupos["omc"]),
    }


class AccionFechaLevante(Enum):
    CONSERVAR = "conservar"
    FIJAR_SI_FALTA = "fijar_si_falta"   # se concede el levante: hoy, salvo que ya tuviera fecha
    BORRAR = "borrar"                   # el levante perdió sustento


@dataclass(frozen=True)
class DecisionDam:
    estado: str
    motivo_reversion: Optional[str] = None
    fecha_levante: AccionFechaLevante = AccionFechaLevante.CONSERVAR


def decidir_estado_dam(estado_actual: str, clasificacion: dict, canal: Optional[str], tipo_valor: str) -> DecisionDam:
    """
    Regla PURA (sin base de datos) de las transiciones AUTOMÁTICAS de una DAM según sus gastos y pagos.
    `clasificacion` es el resultado de clasificar_gastos_dam.

    Las REVERSIONES se evalúan primero: corrigen lo que el sistema concedió y perdió sustento.

      Condición                                                         -> Nuevo estado
      R1  hay proforma, NO pagada, y la DAM está en un estado posterior  -> PENDIENTE PAGO PROFORMA (borra levante)
      R1b en PENDIENTE PAGO PROFORMA y ya no hay proforma registrada     -> NUMERADA / EN EVALUACIÓN
      R2  hay OMC, NO pagada, y la DAM está donde la dejó el pago OMC    -> PENDIENTE PAGO OMC
                                                                           (borra levante salvo GARANTIZADO)
      G1  NUMERADA y se registró la proforma (tributos + percepción)     -> PENDIENTE PAGO PROFORMA
      G2  PENDIENTE PAGO PROFORMA y la proforma quedó pagada:
            canal VERDE                                                  -> CON LEVANTE (o con GARANTÍA ACTIVA)
            otro canal                                                   -> PENDIENTE DE AFORO
      G3  EN REVISIÓN (o revisión OMC) y hay OMC pendiente               -> PENDIENTE PAGO OMC
      G4  PENDIENTE PAGO OMC y la OMC quedó pagada:
            GARANTIZADO                                                  -> GARANTÍA CERRADA / LIQUIDADA
            otro                                                         -> CON LEVANTE

    En cualquier otro caso la DAM se queda como está (las transiciones manuales viven en routers/operaciones.py).
    """
    c = clasificacion
    garantizado = tipo_valor == TipoValor.GARANTIZADO
    levante = EstadoDam.CON_LEVANTE_GARANTIA_ACTIVA if garantizado else EstadoDam.CON_LEVANTE

    # ----- Reversiones -----
    if c["tiene_proforma"] and not c["proforma_pagada"] and estado_actual in ESTADOS_POST_PROFORMA:
        return DecisionDam(EstadoDam.PENDIENTE_PAGO_PROFORMA,
                           "El pago de la proforma (tributos/percepción) fue anulado o quedó incompleto.",
                           AccionFechaLevante.BORRAR)
    if estado_actual == EstadoDam.PENDIENTE_PAGO_PROFORMA and not c["tiene_proforma"]:
        return DecisionDam(EstadoDam.NUMERADA, "Ya no hay gastos de tributos y percepción registrados.")
    if c["tiene_omc"] and not c["omc_pagado"] and estado_actual in ESTADOS_POR_PAGO_OMC:
        # En GARANTIZADO el levante con garantía previo sigue siendo válido
        return DecisionDam(EstadoDam.PENDIENTE_PAGO_OMC, "El pago de la OMC fue anulado o quedó incompleto.",
                           AccionFechaLevante.CONSERVAR if garantizado else AccionFechaLevante.BORRAR)

    # ----- Avances -----
    if estado_actual == EstadoDam.NUMERADA:
        if c["tiene_proforma"]:
            return DecisionDam(EstadoDam.PENDIENTE_PAGO_PROFORMA)
    elif estado_actual == EstadoDam.PENDIENTE_PAGO_PROFORMA:
        if c["proforma_pagada"]:
            if canal == CanalControl.VERDE:
                return DecisionDam(levante, fecha_levante=AccionFechaLevante.FIJAR_SI_FALTA)
            return DecisionDam(EstadoDam.PENDIENTE_AFORO)
    elif estado_actual in (EstadoDam.EN_REVISION, EstadoDam.EN_REVISION_OMC):
        if c["tiene_omc"] and not c["omc_pagado"]:
            return DecisionDam(EstadoDam.PENDIENTE_PAGO_OMC)
    elif estado_actual == EstadoDam.PENDIENTE_PAGO_OMC:
        if c["omc_pagado"]:
            if garantizado:
                return DecisionDam(EstadoDam.GARANTIA_CERRADA)
            return DecisionDam(EstadoDam.CON_LEVANTE, fecha_levante=AccionFechaLevante.FIJAR_SI_FALTA)

    return DecisionDam(estado_actual)


def evaluar_gatillos_gastos_dam(db: Session, id_dam: int):
    """
    Intercepta la canasta de gastos y pagos de una DAM para AVANZAR su estado documentario
    o REVERTIR los estados que el sistema concedió automáticamente si su pago fue anulado.
    La decisión la toma decidir_estado_dam; aquí solo se aplica y se registra.
    Devuelve (estado_anterior, estado_nuevo) o None si la DAM no existe.
    """
    dam = db.query(DetalleDam).filter(DetalleDam.id_dam == id_dam).first()
    if not dam:
        return None

    estado_actual = dam.estado_dam
    tipo_valor = dam.maestro.tipo_valor if dam.maestro else TipoValor.DEFINITIVO
    decision = decidir_estado_dam(estado_actual, clasificar_gastos_dam(dam), dam.canal_control, tipo_valor)
    nuevo_estado = decision.estado
    motivo_reversion = decision.motivo_reversion
    if decision.fecha_levante is AccionFechaLevante.BORRAR:
        dam.fecha_levante = None
    elif decision.fecha_levante is AccionFechaLevante.FIJAR_SI_FALTA:
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
