from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class HardwareAlarmEventOut(BaseModel):
    id: int
    device_id: int
    code: int
    name: str
    description: Optional[str] = None
    severity: str
    active: bool
    triggered_at: datetime
    resolved_at: Optional[datetime] = None
    acknowledged: bool
    acknowledged_by: Optional[int] = None
    acknowledged_at: Optional[datetime] = None

    model_config = {"from_attributes": True}
