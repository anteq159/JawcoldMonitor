"""add register position and device parameter_aliases

Revision ID: d8a3e5f0c1b4
Revises: c5f1a9d2b3e7
Create Date: 2026-07-09 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'd8a3e5f0c1b4'
down_revision: Union[str, Sequence[str], None] = 'c5f1a9d2b3e7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'register_definitions',
        sa.Column('position', sa.Integer(), nullable=False, server_default='0'),
    )
    op.add_column(
        'devices',
        sa.Column('parameter_aliases', postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default='{}'),
    )
    # Existing rows have no explicit order yet - backfill from id so the
    # relationship's new order_by doesn't silently scramble every
    # already-created profile's register list on upgrade.
    op.execute("""
        UPDATE register_definitions rd
        SET position = sub.rn
        FROM (
            SELECT id, ROW_NUMBER() OVER (PARTITION BY profile_id ORDER BY id) - 1 AS rn
            FROM register_definitions
        ) sub
        WHERE rd.id = sub.id
    """)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('devices', 'parameter_aliases')
    op.drop_column('register_definitions', 'position')
