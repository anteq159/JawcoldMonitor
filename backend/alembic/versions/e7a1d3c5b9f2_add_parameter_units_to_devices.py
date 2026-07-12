"""add parameter_units to devices

Revision ID: e7a1d3c5b9f2
Revises: f2c4b6e8a9d1
Create Date: 2026-07-12 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'e7a1d3c5b9f2'
down_revision: Union[str, Sequence[str], None] = 'f2c4b6e8a9d1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'devices',
        sa.Column('parameter_units', postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default='{}'),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('devices', 'parameter_units')
