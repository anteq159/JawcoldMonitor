from typing import Optional, List
from pydantic import BaseModel


class SystemStats(BaseModel):
    cpu_percent: float
    cpu_temp: Optional[float] = None
    ram_percent: float
    ram_used_mb: float
    ram_total_mb: float
    disk_percent: float
    disk_used_gb: float
    disk_total_gb: float
    uptime_seconds: float
    net_sent_bytes_per_sec: float = 0.0
    net_recv_bytes_per_sec: float = 0.0
    net_connected: bool = True


class ServiceStatus(BaseModel):
    name: str
    status: str  # online | offline
    detail: Optional[str] = None


class RS485PortStats(BaseModel):
    port: str
    devices_online: int
    devices_offline: int
    last_scan: Optional[str] = None
    scan_interval: int


class RS485Stats(BaseModel):
    ports: List[RS485PortStats]
    discovery_interval: int
    total_readings_today: int
