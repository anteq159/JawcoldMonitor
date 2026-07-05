"""add selected_params to device_positions

Revision ID: fbada6d4e2ed
Revises: a104f7ee9b6e
Create Date: 2026-07-05 17:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'fbada6d4e2ed'
down_revision: Union[str, Sequence[str], None] = 'a104f7ee9b6e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'device_positions',
        sa.Column('selected_params', postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default='[]'),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('device_positions', 'selected_params')
