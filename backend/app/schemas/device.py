from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel
from app.schemas.device_profile import RegisterDefinitionOut


class ParameterOut(BaseModel):
    id: int
    name: str
    unit: Optional[str] = None
    description: Optional[str] = None
    register_address: int
    register_type: str
    data_type: str
    scale_factor: float
    offset: float
    threshold_min: Optional[float] = None
    threshold_max: Optional[float] = None
    enabled: bool

    model_config = {"from_attributes": True}


class ProfileOut(BaseModel):
    id: int
    name: str
    manufacturer: Optional[str] = None
    model: Optional[str] = None
    source: str = "local"
    registers: List[RegisterDefinitionOut] = []

    model_config = {"from_attributes": True}


class DeviceOut(BaseModel):
    id: int
    name: str
    modbus_address: int
    port: str
    baudrate: int
    parity: str
    stopbits: int
    timeout: float
    poll_interval_seconds: Optional[int] = None
    profile_id: Optional[int] = None
    status: str
    recognition_status: str = "recognized"
    detected_manufacturer: Optional[str] = None
    location: Optional[str] = None
    group_name: Optional[str] = None
    description: Optional[str] = None
    first_seen: Optional[datetime] = None
    last_seen: Optional[datetime] = None
    created_at: datetime
    profile: Optional[ProfileOut] = None
    parameters: List[ParameterOut] = []

    model_config = {"from_attributes": True}


class DeviceCreate(BaseModel):
    name: str
    modbus_address: int
    port: str = "/dev/ttyUSB0"
    baudrate: int = 9600
    parity: str = "N"
    stopbits: int = 1
    timeout: float = 0.15
    profile_id: Optional[int] = None
    location: Optional[str] = None
    group_name: Optional[str] = None
    description: Optional[str] = None


class DeviceUpdate(BaseModel):
    name: Optional[str] = None
    location: Optional[str] = None
    group_name: Optional[str] = None
    description: Optional[str] = None
    profile_id: Optional[int] = None
    baudrate: Optional[int] = None
    timeout: Optional[float] = None
    poll_interval_seconds: Optional[int] = None


class RegisterWriteRequest(BaseModel):
    name: str
    value: float


class RegisterWriteResult(BaseModel):
    name: str
    value: float
    unit: Optional[str] = None


class ManufacturerLookupResult(BaseModel):
    simulated: bool
    detected_manufacturer: Optional[str] = None
    message: str
    suggested_next_step: str


class DiscoveredDeviceOut(BaseModel):
    modbus_address: int
    suggested_name: str
    detected_manufacturer: Optional[str] = None
    matched_profile_id: Optional[int] = None
    matched_profile_name: Optional[str] = None
