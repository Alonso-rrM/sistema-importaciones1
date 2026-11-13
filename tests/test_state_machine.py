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
