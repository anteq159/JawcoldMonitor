"""drop unused per-device bus columns

Revision ID: b9d3f2a6c8e1
Revises: a7c2e9f1d3b6
Create Date: 2026-10-02 12:00:00

port/baudrate/parity/stopbits/timeout were stored per device but never
used: the scanner talks to every controller over the single global RS485
port (Ustawienia -> RS485). The panel showed them as if they mattered.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b9d3f2a6c8e1'
down_revision: Union[str, Sequence[str], None] = 'a7c2e9f1d3b6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

COLUMNS = ("port", "baudrate", "parity", "stopbits", "timeout")


def upgrade() -> None:
    for column in COLUMNS:
        op.drop_column("devices", column)


def downgrade() -> None:
    op.add_column("devices", sa.Column("port", sa.String(64), server_default="/dev/ttyUSB0"))
    op.add_column("devices", sa.Column("baudrate", sa.Integer(), server_default="9600"))
    op.add_column("devices", sa.Column("parity", sa.String(4), server_default="N"))
    op.add_column("devices", sa.Column("stopbits", sa.Integer(), server_default="1"))
    op.add_column("devices", sa.Column("timeout", sa.Float(), server_default="0.15"))
