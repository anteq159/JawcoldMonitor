from datetime import datetime
from typing import Optional, List, Dict
from sqlalchemy import String, Integer, Float, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import JSONB
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
    poll_interval_seconds: Mapped[Optional[int]] = mapped_column(Integer)
    profile_id: Mapped[Optional[int]] = mapped_column(ForeignKey("device_profiles.id"))
    status: Mapped[str] = mapped_column(String(16), default="unknown")
    recognition_status: Mapped[str] = mapped_column(String(16), default="recognized")
    detected_manufacturer: Mapped[Optional[str]] = mapped_column(String(128))
    location: Mapped[Optional[str]] = mapped_column(String(128))
    group_name: Mapped[Optional[str]] = mapped_column(String(64))
    description: Mapped[Optional[str]] = mapped_column(String(256))
    first_seen: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    last_seen: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    # Parameter names hidden from "Zmienne sterownika" / "Bieżące wartości
    # parametrów" / wykresy for this device - purely a display filter, the
    # underlying registers/readings are untouched so hiding is reversible.
    hidden_parameters: Mapped[List[str]] = mapped_column(JSONB, default=list)
    # Display-name overrides for this device only, keyed by the real
    # register/parameter name (the one readings are actually stored and
    # matched under) - the profile and every other device using it keep
    # the original name. {"Sonda 1": "Komora A"} shows "Komora A" here
    # while readings/writes still address "Sonda 1".
    parameter_aliases: Mapped[Dict[str, str]] = mapped_column(JSONB, default=dict)
    # Display-unit overrides for this device only, keyed by the real
    # register name - for probe inputs whose meaning depends on the
    # controller's own configuration (MPXPRO S6/S7 can carry an NTC
    # temperature probe OR a 0-5V pressure probe; same Modbus register,
    # different physical unit). Applied by the scanner when storing
    # readings, so history, exports, live view and dashboard all agree.
    # {"Sonda 6": "bar"} - empty/missing means the profile's unit.
    parameter_units: Mapped[Dict[str, str]] = mapped_column(JSONB, default=dict)

    profile: Mapped[Optional["DeviceProfile"]] = relationship("DeviceProfile", lazy="selectin")
    parameters: Mapped[List["DeviceParameter"]] = relationship(
        "DeviceParameter", back_populates="device", cascade="all, delete-orphan", lazy="selectin"
    )
