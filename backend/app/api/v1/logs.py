from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.models.log import EventLog
from app.models.audit import AuditLog
from app.models.user import User
from app.schemas.log import EventLogOut, AuditLogOut
from app.api.deps import get_current_user

router = APIRouter(prefix="/logs", tags=["logs"])


@router.get("/events", response_model=List[EventLogOut])
async def list_event_logs(
    event_type: Optional[str] = None,
    device_id: Optional[int] = None,
    limit: int = Query(100, le=1000),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = select(EventLog).order_by(EventLog.timestamp.desc()).limit(limit)
    if event_type:
        q = q.where(EventLog.event_type == event_type)
    if device_id:
        q = q.where(EventLog.device_id == device_id)
    result = await db.execute(q)
    return result.scalars().all()


@router.get("/audit", response_model=List[AuditLogOut])
async def list_audit_logs(
    limit: int = Query(100, le=1000),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(
        select(AuditLog).order_by(AuditLog.timestamp.desc()).limit(limit)
    )
    return result.scalars().all()
