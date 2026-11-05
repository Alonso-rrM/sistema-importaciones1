import datetime
from sqlalchemy.orm import Session
from models import MaestroImportacion, DetalleDam

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

    db.commit()


def evaluar_gatillos_gastos_dam(db: Session, id_dam: int):
    """
    Intercepta la canasta de gastos y pagos de una DAM para avanzar 
    automáticamente su estado documentario.
    """
    dam = db.query(DetalleDam).filter(DetalleDam.id_dam == id_dam).first()
    if not dam: 
        return

    tiene_tributos, tiene_percepcion, tiene_omc = False, False, False
    tributos_pagados, percepcion_pagada, omc_pagado = False, False, False

    for g in dam.gastos:
        if not g.concepto_rel:
            continue
        
        nombre_concepto = g.concepto_rel.nombre.upper()
        
        if "TRIBUTO" in nombre_concepto:
            tiene_tributos = True
            if g.estado_pago == "PAGADO": tributos_pagados = True
        elif "PERCEPCI" in nombre_concepto:
            tiene_percepcion = True
            if g.estado_pago == "PAGADO": percepcion_pagada = True
        elif "OMC" in nombre_concepto:
            tiene_omc = True
            if g.estado_pago == "PAGADO": omc_pagado = True

    estado_actual = dam.estado_dam
    nuevo_estado = estado_actual
    tipo_valor = dam.maestro.tipo_valor if dam.maestro else "DEFINITIVO"

    # Gatillo 1: Proforma Registrada (AND estricto)
    if estado_actual == "NUMERADA / EN EVALUACIÓN":
        if tiene_tributos and tiene_percepcion:
            nuevo_estado = "PENDIENTE PAGO PROFORMA"

    # Gatillo 2: Pago de Proforma (Salto por Canal)
    elif estado_actual == "PENDIENTE PAGO PROFORMA":
        if tributos_pagados and percepcion_pagada:
            if dam.canal_control == "VERDE":
                nuevo_estado = "CON LEVANTE (GARANTÍA ACTIVA)" if tipo_valor == "GARANTIZADO" else "CON LEVANTE"
                dam.fecha_levante = dam.fecha_levante or datetime.date.today()
            else:
                nuevo_estado = "PENDIENTE DE AFORO"
    
    # Gatillo 3: OMC Registrada en proceso
    elif estado_actual in ["EN REVISIÓN", "EN REVISIÓN OMC (POST-LEVANTE)"]:
        if tiene_omc and not omc_pagado:
            nuevo_estado = "PENDIENTE PAGO OMC"
    
    # Gatillo 4: OMC Pagada en Tesorería
    elif estado_actual == "PENDIENTE PAGO OMC":
        if omc_pagado:
            if tipo_valor == "GARANTIZADO":
                nuevo_estado = "GARANTÍA CERRADA / LIQUIDADA"
            else:
                nuevo_estado = "CON LEVANTE"
                dam.fecha_levante = dam.fecha_levante or datetime.date.today()

    if nuevo_estado != estado_actual:
        dam.estado_dam = nuevo_estado
        db.commit()
        
    # Indistintamente de si la DAM cambió o no, siempre refrescamos el Contenedor
    sincronizar_estado_maestro(db, dam.id_maestro)

