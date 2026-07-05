from typing import Optional
from sqlalchemy import Integer, String, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import Base, TimestampMixin


class Favorite(Base, TimestampMixin):
    """A user's pinned/favorite device, surfaced on the dashboard."""
    __tablename__ = "favorites"
    __table_args__ = (
        UniqueConstraint("user_id", "device_id", name="uq_user_device_favorite"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    device_id: Mapped[int] = mapped_column(Integer, ForeignKey("devices.id"), nullable=False)


class FavoriteParameter(Base, TimestampMixin):
    """A single parameter pinned to a user's 'Ulubione parametry' dashboard
    widget - source_type is 'device' (a named register/parameter on a
    controller) or 'sensor' (a Dallas 1-Wire sensor, which has one value,
    so param_name is unused). Previously stored in the browser's
    localStorage, unscoped to any account - moved server-side 2026-07-05
    so it follows the user across browsers/devices instead of the session."""
    __tablename__ = "favorite_parameters"
    __table_args__ = (
        UniqueConstraint("user_id", "source_type", "source_id", "param_name", name="uq_user_favorite_parameter"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    source_type: Mapped[str] = mapped_column(String(16), nullable=False)
    source_id: Mapped[int] = mapped_column(Integer, nullable=False)
    param_name: Mapped[Optional[str]] = mapped_column(String(128))
