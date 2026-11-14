"""clave_cambiada_en_usuarios

Momento (UTC) del último cambio de contraseña. Las sesiones abiertas antes de ese momento dejan de
valer: si un Administrador restablece una contraseña, la sesión que alguien tuviera con la anterior
se cierra en su siguiente acción.

Revision ID: f2c8d4a61b93
Revises: e7b41c9a2f60
Create Date: 2026-11-14
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f2c8d4a61b93'
down_revision: Union[str, Sequence[str], None] = 'e7b41c9a2f60'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('usuarios', sa.Column('clave_cambiada_en', sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column('usuarios', 'clave_cambiada_en')
