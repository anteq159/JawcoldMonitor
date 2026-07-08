from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List


class Settings(BaseSettings):
    PREVIEW_MODE: bool = False
    DATABASE_URL: str = "postgresql+asyncpg://jawcold:jawcold_dev_pass@postgres/jawcold"
    REDIS_URL: str = "redis://redis:6379"
    SECRET_KEY: str = "dev-secret-key-change-in-production-32chars"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_MINUTES: int = 10080  # 7 days
    RS485_PORTS: str = "/dev/ttyUSB0"
    RS485_BAUDRATE: int = 9600
    # Carel MPXpro: port supervisor pracuje na sztywno na 19200 8N2 -
    # bez 2 bitów stopu sterownik nie odpowie mimo poprawnego okablowania.
    RS485_STOPBITS: int = 1
    MODBUS_TIMEOUT: float = 0.15
    DISCOVERY_MAX_ADDRESS: int = 32
    KNOWN_SCAN_INTERVAL: int = 10
    DISCOVERY_SCAN_INTERVAL: int = 60
    DALLAS_SCAN_INTERVAL: int = 30
    PROFILE_REMOTE_URL: str = ""
    # Production panel is same-origin behind nginx (port 80); :823 is the
    # Vite dev server, which proxies /api anyway - both kept for dev use.
    ALLOWED_ORIGINS: str = "http://localhost,http://localhost:823"
    # Etap 3.4 (Raspberry Pi performance): readings accumulated to millions
    # of rows within hours of testing in this session - unbounded on a
    # real deployment's SD card that's a real problem, not a hypothetical
    # one. 0 disables pruning entirely.
    READINGS_RETENTION_DAYS: int = 90
    READINGS_PRUNE_INTERVAL_SECONDS: int = 3600

    # System alarms: device offline longer than N minutes (0 disables),
    # disk usage above N percent (0 disables).
    OFFLINE_ALARM_MINUTES: int = 5
    DISK_ALARM_PERCENT: int = 90

    # Notification channels. Empty host/token disables the channel.
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = ""
    ALERT_EMAIL_TO: str = ""  # comma-separated recipients
    TELEGRAM_BOT_TOKEN: str = ""
    TELEGRAM_CHAT_ID: str = ""
    # Which channels receive SYSTEM alarms (offline/disk/hardware):
    # comma-separated subset of: email, telegram. Threshold rules carry
    # their own per-rule notify_channels instead.
    NOTIFY_SYSTEM_CHANNELS: str = ""

    # Automatic backups: periodic JSON export (same payload as the manual
    # Ustawienia backup) written to BACKUP_DIR - point it at a mounted
    # USB stick or network share so copies live off the SD card.
    BACKUP_AUTO_ENABLED: bool = False
    BACKUP_INTERVAL_HOURS: int = 24
    BACKUP_DIR: str = "backups"
    BACKUP_RETENTION_COUNT: int = 14

    @property
    def rs485_port_list(self) -> List[str]:
        if not self.RS485_PORTS:
            return []
        return [p.strip() for p in self.RS485_PORTS.split(",") if p.strip()]

    @property
    def allowed_origins_list(self) -> List[str]:
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",") if o.strip()]

    @property
    def alert_email_to_list(self) -> List[str]:
        return [a.strip() for a in self.ALERT_EMAIL_TO.split(",") if a.strip()]

    @property
    def notify_system_channels_list(self) -> List[str]:
        return [c.strip() for c in self.NOTIFY_SYSTEM_CHANNELS.split(",") if c.strip()]

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
