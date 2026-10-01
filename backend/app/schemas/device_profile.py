from typing import Literal, Optional, List
from pydantic import BaseModel


class RegisterDefinitionOut(BaseModel):
    id: int
    position: int = 0
    address: int
    name: str
    unit: Optional[str] = None
    description: Optional[str] = None
    data_type: str
    scale_factor: float
    writable: bool = False
    is_alarm_register: bool = False
    register_type: str = "holding"
    category: Optional[str] = None

    model_config = {"from_attributes": True}


class RegisterDefinitionIn(BaseModel):
    address: int
    name: str
    unit: Optional[str] = None
    description: Optional[str] = None
    data_type: str = "uint16"
    scale_factor: float = 1.0
    writable: bool = False
    is_alarm_register: bool = False
    register_type: str = "holding"
    category: Optional[Literal["measurement", "setpoint", "parameter", "status", "alarm"]] = None


class DeviceProfileOut(BaseModel):
    id: int
    name: str
    manufacturer: Optional[str] = None
    model: Optional[str] = None
    description: Optional[str] = None
    source: str
    customized: bool = False
    registers: List[RegisterDefinitionOut] = []

    model_config = {"from_attributes": True}


class DeviceProfileCreate(BaseModel):
    name: str
    manufacturer: Optional[str] = None
    model: Optional[str] = None
    description: Optional[str] = None
    registers: List[RegisterDefinitionIn] = []


class DeviceProfileUpdate(BaseModel):
    name: Optional[str] = None
    manufacturer: Optional[str] = None
    model: Optional[str] = None
    description: Optional[str] = None
    registers: Optional[List[RegisterDefinitionIn]] = None
