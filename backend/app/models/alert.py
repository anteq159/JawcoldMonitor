from datetime import datetime, timezone
from typing import Optional, List
from sqlalchemy import String, Float, Boolean, DateTime, Integer, ForeignKey
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.models.base import Base, TimestampMixin


class AlertRule(Base, TimestampMixin):
    __tablename__ = "alert_rules"

    id: Mapped[int] = mapped_column(primary_key=True)
    device_id: Mapped[Optional[int]] = mapped_column(ForeignKey("devices.id"))
    sensor_id: Mapped[Optional[int]] = mapped_column(ForeignKey("sensors.id"))
    parameter_name: Mapped[str] = mapped_column(String(64), nullable=False)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    condition: Mapped[str] = mapped_column(String(16), default="gt")  # gt, lt, eq, ne, timeout
    threshold_value: Mapped[Optional[float]] = mapped_column(Float)
    threshold_min: Mapped[Optional[float]] = mapped_column(Float)
    threshold_max: Mapped[Optional[float]] = mapped_column(Float)
    severity: Mapped[str] = mapped_column(String(16), default="warning")  # info, warning, critical
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    notify_channels: Mapped[Optional[List]] = mapped_column(JSONB, default=list)

    events: Mapped[List["AlertEvent"]] = relationship("AlertEvent", back_populates="rule", cascade="all, delete-orphan")


class AlertEvent(Base):
    __tablename__ = "alert_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    rule_id: Mapped[int] = mapped_column(ForeignKey("alert_rules.id"), nullable=False)
    device_id: Mapped[Optional[int]] = mapped_column(ForeignKey("devices.id"))
    sensor_id: Mapped[Optional[int]] = mapped_column(ForeignKey("sensors.id"))
    value: Mapped[Optional[float]] = mapped_column(Float)
    severity: Mapped[str] = mapped_column(String(16), default="warning")
    message: Mapped[Optional[str]] = mapped_column(String(512))
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    acknowledged: Mapped[bool] = mapped_column(Boolean, default=False)
    acknowledged_by: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))
    acknowledged_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    rule: Mapped[AlertRule] = relationship("AlertRule", back_populates="events")
