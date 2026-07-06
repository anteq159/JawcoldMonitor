"""Runtime-editable settings: the operational subset of .env, adjustable
from the Ustawienia page without SSH access to the Pi.

How it works:
- .env / environment variables remain the bootstrap values (pydantic
  Settings reads them at import).
- Rows in app_settings override them: loaded once at startup and applied
  again immediately on every edit (plain setattr on the live `settings`
  object - the scanner and notification code read settings.X on each use,
  so changes take effect on the next cycle without a restart).
- RS485 port parameters are the exception: the Modbus driver is
  constructed once at startup, so those are flagged restart_required and
  only take effect after the app restarts.

Deliberately NOT editable here: SECRET_KEY, DATABASE_URL, REDIS_URL,
PREVIEW_MODE, ALLOWED_ORIGINS - infrastructure/security settings that
should require shell access, not a web form.
"""

import logging
from dataclasses import dataclass
from typing import Dict

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.app_setting import AppSetting

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class SettingMeta:
    label: str          # Polish label shown in the UI
    category: str       # UI grouping
    type: str           # "int" | "float" | "bool" | "str"
    restart_required: bool = False
    secret: bool = False  # render as a password field


EDITABLE_SETTINGS: Dict[str, SettingMeta] = {
    # Skanowanie
    "KNOWN_SCAN_INTERVAL": SettingMeta("Interwał odpytywania urządzeń (s)", "Skanowanie", "int"),
    "DISCOVERY_SCAN_INTERVAL": SettingMeta("Interwał wykrywania nowych urządzeń (s)", "Skanowanie", "int"),
    "DISCOVERY_MAX_ADDRESS": SettingMeta("Najwyższy skanowany adres Modbus", "Skanowanie", "int"),
    "DALLAS_SCAN_INTERVAL": SettingMeta("Interwał odczytu czujników Dallas (s)", "Skanowanie", "int"),
    "READINGS_RETENTION_DAYS": SettingMeta("Retencja odczytów (dni, 0 = bez kasowania)", "Skanowanie", "int"),
    # RS485 (restart)
    "RS485_PORTS": SettingMeta("Port RS485", "RS485", "str", restart_required=True),
    "RS485_BAUDRATE": SettingMeta("Prędkość transmisji (baud)", "RS485", "int", restart_required=True),
    "MODBUS_TIMEOUT": SettingMeta("Timeout Modbus (s)", "RS485", "float", restart_required=True),
    # Alarmy systemowe
    "OFFLINE_ALARM_MINUTES": SettingMeta("Alarm offline po (min, 0 = wył.)", "Alarmy systemowe", "int"),
    "DISK_ALARM_PERCENT": SettingMeta("Alarm zapełnienia dysku (%, 0 = wył.)", "Alarmy systemowe", "int"),
    "NOTIFY_SYSTEM_CHANNELS": SettingMeta("Kanały alarmów systemowych (email,telegram)", "Alarmy systemowe", "str"),
    # E-mail
    "SMTP_HOST": SettingMeta("Serwer SMTP", "Powiadomienia e-mail", "str"),
    "SMTP_PORT": SettingMeta("Port SMTP", "Powiadomienia e-mail", "int"),
    "SMTP_USER": SettingMeta("Użytkownik SMTP", "Powiadomienia e-mail", "str"),
    "SMTP_PASSWORD": SettingMeta("Hasło SMTP", "Powiadomienia e-mail", "str", secret=True),
    "SMTP_FROM": SettingMeta("Adres nadawcy", "Powiadomienia e-mail", "str"),
    "ALERT_EMAIL_TO": SettingMeta("Odbiorcy alarmów (po przecinku)", "Powiadomienia e-mail", "str"),
    # Telegram
    "TELEGRAM_BOT_TOKEN": SettingMeta("Token bota", "Powiadomienia Telegram", "str", secret=True),
    "TELEGRAM_CHAT_ID": SettingMeta("Chat ID", "Powiadomienia Telegram", "str"),
    # Kopie zapasowe
    "BACKUP_AUTO_ENABLED": SettingMeta("Automatyczne kopie włączone", "Kopie zapasowe", "bool"),
    "BACKUP_INTERVAL_HOURS": SettingMeta("Co ile godzin", "Kopie zapasowe", "int"),
    "BACKUP_DIR": SettingMeta("Katalog kopii", "Kopie zapasowe", "str"),
    "BACKUP_RETENTION_COUNT": SettingMeta("Ile ostatnich plików trzymać", "Kopie zapasowe", "int"),
}


def coerce(key: str, raw: str):
    """Parse the stored/submitted string into the type settings expects.
    Raises ValueError with a Polish message for the API to surface."""
    meta = EDITABLE_SETTINGS[key]
    raw = raw.strip()
    try:
        if meta.type == "int":
            value = int(raw)
            if value < 0:
                raise ValueError
            return value
        if meta.type == "float":
            value = float(raw)
            if value <= 0:
                raise ValueError
            return value
        if meta.type == "bool":
            if raw.lower() in ("true", "1", "tak"):
                return True
            if raw.lower() in ("false", "0", "nie"):
                return False
            raise ValueError
        return raw
    except ValueError:
        raise ValueError(f"Nieprawidłowa wartość dla {key}: '{raw}'")


async def load_overrides(db: AsyncSession) -> int:
    """Apply all stored overrides onto the live settings object; returns
    how many were applied. Unknown keys (e.g. from a newer version after
    a rollback) are skipped with a warning rather than crashing startup."""
    result = await db.execute(select(AppSetting))
    applied = 0
    for row in result.scalars():
        if row.key not in EDITABLE_SETTINGS:
            logger.warning("Skipping unknown app_setting %r", row.key)
            continue
        try:
            setattr(settings, row.key, coerce(row.key, row.value))
            applied += 1
        except ValueError as e:
            logger.warning("Skipping invalid app_setting %s: %s", row.key, e)
    if applied:
        logger.info("Applied %d runtime setting overrides", applied)
    return applied


async def save_setting(db: AsyncSession, key: str, raw_value: str) -> None:
    """Validate, persist and immediately apply one setting. Caller commits."""
    if key not in EDITABLE_SETTINGS:
        raise ValueError(f"Nieznane lub niedozwolone ustawienie: {key}")
    value = coerce(key, raw_value)
    row = await db.get(AppSetting, key)
    if row:
        row.value = str(raw_value).strip()
    else:
        db.add(AppSetting(key=key, value=str(raw_value).strip()))
    setattr(settings, key, value)
