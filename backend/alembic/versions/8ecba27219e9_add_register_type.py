"""add register_type to register_definitions

Revision ID: 8ecba27219e9
Revises: fbada6d4e2ed
Create Date: 2026-07-05 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '8ecba27219e9'
down_revision: Union[str, Sequence[str], None] = 'fbada6d4e2ed'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # server_default='holding' since every existing register (all 4
    # original manufacturer drivers) implicitly assumed holding registers.
    op.add_column('register_definitions', sa.Column('register_type', sa.String(length=16), nullable=False, server_default='holding'))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('register_definitions', 'register_type')
