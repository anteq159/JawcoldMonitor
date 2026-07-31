"""add card_parameters and chart_hidden_parameters to devices

Also adds the composite index the alarm loop needs: it looks up the open
event per rule on every scan cycle, which was a sequential scan until now.

Revision ID: c3f7a2d18b45
Revises: e7a1d3c5b9f2
Create Date: 2026-07-31 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'c3f7a2d18b45'
down_revision: Union[str, Sequence[str], None] = 'e7a1d3c5b9f2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'devices',
        sa.Column('card_parameters', postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default='[]'),
    )
    op.add_column(
        'devices',
        sa.Column('chart_hidden_parameters', postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default='[]'),
    )
    op.create_index(
        'ix_alert_events_rule_open', 'alert_events', ['rule_id', 'resolved_at'], unique=False
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('ix_alert_events_rule_open', table_name='alert_events')
    op.drop_column('devices', 'chart_hidden_parameters')
    op.drop_column('devices', 'card_parameters')
