"""bus_lines - several RS485 lines with their own speed/frame; devices.line_id

Revision ID: e6b2d8f4a1c9
Revises: d4f8b1c3e7a2
Create Date: 2026-10-02

The first line is created at startup from the existing RS485_* settings
(main._ensure_bus_lines), not here: the effective port may come from an
app_settings override that this migration should not have to interpret.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'e6b2d8f4a1c9'
down_revision: Union[str, Sequence[str], None] = 'd4f8b1c3e7a2'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'bus_lines',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('name', sa.String(64), nullable=False),
        sa.Column('port', sa.String(256), nullable=False),
        sa.Column('baudrate', sa.Integer(), nullable=False, server_default='19200'),
        sa.Column('parity', sa.String(1), nullable=False, server_default='N'),
        sa.Column('stopbits', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('enabled', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
    )
    op.add_column('devices', sa.Column('line_id', sa.Integer(), nullable=True))
    op.create_foreign_key('fk_devices_line_id', 'devices', 'bus_lines', ['line_id'], ['id'], ondelete='SET NULL')


def downgrade() -> None:
    op.drop_constraint('fk_devices_line_id', 'devices', type_='foreignkey')
    op.drop_column('devices', 'line_id')
    op.drop_table('bus_lines')
