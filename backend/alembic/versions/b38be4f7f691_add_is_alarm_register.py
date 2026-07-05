"""add is_alarm_register to register_definitions

Revision ID: b38be4f7f691
Revises: abd1c6deeaa1
Create Date: 2026-07-05 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b38be4f7f691'
down_revision: Union[str, Sequence[str], None] = 'abd1c6deeaa1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('register_definitions', sa.Column('is_alarm_register', sa.Boolean(), nullable=False, server_default='false'))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('register_definitions', 'is_alarm_register')
