"""add hardware_alarm_events table

Revision ID: f2c4b6e8a9d1
Revises: d8a3e5f0c1b4
Create Date: 2026-07-09 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f2c4b6e8a9d1'
down_revision: Union[str, Sequence[str], None] = 'd8a3e5f0c1b4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'hardware_alarm_events',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('device_id', sa.Integer(), sa.ForeignKey('devices.id'), nullable=False),
        sa.Column('code', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(32), nullable=False),
        sa.Column('description', sa.String(256), nullable=True),
        sa.Column('severity', sa.String(16), nullable=False, server_default='warning'),
        sa.Column('active', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('triggered_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('resolved_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('acknowledged', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('acknowledged_by', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('acknowledged_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index('ix_hardware_alarm_events_device_id', 'hardware_alarm_events', ['device_id'])
    op.create_index('ix_hardware_alarm_events_active', 'hardware_alarm_events', ['active'])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('ix_hardware_alarm_events_active', table_name='hardware_alarm_events')
    op.drop_index('ix_hardware_alarm_events_device_id', table_name='hardware_alarm_events')
    op.drop_table('hardware_alarm_events')
