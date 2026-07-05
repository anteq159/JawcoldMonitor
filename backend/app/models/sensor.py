from datetime import datetime
from typing import Optional
from sqlalchemy import String, DateTime, Float
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import Base, TimestampMixin


class Sensor(Base, TimestampMixin):
    __tablename__ = "sensors"

    id: Mapped[int] = mapped_column(primary_key=True)
    rom_id: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    sensor_type: Mapped[str] = mapped_column(String(32), default="DS18B20")
    location: Mapped[Optional[str]] = mapped_column(String(128))
    room: Mapped[Optional[str]] = mapped_column(String(64))
    description: Mapped[Optional[str]] = mapped_column(String(256))
    status: Mapped[str] = mapped_column(String(16), default="unknown")
    calibration_offset: Mapped[float] = mapped_column(Float, default=0.0)
    first_seen: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    last_seen: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
