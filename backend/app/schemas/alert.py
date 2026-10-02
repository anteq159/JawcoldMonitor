from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field


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
    category: str = "Inne"
    notify_channels: List[str] = []
    delay_seconds: int = Field(0, ge=0, le=86400)


class AlertRuleUpdate(BaseModel):
    name: Optional[str] = None
    enabled: Optional[bool] = None
    condition: Optional[str] = None
    threshold_value: Optional[float] = None
    threshold_min: Optional[float] = None
    threshold_max: Optional[float] = None
    severity: Optional[str] = None
    category: Optional[str] = None
    notify_channels: Optional[List[str]] = None
    delay_seconds: Optional[int] = Field(None, ge=0, le=86400)


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
    category: str
    enabled: bool
    notify_channels: List[str] = []
    delay_seconds: int = 0
    created_at: datetime

    model_config = {"from_attributes": True}


class AlertEventOut(BaseModel):
    id: int
    rule_id: int
    device_id: Optional[int] = None
    sensor_id: Optional[int] = None
    value: Optional[float] = None
    severity: str
    category: str
    message: Optional[str] = None
    timestamp: datetime
    resolved_at: Optional[datetime] = None
    acknowledged: bool
    acknowledged_by: Optional[int] = None
    acknowledged_at: Optional[datetime] = None

    model_config = {"from_attributes": True}
