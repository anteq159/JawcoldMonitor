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
    MODBUS_TIMEOUT: float = 0.15
    DISCOVERY_MAX_ADDRESS: int = 32
    KNOWN_SCAN_INTERVAL: int = 10
    DISCOVERY_SCAN_INTERVAL: int = 60
    DALLAS_SCAN_INTERVAL: int = 30
    PROFILE_REMOTE_URL: str = ""
    ALLOWED_ORIGINS: str = "http://localhost:823"
    # Etap 3.4 (Raspberry Pi performance): readings accumulated to millions
    # of rows within hours of testing in this session - unbounded on a
    # real deployment's SD card that's a real problem, not a hypothetical
    # one. 0 disables pruning entirely.
    READINGS_RETENTION_DAYS: int = 90
    READINGS_PRUNE_INTERVAL_SECONDS: int = 3600

    @property
    def rs485_port_list(self) -> List[str]:
        if not self.RS485_PORTS:
            return []
        return [p.strip() for p in self.RS485_PORTS.split(",") if p.strip()]

    @property
    def allowed_origins_list(self) -> List[str]:
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",") if o.strip()]

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
