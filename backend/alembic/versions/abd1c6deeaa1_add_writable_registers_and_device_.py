"""add writable registers and device recognition status

Revision ID: abd1c6deeaa1
Revises: 49aa7a8ee6ed
Create Date: 2026-07-05 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'abd1c6deeaa1'
down_revision: Union[str, Sequence[str], None] = '49aa7a8ee6ed'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('register_definitions', sa.Column('writable', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('devices', sa.Column('recognition_status', sa.String(length=16), nullable=False, server_default='recognized'))
    op.add_column('devices', sa.Column('detected_manufacturer', sa.String(length=128), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('devices', 'detected_manufacturer')
    op.drop_column('devices', 'recognition_status')
    op.drop_column('register_definitions', 'writable')
