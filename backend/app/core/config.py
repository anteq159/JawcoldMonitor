from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List


class Settings(BaseSettings):
    PREVIEW_MODE: bool = False
    DATABASE_URL: str = "postgresql+asyncpg://jawcold:jawcold_dev_pass@postgres/jawcold"
    SECRET_KEY: str = "dev-secret-key-change-in-production-32chars"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_MINUTES: int = 10080  # 7 days
    RS485_PORTS: str = "/dev/ttyUSB0"
    RS485_BAUDRATE: int = 9600
    # Carel MPXpro: port supervisor pracuje na sztywno na 19200 8N2 -
    # bez 2 bitów stopu sterownik nie odpowie mimo poprawnego okablowania.
    RS485_STOPBITS: int = 1
    # N (none) / E (even) / O (odd). Every device on the bus must match:
    # Carel MPXPRO's supervisor port is 8N2, a Schneider ATV320 ships 8E1
    # (its [Modbus format] tFO can be switched to 8N1/8N2 to share a bus).
    RS485_PARITY: str = "N"
    # 0.3 s, not 0.15: a Carel MPXPRO answering a 26-register read at
    # 19200 baud regularly took longer than 0.15 s, and the late reply was
    # then mistaken for the answer to the following request (see
    # modbus_rtu._read_span).
    MODBUS_TIMEOUT: float = 0.3
    # Merge register reads separated by up to N unmapped addresses into a
    # single Modbus request (the extra words in the gap are read and
    # discarded - one transaction's ~50-150ms round trip costs far more
    # than a few extra bytes on the wire). 0 = only strictly contiguous
    # registers are grouped. When a controller rejects a merged span the
    # driver automatically falls back to per-contiguous-block reads.
    MODBUS_BATCH_MAX_GAP: int = 8
    DISCOVERY_MAX_ADDRESS: int = 32
    KNOWN_SCAN_INTERVAL: int = 10
    # Devices currently offline are probed at most this often (seconds)
    # instead of at their normal interval - each probe of a silent address
    # holds the RS485 bus for a full timeout.
    OFFLINE_POLL_INTERVAL: int = 60
    # Every sweep pings each unused address and waits a full timeout on it -
    # once a minute that was ~10 s of every 60 s of bus time for nothing on
    # a stable installation. New controllers still appear within 5 minutes,
    # or immediately via "Skanuj" in the panel.
    DISCOVERY_SCAN_INTERVAL: int = 300
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
    # SMS through a gateway's HTTP API: "smsapi" (SMSAPI.pl, Bearer token)
    # or "twilio" (Account SID + Auth Token, sender = a Twilio number), or
    # "modem": a GSM/LTE modem plugged into the Raspberry (AT commands over
    # its USB serial port) - works without internet access.
    SMS_PROVIDER: str = "smsapi"
    SMS_MODEM_PORT: str = ""
    SMS_MODEM_BAUDRATE: int = 115200
    SMS_MODEM_PIN: str = ""
    SMS_API_TOKEN: str = ""
    SMS_ACCOUNT_SID: str = ""
    SMS_SENDER: str = ""
    SMS_TO: str = ""  # comma-separated numbers, e.g. +48600100200
    # Every SMS costs money: a runaway alarm loop must not empty the
    # account. 0 = no limit.
    SMS_DAILY_LIMIT: int = 30
    # Per-channel switches - mute a channel without deleting its settings.
    EMAIL_ENABLED: bool = True
    TELEGRAM_ENABLED: bool = True
    SMS_ENABLED: bool = True
    # Which channels receive SYSTEM alarms (offline/disk/hardware):
    # comma-separated subset of: email, telegram, sms. Threshold rules
    # carry their own per-rule notify_channels instead.
    NOTIFY_SYSTEM_CHANNELS: str = ""

    # Successful/failed logins and logouts in Logi > Logowania.
    LOG_USER_LOGINS: bool = True

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
    def telegram_chat_ids(self) -> List[str]:
        return [c.strip() for c in self.TELEGRAM_CHAT_ID.split(",") if c.strip()]

    @property
    def sms_to_list(self) -> List[str]:
        return [n.strip().replace(" ", "") for n in self.SMS_TO.split(",") if n.strip()]

    @property
    def notify_system_channels_list(self) -> List[str]:
        return [c.strip() for c in self.NOTIFY_SYSTEM_CHANNELS.split(",") if c.strip()]

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
