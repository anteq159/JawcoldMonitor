"""register_definitions.bit - flags packed into a holding/input register

Revision ID: d4f8b1c3e7a2
Revises: c1e4a7b2d9f3
Create Date: 2026-10-02 19:30:00

Drives like the Schneider ATV320 report run/fault/warning as bits of one
status word (ETA) instead of separate coils. bit = N exposes bit N of the
register as its own 0/1 variable; NULL = the whole register as before.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd4f8b1c3e7a2'
down_revision: Union[str, Sequence[str], None] = 'c1e4a7b2d9f3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("register_definitions", sa.Column("bit", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("register_definitions", "bit")
