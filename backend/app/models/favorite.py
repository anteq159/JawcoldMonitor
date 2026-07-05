from sqlalchemy import Integer, ForeignKey, UniqueConstraint
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
