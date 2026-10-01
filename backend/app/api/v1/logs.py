from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.models.log import EventLog
from app.models.audit import AuditLog
from app.models.user import User
from app.schemas.log import EventLogOut, AuditLogOut
from app.api.deps import require_permission

router = APIRouter(prefix="/logs", tags=["logs"])


@router.get("/events", response_model=List[EventLogOut])
async def list_event_logs(
    event_type: Optional[str] = None,
    device_id: Optional[int] = None,
    before: Optional[datetime] = Query(None, description="Only entries older than this (paging)"),
    limit: int = Query(100, le=1000),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_permission("log:read")),
):
    q = select(EventLog).order_by(EventLog.timestamp.desc()).limit(limit)
    if event_type:
        # Comma-separated: the panel filters by groups ("alarmy" covers
        # several event types).
        q = q.where(EventLog.event_type.in_([t for t in event_type.split(",") if t]))
    if before:
        q = q.where(EventLog.timestamp < before)
    if device_id:
        q = q.where(EventLog.device_id == device_id)
    result = await db.execute(q)
    return result.scalars().all()


@router.get("/audit", response_model=List[AuditLogOut])
async def list_audit_logs(
    limit: int = Query(100, le=1000),
    db: AsyncSession = Depends(get_db),
    # The audit trail records who did what (logins, account changes) -
    # user-administration territory, not operational logs, hence
    # user:manage rather than log:read.
    _: User = Depends(require_permission("user:manage")),
):
    result = await db.execute(
        select(AuditLog).order_by(AuditLog.timestamp.desc()).limit(limit)
    )
    return result.scalars().all()
