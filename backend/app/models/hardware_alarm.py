from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import String, Boolean, DateTime, Integer, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import Base


class HardwareAlarmEvent(Base):
    """Persistent state for a controller's own reported alarm (e.g. the
    MPXPRO's LO/HI/rE1 codes) - distinct from AlertEvent, which always
    belongs to a user-configured AlertRule and doesn't fit a hardware
    alarm with no rule behind it.

    One row per (device, code) alarm episode: created when the scanner
    sees the code go active, closed (active=False, resolved_at set) when
    it clears. Acknowledging only records that a person has seen and
    dealt with it in the app - it does not write anything back to the
    controller, which keeps its own alarm state (and buzzer/relay)
    independently until the physical condition clears or someone resets
    it at the keypad."""
    __tablename__ = "hardware_alarm_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    device_id: Mapped[int] = mapped_column(ForeignKey("devices.id"), nullable=False, index=True)
    code: Mapped[int] = mapped_column(Integer, nullable=False)
    name: Mapped[str] = mapped_column(String(32), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String(256))
    severity: Mapped[str] = mapped_column(String(16), default="warning")
    active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    triggered_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False,
    )
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    acknowledged: Mapped[bool] = mapped_column(Boolean, default=False)
    acknowledged_by: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))
    acknowledged_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
