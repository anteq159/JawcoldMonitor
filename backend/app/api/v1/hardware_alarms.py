from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.models.hardware_alarm import HardwareAlarmEvent
from app.models.user import User
from app.schemas.hardware_alarm import HardwareAlarmEventOut
from app.api.deps import get_current_user, require_permission

router = APIRouter(prefix="/hardware-alarms", tags=["hardware-alarms"])


@router.get("/", response_model=List[HardwareAlarmEventOut])
async def list_hardware_alarms(
    active_only: bool = Query(False),
    device_id: Optional[int] = Query(None),
    limit: int = Query(100, le=500),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = select(HardwareAlarmEvent).order_by(HardwareAlarmEvent.triggered_at.desc()).limit(limit)
    if active_only:
        q = q.where(HardwareAlarmEvent.active == True)
    if device_id:
        q = q.where(HardwareAlarmEvent.device_id == device_id)
    result = await db.execute(q)
    return result.scalars().all()


@router.post("/{alarm_id}/acknowledge")
async def acknowledge_hardware_alarm(
    alarm_id: int,
    # Same permission as threshold-alert acknowledge - this only records
    # that someone in the app has seen and dealt with it, it does not
    # write anything to the controller (see model docstring).
    current_user: User = Depends(require_permission("alert:acknowledge")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(HardwareAlarmEvent).where(HardwareAlarmEvent.id == alarm_id))
    alarm = result.scalar_one_or_none()
    if not alarm:
        raise HTTPException(status_code=404, detail="Alarm nie znaleziony")
    alarm.acknowledged = True
    alarm.acknowledged_by = current_user.id
    alarm.acknowledged_at = datetime.now(timezone.utc)
    await db.commit()
    from app.websocket.manager import ws_manager
    from app.websocket import events as ws_events
    await ws_manager.broadcast(ws_events.hardware_alarm_acknowledged(alarm_id))
    return {"message": "Potwierdzone"}
