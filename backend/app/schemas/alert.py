from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel


class AlertRuleCreate(BaseModel):
    device_id: Optional[int] = None
    sensor_id: Optional[int] = None
    parameter_name: str
    name: str
    condition: str = "gt"
    threshold_value: Optional[float] = None
    threshold_min: Optional[float] = None
    threshold_max: Optional[float] = None
    severity: str = "warning"
    notify_channels: List[str] = []


class AlertRuleUpdate(BaseModel):
    name: Optional[str] = None
    enabled: Optional[bool] = None
    threshold_value: Optional[float] = None
    threshold_min: Optional[float] = None
    threshold_max: Optional[float] = None
    severity: Optional[str] = None
    notify_channels: Optional[List[str]] = None


class AlertRuleOut(BaseModel):
    id: int
    device_id: Optional[int] = None
    sensor_id: Optional[int] = None
    parameter_name: str
    name: str
    condition: str
    threshold_value: Optional[float] = None
    threshold_min: Optional[float] = None
    threshold_max: Optional[float] = None
    severity: str
    enabled: bool
    notify_channels: List[str] = []
    created_at: datetime

    model_config = {"from_attributes": True}


class AlertEventOut(BaseModel):
    id: int
    rule_id: int
    device_id: Optional[int] = None
    sensor_id: Optional[int] = None
    value: Optional[float] = None
    severity: str
    message: Optional[str] = None
    timestamp: datetime
    acknowledged: bool
    acknowledged_by: Optional[int] = None
    acknowledged_at: Optional[datetime] = None

    model_config = {"from_attributes": True}
