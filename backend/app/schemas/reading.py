from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel


class ReadingOut(BaseModel):
    id: int
    device_id: Optional[int] = None
    sensor_id: Optional[int] = None
    parameter_name: str
    value: float
    unit: Optional[str] = None
    timestamp: datetime

    model_config = {"from_attributes": True}


class ReadingPoint(BaseModel):
    timestamp: datetime
    value: float


class ParameterReadings(BaseModel):
    parameter_name: str
    unit: Optional[str] = None
    readings: List[ReadingPoint]
