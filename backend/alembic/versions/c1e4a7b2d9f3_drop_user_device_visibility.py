"""drop user_device_visibility

Revision ID: c1e4a7b2d9f3
Revises: b9d3f2a6c8e1
Create Date: 2026-10-02 15:00:00

Per-user parameter visibility only ever applied to the Viewer role, which
7b2bc1f64c8a removed - the panel never showed the editor again, and nothing
read the table.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c1e4a7b2d9f3'
down_revision: Union[str, Sequence[str], None] = 'b9d3f2a6c8e1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_table("user_device_visibility")


def downgrade() -> None:
    op.create_table(
        "user_device_visibility",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("device_id", sa.Integer(), sa.ForeignKey("devices.id"), nullable=False),
        sa.Column("parameter_name", sa.String(64), nullable=False),
        sa.Column("visible", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.UniqueConstraint("user_id", "device_id", "parameter_name", name="uq_user_dev_param"),
    )
