from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class SensorOut(BaseModel):
    id: int
    rom_id: str
    name: str
    sensor_type: str
    location: Optional[str] = None
    room: Optional[str] = None
    description: Optional[str] = None
    status: str
    calibration_offset: float = 0.0
    first_seen: Optional[datetime] = None
    last_seen: Optional[datetime] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class SensorUpdate(BaseModel):
    name: Optional[str] = None
    location: Optional[str] = None
    room: Optional[str] = None
    description: Optional[str] = None
    calibration_offset: Optional[float] = None
