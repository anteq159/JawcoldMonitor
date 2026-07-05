"""add poll_interval_seconds to devices

Revision ID: 19a7293469b8
Revises: b38be4f7f691
Create Date: 2026-07-05 15:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '19a7293469b8'
down_revision: Union[str, Sequence[str], None] = 'b38be4f7f691'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Nullable, no server_default: null means "use the global
    # KNOWN_SCAN_INTERVAL default" rather than every existing device
    # silently getting a fixed number baked in at migration time.
    op.add_column('devices', sa.Column('poll_interval_seconds', sa.Integer(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('devices', 'poll_interval_seconds')
