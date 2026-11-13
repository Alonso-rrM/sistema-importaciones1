"""
Reglas puras de la máquina de estados de la DAM (services/state_machine.py).
Usa objetos simples en lugar de registros de base de datos: no requiere PostgreSQL.
"""
from types import SimpleNamespace as NS

import pytest

from services.state_machine import (
    ESTADOS_POR_PAGO_OMC,
    ESTADOS_POST_PROFORMA,
    clasificar_gastos_dam,
    resultado_automatico_proforma,
)


from domain.conceptos import clase_aduanera_sugerida


def gasto(concepto, pago="PENDIENTE", registro="ACTIVO", clase=None):
    """
    Gasto de prueba. `concepto` es el nombre; la clase aduanera se toma de `clase` o, si no se indica,
    de la sugerencia por nombre (así se crean los conceptos cuando no se especifica la clase).
    """
    if not concepto:
        return NS(estado_registro=registro, estado_pago=pago, concepto_rel=None)
    clase = clase or clase_aduanera_sugerida(concepto)
    return NS(estado_registro=registro, estado_pago=pago, concepto_rel=NS(nombre=concepto, clase_aduanera=clase))


def dam(*gastos, canal="VERDE", tipo_valor="DEFINITIVO", con_maestro=True):
    return NS(gastos=list(gastos), canal_control=canal, maestro=NS(tipo_valor=tipo_valor) if con_maestro else None)


# ---------- clasificar_gastos_dam ----------

def test_sin_gastos_no_hay_proforma_ni_omc():
    assert clasificar_gastos_dam(dam()) == {
        "tiene_proforma": False, "proforma_pagada": False, "tiene_omc": False, "omc_pagado": False,
    }


def test_la_proforma_exige_tributos_y_percepcion_a_la_vez():
    assert clasificar_gastos_dam(dam(gasto("TRIBUTOS")))["tiene_proforma"] is False
    assert clasificar_gastos_dam(dam(gasto("PERCEPCION")))["tiene_proforma"] is False
    assert clasificar_gastos_dam(dam(gasto("TRIBUTOS"), gasto("PERCEPCION")))["tiene_proforma"] is True


def test_proforma_pagada_solo_si_tributos_y_percepcion_estan_pagados():
    c = clasificar_gastos_dam(dam(gasto("TRIBUTOS", "PAGADO"), gasto("PERCEPCION", "PENDIENTE")))
    assert c["tiene_proforma"] is True and c["proforma_pagada"] is False
    c = clasificar_gastos_dam(dam(gasto("TRIBUTOS", "PAGADO"), gasto("PERCEPCION", "PAGADO")))
    assert c["proforma_pagada"] is True


def test_dos_gastos_de_tributos_con_uno_solo_pagado_no_cuenta_como_pagado():
    c = clasificar_gastos_dam(dam(
        gasto("TRIBUTOS", "PAGADO"), gasto("TRIBUTOS", "PENDIENTE"), gasto("PERCEPCION", "PAGADO"),
    ))
    assert c["proforma_pagada"] is False


def test_pago_parcial_no_cuenta_como_pagado():
    c = clasificar_gastos_dam(dam(gasto("TRIBUTOS", "PARCIAL"), gasto("PERCEPCION", "PAGADO")))
    assert c["proforma_pagada"] is False


def test_gastos_anulados_se_ignoran():
    c = clasificar_gastos_dam(dam(
        gasto("TRIBUTOS", "PAGADO"), gasto("PERCEPCION", "PAGADO"),
        gasto("TRIBUTOS", "PENDIENTE", registro="INACTIVO"),
    ))
    assert c["proforma_pagada"] is True


def test_gasto_sin_concepto_se_ignora():
    assert clasificar_gastos_dam(dam(gasto(None)))["tiene_proforma"] is False


def test_omc_se_clasifica_y_se_evalua_por_separado():
    c = clasificar_gastos_dam(dam(gasto("OMC")))
    assert c["tiene_omc"] is True and c["omc_pagado"] is False and c["tiene_proforma"] is False
    assert clasificar_gastos_dam(dam(gasto("OMC", "PAGADO")))["omc_pagado"] is True


def test_otros_conceptos_no_afectan_la_clasificacion():
    c = clasificar_gastos_dam(dam(gasto("FLETE LOCAL", "PENDIENTE"), gasto("ALMACENAJE")))
    assert c == {"tiene_proforma": False, "proforma_pagada": False, "tiene_omc": False, "omc_pagado": False}


def test_la_clasificacion_depende_de_la_clase_y_no_del_nombre():
    # Nombres que no mencionan tributo ni percepción, pero cuya clase sí lo es
    c = clasificar_gastos_dam(dam(
        gasto("ARANCELES", "PAGADO", clase="TRIBUTO"), gasto("ADELANTO IGV", "PAGADO", clase="PERCEPCION"),
    ))
    assert c["tiene_proforma"] is True and c["proforma_pagada"] is True
    # Y al revés: el nombre dice TRIBUTOS, pero la clase es NINGUNA
    c = clasificar_gastos_dam(dam(
        gasto("TRIBUTOS MUNICIPALES", clase="NINGUNA"), gasto("PERCEPCION", clase="PERCEPCION"),
    ))
    assert c["tiene_proforma"] is False


def test_clase_ninguna_o_desconocida_no_interviene_en_el_levante():
    c = clasificar_gastos_dam(dam(gasto("OMC", clase="NINGUNA"), gasto("X", clase="OTRA_COSA")))
    assert c == {"tiene_proforma": False, "proforma_pagada": False, "tiene_omc": False, "omc_pagado": False}


# ---------- resultado_automatico_proforma ----------

def test_canal_verde_definitivo_da_levante_directo():
    assert resultado_automatico_proforma(dam(canal="VERDE", tipo_valor="DEFINITIVO")) == {"CON LEVANTE"}


def test_canal_verde_garantizado_da_levante_con_garantia():
    assert resultado_automatico_proforma(dam(canal="VERDE", tipo_valor="GARANTIZADO")) == {"CON LEVANTE (GARANTÍA ACTIVA)"}


@pytest.mark.parametrize("canal", ["NARANJA", "ROJO", None])
def test_otros_canales_pasan_a_aforo(canal):
    assert resultado_automatico_proforma(dam(canal=canal)) == {"PENDIENTE DE AFORO"}


def test_dam_sin_contenedor_se_trata_como_definitivo():
    assert resultado_automatico_proforma(dam(canal="VERDE", con_maestro=False)) == {"CON LEVANTE"}


# ---------- conjuntos de estados ----------

def test_los_estados_que_concede_el_pago_de_omc_son_posteriores_a_la_proforma():
    assert ESTADOS_POR_PAGO_OMC <= ESTADOS_POST_PROFORMA
    assert "PENDIENTE PAGO PROFORMA" not in ESTADOS_POST_PROFORMA
    assert "NUMERADA / EN EVALUACIÓN" not in ESTADOS_POST_PROFORMA


# ---------- decidir_estado_dam: transiciones automáticas (regla pura) ----------

from services.state_machine import AccionFechaLevante as F  # noqa: E402
from services.state_machine import decidir_estado_dam  # noqa: E402

SIN_NADA = {"tiene_proforma": False, "proforma_pagada": False, "tiene_omc": False, "omc_pagado": False}
PROFORMA_PENDIENTE = {**SIN_NADA, "tiene_proforma": True}
PROFORMA_PAGADA = {**SIN_NADA, "tiene_proforma": True, "proforma_pagada": True}
OMC_PENDIENTE = {**PROFORMA_PAGADA, "tiene_omc": True}
OMC_PAGADA = {**PROFORMA_PAGADA, "tiene_omc": True, "omc_pagado": True}

NUMERADA = "NUMERADA / EN EVALUACIÓN"
P_PROFORMA = "PENDIENTE PAGO PROFORMA"
AFORO = "PENDIENTE DE AFORO"
LEVANTE = "CON LEVANTE"
LEVANTE_GTIA = "CON LEVANTE (GARANTÍA ACTIVA)"
REVISION = "EN REVISIÓN"
REVISION_OMC = "EN REVISIÓN OMC (POST-LEVANTE)"
P_OMC = "PENDIENTE PAGO OMC"
CERRADA = "GARANTÍA CERRADA / LIQUIDADA"
OBSERVADA = "OBSERVADA / NOTIFICADA"


@pytest.mark.parametrize("estado, clasif, canal, tipo_valor, esperado, fecha", [
    # Avances
    (NUMERADA, SIN_NADA, "VERDE", "DEFINITIVO", NUMERADA, F.CONSERVAR),
    (NUMERADA, PROFORMA_PENDIENTE, "VERDE", "DEFINITIVO", P_PROFORMA, F.CONSERVAR),
    (P_PROFORMA, PROFORMA_PENDIENTE, "VERDE", "DEFINITIVO", P_PROFORMA, F.CONSERVAR),   # sin pagar: no avanza
    (P_PROFORMA, PROFORMA_PAGADA, "VERDE", "DEFINITIVO", LEVANTE, F.FIJAR_SI_FALTA),
    (P_PROFORMA, PROFORMA_PAGADA, "VERDE", "GARANTIZADO", LEVANTE_GTIA, F.FIJAR_SI_FALTA),
    (P_PROFORMA, PROFORMA_PAGADA, "NARANJA", "DEFINITIVO", AFORO, F.CONSERVAR),
    (P_PROFORMA, PROFORMA_PAGADA, "ROJO", "GARANTIZADO", AFORO, F.CONSERVAR),
    (REVISION, OMC_PENDIENTE, "ROJO", "DEFINITIVO", P_OMC, F.CONSERVAR),
    (REVISION_OMC, OMC_PENDIENTE, "VERDE", "GARANTIZADO", P_OMC, F.CONSERVAR),
    (REVISION, PROFORMA_PAGADA, "ROJO", "DEFINITIVO", REVISION, F.CONSERVAR),          # sin OMC: se queda
    (P_OMC, OMC_PENDIENTE, "ROJO", "DEFINITIVO", P_OMC, F.CONSERVAR),
    (P_OMC, OMC_PAGADA, "ROJO", "DEFINITIVO", LEVANTE, F.FIJAR_SI_FALTA),
    (P_OMC, OMC_PAGADA, "VERDE", "GARANTIZADO", CERRADA, F.CONSERVAR),
    # Reversiones (tienen prioridad)
    (LEVANTE, PROFORMA_PENDIENTE, "VERDE", "DEFINITIVO", P_PROFORMA, F.BORRAR),
    (AFORO, PROFORMA_PENDIENTE, "ROJO", "DEFINITIVO", P_PROFORMA, F.BORRAR),
    (OBSERVADA, PROFORMA_PENDIENTE, "ROJO", "DEFINITIVO", P_PROFORMA, F.BORRAR),
    (P_PROFORMA, SIN_NADA, "VERDE", "DEFINITIVO", NUMERADA, F.CONSERVAR),
    (LEVANTE, OMC_PENDIENTE, "ROJO", "DEFINITIVO", P_OMC, F.BORRAR),
    (CERRADA, OMC_PENDIENTE, "VERDE", "GARANTIZADO", P_OMC, F.CONSERVAR),             # garantía previa sigue válida
    # Estados manuales sin regla automática
    (OBSERVADA, PROFORMA_PAGADA, "ROJO", "DEFINITIVO", OBSERVADA, F.CONSERVAR),
    (LEVANTE_GTIA, PROFORMA_PAGADA, "VERDE", "GARANTIZADO", LEVANTE_GTIA, F.CONSERVAR),
])
def test_transiciones_automaticas(estado, clasif, canal, tipo_valor, esperado, fecha):
    d = decidir_estado_dam(estado, clasif, canal, tipo_valor)
    assert d.estado == esperado
    assert d.fecha_levante is fecha


def test_solo_las_reversiones_llevan_motivo():
    assert decidir_estado_dam(LEVANTE, PROFORMA_PENDIENTE, "VERDE", "DEFINITIVO").motivo_reversion
    assert decidir_estado_dam(P_PROFORMA, SIN_NADA, "VERDE", "DEFINITIVO").motivo_reversion
    assert decidir_estado_dam(LEVANTE, OMC_PENDIENTE, "ROJO", "DEFINITIVO").motivo_reversion
    assert decidir_estado_dam(P_PROFORMA, PROFORMA_PAGADA, "VERDE", "DEFINITIVO").motivo_reversion is None
    assert decidir_estado_dam(NUMERADA, PROFORMA_PENDIENTE, "VERDE", "DEFINITIVO").motivo_reversion is None


def test_un_estado_desconocido_no_se_modifica():
    assert decidir_estado_dam("ESTADO RARO", PROFORMA_PAGADA, "VERDE", "DEFINITIVO").estado == "ESTADO RARO"
