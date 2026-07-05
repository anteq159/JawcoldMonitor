"""composite readings indexes

Revision ID: fbb3f6042733
Revises: 8ecba27219e9
Create Date: 2026-07-05 19:44:33.102969

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'fbb3f6042733'
down_revision: Union[str, Sequence[str], None] = '8ecba27219e9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Composite indexes matching the actual query shapes (device/sensor +
    # timestamp range or DESC limit); the old single-column device_id/
    # sensor_id indexes become redundant (composite leading column covers
    # them) and are dropped to cut per-insert write overhead on the RPi.
    op.create_index("ix_readings_device_ts", "readings", ["device_id", "timestamp"])
    op.create_index("ix_readings_sensor_ts", "readings", ["sensor_id", "timestamp"])
    op.drop_index("ix_readings_device_id", table_name="readings")
    op.drop_index("ix_readings_sensor_id", table_name="readings")


def downgrade() -> None:
    op.create_index("ix_readings_device_id", "readings", ["device_id"])
    op.create_index("ix_readings_sensor_id", "readings", ["sensor_id"])
    op.drop_index("ix_readings_device_ts", table_name="readings")
    op.drop_index("ix_readings_sensor_ts", table_name="readings")
