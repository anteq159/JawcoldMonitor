from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import String, DateTime, Integer, ForeignKey
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import Base


class EventLog(Base):
    __tablename__ = "event_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    event_type: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    device_id: Mapped[Optional[int]] = mapped_column(ForeignKey("devices.id"))
    sensor_id: Mapped[Optional[int]] = mapped_column(ForeignKey("sensors.id"))
    user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))
    message: Mapped[Optional[str]] = mapped_column(String(1024))
    metadata_: Mapped[Optional[dict]] = mapped_column("metadata", JSONB)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        index=True,
    )
