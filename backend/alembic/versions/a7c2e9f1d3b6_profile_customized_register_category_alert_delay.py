"""profile customized flag, register category, alert rule delay

Revision ID: a7c2e9f1d3b6
Revises: c3f7a2d18b45
Create Date: 2026-10-01 22:40:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a7c2e9f1d3b6'
down_revision: Union[str, Sequence[str], None] = 'c3f7a2d18b45'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # A built-in profile edited in Konfiguracja - the startup re-sync to the
    # driver's register map must leave it alone from then on (it used to
    # overwrite every edit on each backend restart).
    op.add_column("device_profiles", sa.Column("customized", sa.Boolean(), nullable=False, server_default=sa.false()))
    # measurement | setpoint | parameter | status | alarm - drives where a
    # value is shown on the device page and whether it is plotted. NULL =
    # derived from register_type/writable (see app.services.register_category).
    op.add_column("register_definitions", sa.Column("category", sa.String(16), nullable=True))
    # Alarm delay: the condition must hold this long before an event is
    # raised - a defrost cycle pushes the air temperature over the high
    # threshold for several minutes by design.
    op.add_column("alert_rules", sa.Column("delay_seconds", sa.Integer(), nullable=False, server_default="0"))


def downgrade() -> None:
    op.drop_column("alert_rules", "delay_seconds")
    op.drop_column("register_definitions", "category")
    op.drop_column("device_profiles", "customized")
