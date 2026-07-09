"""add hidden_parameters to devices

Revision ID: c5f1a9d2b3e7
Revises: 1eaf4af3064d
Create Date: 2026-07-09 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'c5f1a9d2b3e7'
down_revision: Union[str, Sequence[str], None] = '1eaf4af3064d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'devices',
        sa.Column('hidden_parameters', postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default='[]'),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('devices', 'hidden_parameters')
