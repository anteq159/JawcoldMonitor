from typing import List, Optional
from pydantic import BaseModel

BACKUP_FORMAT_VERSION = 1


class BackupRegister(BaseModel):
    address: int
    name: str
    unit: Optional[str] = None
    description: Optional[str] = None
    data_type: str = "uint16"
    scale_factor: float = 1.0


class BackupProfile(BaseModel):
    name: str
    manufacturer: Optional[str] = None
    model: Optional[str] = None
    description: Optional[str] = None
    source: str = "local"
    registers: List[BackupRegister] = []


class BackupParameter(BaseModel):
    name: str
    unit: Optional[str] = None
    description: Optional[str] = None
    register_address: int = 0
    register_type: str = "holding"
    data_type: str = "uint16"
    scale_factor: float = 1.0
    offset: float = 0.0
    threshold_min: Optional[float] = None
    threshold_max: Optional[float] = None
    enabled: bool = True


class BackupDevice(BaseModel):
    name: str
    modbus_address: int
    port: str = "/dev/ttyUSB0"
    baudrate: int = 9600
    parity: str = "N"
    stopbits: int = 1
    timeout: float = 0.15
    profile_name: Optional[str] = None  # natural-key reference to a BackupProfile
    location: Optional[str] = None
    group_name: Optional[str] = None
    description: Optional[str] = None
    parameters: List[BackupParameter] = []


class BackupSensor(BaseModel):
    rom_id: str
    name: str
    sensor_type: str = "DS18B20"
    location: Optional[str] = None
    room: Optional[str] = None
    description: Optional[str] = None
    calibration_offset: float = 0.0


class BackupAlertRule(BaseModel):
    name: str
    device_modbus_address: Optional[int] = None
    sensor_rom_id: Optional[str] = None
    parameter_name: str
    condition: str = "gt"
    threshold_value: Optional[float] = None
    threshold_min: Optional[float] = None
    threshold_max: Optional[float] = None
    severity: str = "warning"
    category: str = "Inne"
    enabled: bool = True
    notify_channels: List[str] = []


class BackupPayload(BaseModel):
    format_version: int = BACKUP_FORMAT_VERSION
    exported_at: str
    device_profiles: List[BackupProfile] = []
    devices: List[BackupDevice] = []
    sensors: List[BackupSensor] = []
    alert_rules: List[BackupAlertRule] = []


class RestoreSummary(BaseModel):
    profiles_created: int = 0
    profiles_updated: int = 0
    devices_created: int = 0
    devices_updated: int = 0
    sensors_created: int = 0
    sensors_updated: int = 0
    rules_created: int = 0
    rules_updated: int = 0
