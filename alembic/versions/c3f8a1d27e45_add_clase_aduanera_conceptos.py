"""add_clase_aduanera_conceptos

Agrega cat_conceptos_pagos.clase_aduanera (TRIBUTO / PERCEPCION / OMC / NINGUNA).

Hasta ahora la máquina de estados de la DAM deducía el papel de un gasto buscando palabras dentro del
NOMBRE del concepto ("TRIBUTO", "PERCEPCI", "OMC"). Esta migración guarda ese papel en un campo propio
y clasifica los conceptos existentes con EXACTAMENTE la misma regla, de modo que ningún contenedor
cambia de comportamiento al aplicarla.

Revision ID: c3f8a1d27e45
Revises: b7e2c91d4f10
Create Date: 2026-11-13
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c3f8a1d27e45'
down_revision: Union[str, Sequence[str], None] = 'b7e2c91d4f10'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Misma regla y mismo orden de prioridad que domain/conceptos.py::clase_aduanera_sugerida
# (lo verifica tests/test_migracion_clase_aduanera.py).
SQL_CLASIFICAR_EXISTENTES = """
    UPDATE cat_conceptos_pagos
    SET clase_aduanera = CASE
        WHEN UPPER(nombre) LIKE '%TRIBUTO%'  THEN 'TRIBUTO'
        WHEN UPPER(nombre) LIKE '%PERCEPCI%' THEN 'PERCEPCION'
        WHEN UPPER(nombre) LIKE '%OMC%'      THEN 'OMC'
        ELSE 'NINGUNA'
    END
"""


def upgrade() -> None:
    op.add_column(
        'cat_conceptos_pagos',
        sa.Column('clase_aduanera', sa.String(length=20), server_default=sa.text("'NINGUNA'"), nullable=False),
    )
    op.execute(SQL_CLASIFICAR_EXISTENTES)


def downgrade() -> None:
    op.drop_column('cat_conceptos_pagos', 'clase_aduanera')
