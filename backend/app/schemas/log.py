from datetime import datetime
from typing import Optional, Any
from pydantic import BaseModel


class EventLogOut(BaseModel):
    id: int
    event_type: str
    device_id: Optional[int] = None
    sensor_id: Optional[int] = None
    user_id: Optional[int] = None
    message: Optional[str] = None
    metadata_: Optional[Any] = None
    timestamp: datetime

    model_config = {"from_attributes": True}


class AuditLogOut(BaseModel):
    id: int
    user_id: Optional[int] = None
    action: str
    resource_type: Optional[str] = None
    resource_id: Optional[int] = None
    old_value: Optional[Any] = None
    new_value: Optional[Any] = None
    ip_address: Optional[str] = None
    timestamp: datetime

    model_config = {"from_attributes": True}
