"""add_ubicacion_almacenes

La pantalla de Almacenes pedía una ubicación, pero la base no tenía dónde guardarla y se descartaba
sin aviso. Se agrega la columna (opcional).

Revision ID: e7b41c9a2f60
Revises: d5a92e7c1b38
Create Date: 2026-11-13
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e7b41c9a2f60'
down_revision: Union[str, Sequence[str], None] = 'd5a92e7c1b38'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('cat_almacenes', sa.Column('ubicacion', sa.String(length=255), nullable=True))


def downgrade() -> None:
    op.drop_column('cat_almacenes', 'ubicacion')
