from typing import Optional, List
from sqlalchemy import String, Integer, Float, ForeignKey
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.models.base import Base, TimestampMixin


class FloorMap(Base, TimestampMixin):
    """Either an uploaded floor-plan image (kind="image", has a filename)
    or a drawn refrigeration-circuit schematic (kind="schematic", no file,
    content lives in `drawing`). Both kinds share DevicePosition pins, so
    live parameter tiles work identically on top of either surface."""
    __tablename__ = "floor_maps"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    kind: Mapped[str] = mapped_column(String(16), default="image")
    filename: Mapped[Optional[str]] = mapped_column(String(256))
    width: Mapped[Optional[int]] = mapped_column(Integer)
    height: Mapped[Optional[int]] = mapped_column(Integer)
    # Schematic content: list of {"type":"line","points":[{"x","y"}...],
    # "color","width","arrow_end"} and {"type":"label","x","y","text",
    # "size"} elements, coordinates in percent (0-100) like pin positions.
    drawing: Mapped[List] = mapped_column(JSONB, default=list)

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
    # Up to 3 parameter names (device.profile.registers names, or a
    # sensor's single implicit value) chosen to show on this device's map
    # pin - empty means "not chosen yet", which the API/frontend falls
    # back to showing the first available reading for, same as before
    # this existed.
    selected_params: Mapped[List[str]] = mapped_column(JSONB, default=list)

    floor_map: Mapped[FloorMap] = relationship("FloorMap", back_populates="positions")
