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


def gasto(concepto, pago="PENDIENTE", registro="ACTIVO"):
    return NS(estado_registro=registro, estado_pago=pago, concepto_rel=NS(nombre=concepto) if concepto else None)


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


@pytest.mark.parametrize("nombre, clave", [
    ("TRIBUTOS", "tributos"), ("tributos aduaneros", "tributos"), ("Pago de Tributo", "tributos"),
    ("PERCEPCION", "percepcion"), ("PERCEPCIÓN IGV", "percepcion"), ("percepcion", "percepcion"),
    ("OMC", "omc"), ("Ajuste omc", "omc"),
])
def test_clasificacion_actual_por_nombre_del_concepto(nombre, clave):
    """
    Deja constancia del comportamiento VIGENTE: hoy la clase del gasto se deduce del NOMBRE del concepto
    (sin distinguir mayúsculas). La fase 2 del plan lo reemplaza por un campo explícito; esta prueba
    garantiza que el cambio conserve el resultado para los nombres que ya existen.
    """
    c = clasificar_gastos_dam(dam(gasto(nombre, "PAGADO"), gasto("TRIBUTOS", "PAGADO"), gasto("PERCEPCION", "PAGADO")))
    if clave == "omc":
        assert c["tiene_omc"] is True
    else:
        assert c["tiene_proforma"] is True and c["proforma_pagada"] is True


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
