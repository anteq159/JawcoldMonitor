"""add favorite_parameters table

Revision ID: a104f7ee9b6e
Revises: 19a7293469b8
Create Date: 2026-07-05 16:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a104f7ee9b6e'
down_revision: Union[str, Sequence[str], None] = '19a7293469b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'favorite_parameters',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('source_type', sa.String(length=16), nullable=False),
        sa.Column('source_id', sa.Integer(), nullable=False),
        sa.Column('param_name', sa.String(length=128), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'source_type', 'source_id', 'param_name', name='uq_user_favorite_parameter'),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table('favorite_parameters')
