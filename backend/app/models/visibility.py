from sqlalchemy import Integer, ForeignKey, String, Boolean, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import Base


class UserDeviceVisibility(Base):
    """Which parameters a restricted user can see per device. Empty = all visible."""
    __tablename__ = "user_device_visibility"
    __table_args__ = (
        UniqueConstraint("user_id", "device_id", "parameter_name", name="uq_user_dev_param"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    device_id: Mapped[int] = mapped_column(Integer, ForeignKey("devices.id"), nullable=False)
    parameter_name: Mapped[str] = mapped_column(String(64), nullable=False)
    visible: Mapped[bool] = mapped_column(Boolean, default=True)
