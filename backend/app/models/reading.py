from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import String, Float, DateTime, Integer, ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import Base


class Reading(Base):
    __tablename__ = "readings"
    # Every hot query on this table filters device_id (or sensor_id)
    # TOGETHER with timestamp - history charts, latest-readings, per-device
    # exports. With only single-column indexes Postgres fell back to a
    # sequential scan of the whole table (measured: 113ms over 61k rows on
    # this dev machine; proportionally worse on a Raspberry Pi as the table
    # grows toward the pruning horizon). Composite indexes match those
    # queries directly; the single-column device_id/sensor_id indexes are
    # dropped since a composite serves leading-column lookups too, and
    # every index removed is one fewer write per reading insert on the
    # RPi's SD card. ix_readings_timestamp stays - pruning deletes by
    # timestamp alone.
    __table_args__ = (
        Index("ix_readings_device_ts", "device_id", "timestamp"),
        Index("ix_readings_sensor_ts", "sensor_id", "timestamp"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    device_id: Mapped[Optional[int]] = mapped_column(ForeignKey("devices.id"))
    sensor_id: Mapped[Optional[int]] = mapped_column(ForeignKey("sensors.id"))
    parameter_name: Mapped[str] = mapped_column(String(64), nullable=False)
    value: Mapped[float] = mapped_column(Float, nullable=False)
    unit: Mapped[Optional[str]] = mapped_column(String(16))
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        index=True,
    )
