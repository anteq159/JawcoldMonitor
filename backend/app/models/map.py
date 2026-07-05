from typing import Optional, List
from sqlalchemy import String, Integer, Float, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.models.base import Base, TimestampMixin


class FloorMap(Base, TimestampMixin):
    __tablename__ = "floor_maps"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    filename: Mapped[str] = mapped_column(String(256), nullable=False)
    width: Mapped[Optional[int]] = mapped_column(Integer)
    height: Mapped[Optional[int]] = mapped_column(Integer)

    positions: Mapped[List["DevicePosition"]] = relationship(
        "DevicePosition", back_populates="floor_map", cascade="all, delete-orphan", lazy="selectin"
    )


class DevicePosition(Base):
    __tablename__ = "device_positions"

    id: Mapped[int] = mapped_column(primary_key=True)
    map_id: Mapped[int] = mapped_column(ForeignKey("floor_maps.id"), nullable=False)
    device_id: Mapped[int] = mapped_column(ForeignKey("devices.id"), nullable=False)
    x_percent: Mapped[float] = mapped_column(Float, nullable=False)
    y_percent: Mapped[float] = mapped_column(Float, nullable=False)

    floor_map: Mapped[FloorMap] = relationship("FloorMap", back_populates="positions")
