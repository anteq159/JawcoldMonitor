from typing import Optional, List
from sqlalchemy import String, Integer, Float, Boolean, ForeignKey
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.models.base import Base, TimestampMixin


class DeviceProfile(Base, TimestampMixin):
    __tablename__ = "device_profiles"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(128), unique=True, nullable=False)
    manufacturer: Mapped[Optional[str]] = mapped_column(String(128))
    model: Mapped[Optional[str]] = mapped_column(String(128))
    description: Mapped[Optional[str]] = mapped_column(String(512))
    register_map: Mapped[Optional[dict]] = mapped_column(JSONB)
    source: Mapped[str] = mapped_column(String(16), default="local")

    registers: Mapped[List["RegisterDefinition"]] = relationship(
        "RegisterDefinition", back_populates="profile", cascade="all, delete-orphan", lazy="selectin"
    )


class RegisterDefinition(Base):
    __tablename__ = "register_definitions"

    id: Mapped[int] = mapped_column(primary_key=True)
    profile_id: Mapped[int] = mapped_column(ForeignKey("device_profiles.id"), nullable=False)
    address: Mapped[int] = mapped_column(Integer, nullable=False)
    name: Mapped[str] = mapped_column(String(64), nullable=False)
    unit: Mapped[Optional[str]] = mapped_column(String(16))
    description: Mapped[Optional[str]] = mapped_column(String(256))
    data_type: Mapped[str] = mapped_column(String(16), default="uint16")
    scale_factor: Mapped[float] = mapped_column(Float, default=1.0)
    writable: Mapped[bool] = mapped_column(Boolean, default=False)
    is_alarm_register: Mapped[bool] = mapped_column(Boolean, default=False)

    profile: Mapped[DeviceProfile] = relationship("DeviceProfile", back_populates="registers")
