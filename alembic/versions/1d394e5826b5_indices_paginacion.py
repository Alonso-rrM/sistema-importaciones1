"""indices_paginacion

Revision ID: 1d394e5826b5
Revises: 654cfb92d6c0
Create Date: 2026-10-18 21:14:14.726683

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '1d394e5826b5'
down_revision: Union[str, Sequence[str], None] = '654cfb92d6c0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_index('idx_maestro_created_id', 'maestro_importaciones', ['created_at', 'id_maestro'], unique=False)
    op.create_index('idx_gasto_dam_created', 'registro_gastos', ['id_dam', 'created_at'], unique=False)
    op.create_index('idx_gasto_vencimiento_id', 'registro_gastos', ['fecha_vencimiento', 'id_gasto'], unique=False)
    op.create_index('idx_pago_fecha_id', 'registro_pagos', ['fecha_pago', 'id_pago'], unique=False)
    op.create_index('idx_voucher_fecha_estado', 'vouchers_bancarios', ['fecha_transferencia', 'estado_registro'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('idx_voucher_fecha_estado', table_name='vouchers_bancarios')
    op.drop_index('idx_pago_fecha_id', table_name='registro_pagos')
    op.drop_index('idx_gasto_vencimiento_id', table_name='registro_gastos')
    op.drop_index('idx_gasto_dam_created', table_name='registro_gastos')
    op.drop_index('idx_maestro_created_id', table_name='maestro_importaciones')
