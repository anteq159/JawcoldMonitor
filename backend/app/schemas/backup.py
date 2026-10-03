from typing import Dict, List, Optional
from pydantic import BaseModel

# 2 (v1.38): full register definitions, per-device display settings and
# RS485 line, rule delay, RS485 lines, non-secret settings. Version-1 files
# still load - the new fields default to what the old code assumed.
BACKUP_FORMAT_VERSION = 2


class BackupRegister(BaseModel):
    address: int
    name: str
    unit: Optional[str] = None
    description: Optional[str] = None
    data_type: str = "uint16"
    scale_factor: float = 1.0
    register_type: str = "holding"
    writable: bool = False
    is_alarm_register: bool = False
    category: Optional[str] = None
    bit: Optional[int] = None


class BackupProfile(BaseModel):
    name: str
    manufacturer: Optional[str] = None
    model: Optional[str] = None
    description: Optional[str] = None
    source: str = "local"
    customized: bool = False
    registers: List[BackupRegister] = []


class BackupLine(BaseModel):
    name: str
    port: str
    baudrate: int = 19200
    parity: str = "N"
    stopbits: int = 1
    enabled: bool = True


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
    # port/baudrate/parity/stopbits/timeout from backups made before 1.25
    # are ignored - the bus settings belong to the RS485 line.
    line_name: Optional[str] = None  # natural-key reference to a BackupLine
    profile_name: Optional[str] = None  # natural-key reference to a BackupProfile
    location: Optional[str] = None
    group_name: Optional[str] = None
    description: Optional[str] = None
    poll_interval_seconds: Optional[int] = None
    hidden_parameters: List[str] = []
    parameter_aliases: Dict[str, str] = {}
    parameter_units: Dict[str, str] = {}
    card_parameters: List[str] = []
    chart_hidden_parameters: List[str] = []
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
    device_line_name: Optional[str] = None
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
    delay_seconds: int = 0


class BackupPayload(BaseModel):
    format_version: int = BACKUP_FORMAT_VERSION
    exported_at: str
    device_profiles: List[BackupProfile] = []
    lines: List[BackupLine] = []
    devices: List[BackupDevice] = []
    sensors: List[BackupSensor] = []
    alert_rules: List[BackupAlertRule] = []
    # Ustawienia/Powiadomienia values that are not secrets (passwords and
    # tokens never go into a downloadable file - re-enter them after a
    # restore on a new device).
    settings: Dict[str, str] = {}


class RestoreSummary(BaseModel):
    profiles_created: int = 0
    profiles_updated: int = 0
    devices_created: int = 0
    devices_updated: int = 0
    sensors_created: int = 0
    sensors_updated: int = 0
    rules_created: int = 0
    rules_updated: int = 0
    lines_created: int = 0
    lines_updated: int = 0
    settings_restored: int = 0
