"""tipo_valor_provisional_a_garantizado

El tipo de valor de un contenedor ahora es solo DEFINITIVO o GARANTIZADO. "PROVISIONAL" era el nombre
antiguo de GARANTIZADO: los registros que todavía lo tengan pasan a GARANTIZADO, que es como el sistema
ya los trataba al validar sus DAMs.

No tiene vuelta atrás automática (después de convertirlos no se sabe cuáles eran PROVISIONAL);
la bajada de versión no modifica datos.

Revision ID: d5a92e7c1b38
Revises: c3f8a1d27e45
Create Date: 2026-11-13
"""
from typing import Sequence, Union

from alembic import op


revision: str = 'd5a92e7c1b38'
down_revision: Union[str, Sequence[str], None] = 'c3f8a1d27e45'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLAS_CON_TIPO_VALOR = ("maestro_importaciones", "maestros_eliminados")


def upgrade() -> None:
    for tabla in TABLAS_CON_TIPO_VALOR:
        op.execute(f"UPDATE {tabla} SET tipo_valor = 'GARANTIZADO' WHERE UPPER(TRIM(tipo_valor)) = 'PROVISIONAL'")


def downgrade() -> None:
    pass
