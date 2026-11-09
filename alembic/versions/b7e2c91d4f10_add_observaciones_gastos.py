"""add_observaciones_gastos

Formaliza la columna 'observaciones' de registro_gastos y gastos_eliminados, que existía en
models.py y en la base de producción pero nunca tuvo migración (se había creado manualmente).
Es idempotente: en bases que ya la tienen no hace nada.

Revision ID: b7e2c91d4f10
Revises: a4d6b8b45f3e
Create Date: 2026-11-08 20:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b7e2c91d4f10'
down_revision: Union[str, Sequence[str], None] = 'a4d6b8b45f3e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLAS = ("registro_gastos", "gastos_eliminados")


def _tiene_columna(tabla: str, columna: str) -> bool:
    inspector = sa.inspect(op.get_bind())
    return any(c["name"] == columna for c in inspector.get_columns(tabla))


def upgrade() -> None:
    """Upgrade schema."""
    for tabla in TABLAS:
        if not _tiene_columna(tabla, "observaciones"):
            op.add_column(tabla, sa.Column("observaciones", sa.Text(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    for tabla in TABLAS:
        if _tiene_columna(tabla, "observaciones"):
            op.drop_column(tabla, "observaciones")
