from datetime import datetime
from typing import Optional, List
from sqlalchemy import String, Integer, Float, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.models.base import Base, TimestampMixin


class Device(Base, TimestampMixin):
    __tablename__ = "devices"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    modbus_address: Mapped[int] = mapped_column(Integer, nullable=False)
    port: Mapped[str] = mapped_column(String(64), default="/dev/ttyUSB0")
    baudrate: Mapped[int] = mapped_column(Integer, default=9600)
    parity: Mapped[str] = mapped_column(String(4), default="N")
    stopbits: Mapped[int] = mapped_column(Integer, default=1)
    timeout: Mapped[float] = mapped_column(Float, default=0.15)
    profile_id: Mapped[Optional[int]] = mapped_column(ForeignKey("device_profiles.id"))
    status: Mapped[str] = mapped_column(String(16), default="unknown")
    location: Mapped[Optional[str]] = mapped_column(String(128))
    group_name: Mapped[Optional[str]] = mapped_column(String(64))
    description: Mapped[Optional[str]] = mapped_column(String(256))
    first_seen: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    last_seen: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    profile: Mapped[Optional["DeviceProfile"]] = relationship("DeviceProfile", lazy="selectin")
    parameters: Mapped[List["DeviceParameter"]] = relationship(
        "DeviceParameter", back_populates="device", cascade="all, delete-orphan", lazy="selectin"
    )
