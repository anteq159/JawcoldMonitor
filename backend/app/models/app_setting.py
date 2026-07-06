from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import Base, TimestampMixin


class AppSetting(Base, TimestampMixin):
    """A runtime override for one operational setting, edited from the
    Ustawienia page. .env/environment variables stay the bootstrap
    defaults; a row here wins over them at startup and immediately after
    each edit. Only keys whitelisted in services/runtime_settings.py are
    ever written."""
    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[str] = mapped_column(String(512), nullable=False)
