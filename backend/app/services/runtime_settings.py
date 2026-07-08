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
import os
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


# --- Ustawienia z pliku .env hosta (poziom wdrożenia, nie aplikacji) ---
# PANEL_PORT is consumed by docker compose (host port mapping of the nginx
# container), not by this process - so it can't live in app_settings and a
# setattr can't apply it. The host .env is bind-mounted into the container
# and edited in place; the change takes effect only when compose re-reads
# the file: `docker compose up -d` on the Pi (or re-running install.sh).
HOST_ENV_FILE = os.environ.get("HOST_ENV_FILE", "/app/host.env")

ENV_FILE_SETTINGS: Dict[str, SettingMeta] = {
    "PANEL_PORT": SettingMeta("Port panelu WWW (HTTP)", "Sieć", "int"),
}

ENV_FILE_HINTS: Dict[str, str] = {
    "PANEL_PORT": (
        "Zmiana zadziała po wykonaniu na Raspberry: "
        "cd ~/JawcoldMonitor && docker compose up -d "
        "(albo po ponownym uruchomieniu install.sh)."
    ),
}


def read_env_file_setting(key: str, default: str) -> str:
    """Current value of KEY in the mounted host .env; default when the
    file or the line is missing (e.g. dev without docker)."""
    try:
        with open(HOST_ENV_FILE, "r", encoding="utf-8") as f:
            for line in f:
                stripped = line.strip()
                if stripped.startswith(f"{key}="):
                    return stripped.split("=", 1)[1].strip()
    except OSError:
        pass
    return default


def write_env_file_setting(key: str, value: str) -> None:
    """Rewrite exactly one KEY=value line in the host .env, preserving
    every other line byte-for-byte (the file also holds SECRET_KEY and
    DB_PASSWORD). Appends the line when it doesn't exist yet (installs
    created before the key was introduced). Raises ValueError with a
    Polish message when the file isn't available (dev without docker)."""
    try:
        with open(HOST_ENV_FILE, "r", encoding="utf-8") as f:
            lines = f.readlines()
    except OSError:
        raise ValueError(
            f"Plik .env hosta niedostępny ({HOST_ENV_FILE}) - "
            f"{key} można zmienić tylko w instalacji Docker."
        )
    replaced = False
    for i, line in enumerate(lines):
        if line.strip().startswith(f"{key}="):
            lines[i] = f"{key}={value}\n"
            replaced = True
            break
    if not replaced:
        if lines and not lines[-1].endswith("\n"):
            lines[-1] += "\n"
        lines.append(f"{key}={value}\n")
    with open(HOST_ENV_FILE, "w", encoding="utf-8") as f:
        f.writelines(lines)


def validate_env_file_setting(key: str, raw: str) -> str:
    raw = raw.strip()
    if key == "PANEL_PORT":
        try:
            port = int(raw)
        except ValueError:
            raise ValueError(f"Nieprawidłowy port: '{raw}'")
        if not (1 <= port <= 65535):
            raise ValueError("Port panelu musi być w zakresie 1-65535")
        return str(port)
    return raw


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
        if row.key.startswith("_"):
            continue  # internal rows (e.g. _SECRET_KEY), not UI settings
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
