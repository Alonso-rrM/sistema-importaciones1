"""agencias_como_grupos_de_ruc

La agencia de aduanas pasa a ser un GRUPO (marca) y sus RUC son proveedores: una agencia puede operar con
varias empresas, cada una con su RUC, y el RUC se registra una sola vez (en Proveedores).

- cat_proveedores.id_agente: grupo al que pertenece el RUC (uno solo).
- Datos existentes: el RUC de cada agencia pasa a Proveedores, enlazado a su agencia. Si ya existía un
  proveedor con ese RUC, solo se enlaza (si no pertenecía a otra agencia); si no existía, se crea (nacional).
  Si su nombre choca con el de otro proveedor, se le agrega "(RUC ...)".
- Se quita cat_agentes.ruc. Ninguna agencia ni expediente cambia.

Revision ID: b6d4e8f2a1c7
Revises: a9e3b7c2d5f1
Create Date: 2026-11-16
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b6d4e8f2a1c7'
down_revision: Union[str, Sequence[str], None] = 'a9e3b7c2d5f1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SQL_ENLAZAR_EXISTENTES = """
    UPDATE cat_proveedores p
    SET id_agente = a.id_agente
    FROM cat_agentes a
    WHERE a.ruc IS NOT NULL AND TRIM(a.ruc) <> '' AND p.ruc = TRIM(a.ruc) AND p.id_agente IS NULL
"""

SQL_CREAR_FALTANTES = """
    INSERT INTO cat_proveedores (nombre, ruc, categoria, estado_registro, id_agente)
    SELECT
        CASE WHEN EXISTS (SELECT 1 FROM cat_proveedores p2 WHERE p2.nombre = a.nombre)
             THEN LEFT(a.nombre, 180) || ' (RUC ' || TRIM(a.ruc) || ')'
             ELSE a.nombre END,
        TRIM(a.ruc), 'NACIONAL', 'ACTIVO', a.id_agente
    FROM cat_agentes a
    WHERE a.ruc IS NOT NULL AND TRIM(a.ruc) <> ''
      AND NOT EXISTS (SELECT 1 FROM cat_proveedores p WHERE p.ruc = TRIM(a.ruc))
"""


def upgrade() -> None:
    op.add_column('cat_proveedores', sa.Column('id_agente', sa.Integer(), nullable=True))
    op.create_index(op.f('ix_cat_proveedores_id_agente'), 'cat_proveedores', ['id_agente'], unique=False)
    op.create_foreign_key('cat_proveedores_id_agente_fkey', 'cat_proveedores', 'cat_agentes', ['id_agente'], ['id_agente'])
    op.execute(SQL_ENLAZAR_EXISTENTES)
    op.execute(SQL_CREAR_FALTANTES)
    op.drop_column('cat_agentes', 'ruc')   # su restricción de unicidad se va con la columna


def downgrade() -> None:
    # Vuelve a poner en cada agencia el RUC de uno de sus proveedores (los proveedores creados se conservan)
    op.add_column('cat_agentes', sa.Column('ruc', sa.String(length=11), nullable=True))
    op.execute("""
        UPDATE cat_agentes a SET ruc = (SELECT MIN(p.ruc) FROM cat_proveedores p WHERE p.id_agente = a.id_agente)
    """)
    op.create_unique_constraint('cat_agentes_ruc_key', 'cat_agentes', ['ruc'])
    op.drop_constraint('cat_proveedores_id_agente_fkey', 'cat_proveedores', type_='foreignkey')
    op.drop_index(op.f('ix_cat_proveedores_id_agente'), table_name='cat_proveedores')
    op.drop_column('cat_proveedores', 'id_agente')
