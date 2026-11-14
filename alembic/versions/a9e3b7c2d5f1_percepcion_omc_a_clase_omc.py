"""percepcion_omc_a_clase_omc

La percepción de la OMC pertenece a la etapa OMC, no a la proforma. Etapas de la DAM:
  1) proforma: TRIBUTOS (un C.D.A.) + PERCEPCIÓN de los tributos (otro C.D.A.)
  2) OMC: OMC + PERCEPCIÓN OMC (esta última no siempre existe)

La migración c3f8a1d27e45 clasificó "PERCEPCION OMC" como PERCEPCION (por el orden de búsqueda en el
nombre). Así, registrarla en la etapa OMC hacía creer al sistema que la proforma ya no estaba pagada y
podía devolver a "pendiente de pago de proforma" una DAM que ya tenía levante.

Aquí se pasa a clase OMC todo concepto cuyo nombre menciona percepción y OMC (sin tributos). Con eso la
etapa OMC se da por pagada cuando están pagados todos sus gastos: la OMC sola, o la OMC y su percepción.

Revision ID: a9e3b7c2d5f1
Revises: f2c8d4a61b93
Create Date: 2026-11-14
"""
from typing import Sequence, Union

from alembic import op


revision: str = 'a9e3b7c2d5f1'
down_revision: Union[str, Sequence[str], None] = 'f2c8d4a61b93'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Junto con c3f8a1d27e45 da la misma regla que domain/conceptos.py::clase_aduanera_sugerida
# (lo verifica tests/test_migracion_clase_aduanera.py).
SQL_RECLASIFICAR = """
    UPDATE cat_conceptos_pagos
    SET clase_aduanera = 'OMC'
    WHERE clase_aduanera = 'PERCEPCION'
      AND UPPER(nombre) LIKE '%OMC%'
      AND UPPER(nombre) NOT LIKE '%TRIBUTO%'
"""

SQL_REVERTIR = """
    UPDATE cat_conceptos_pagos
    SET clase_aduanera = 'PERCEPCION'
    WHERE clase_aduanera = 'OMC'
      AND UPPER(nombre) LIKE '%PERCEPCI%'
      AND UPPER(nombre) LIKE '%OMC%'
      AND UPPER(nombre) NOT LIKE '%TRIBUTO%'
"""


def upgrade() -> None:
    op.execute(SQL_RECLASIFICAR)


def downgrade() -> None:
    op.execute(SQL_REVERTIR)
