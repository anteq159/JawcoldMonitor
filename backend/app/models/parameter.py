from typing import Optional
from sqlalchemy import String, Integer, Float, Boolean, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.models.base import Base, TimestampMixin


class DeviceParameter(Base, TimestampMixin):
    __tablename__ = "device_parameters"

    id: Mapped[int] = mapped_column(primary_key=True)
    device_id: Mapped[int] = mapped_column(ForeignKey("devices.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(64), nullable=False)
    unit: Mapped[Optional[str]] = mapped_column(String(16))
    description: Mapped[Optional[str]] = mapped_column(String(256))
    register_address: Mapped[int] = mapped_column(Integer, default=0)
    register_type: Mapped[str] = mapped_column(String(16), default="holding")
    data_type: Mapped[str] = mapped_column(String(16), default="uint16")
    scale_factor: Mapped[float] = mapped_column(Float, default=1.0)
    offset: Mapped[float] = mapped_column(Float, default=0.0)
    threshold_min: Mapped[Optional[float]] = mapped_column(Float)
    threshold_max: Mapped[Optional[float]] = mapped_column(Float)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)

    device: Mapped["Device"] = relationship("Device", back_populates="parameters")
