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


LOGIN_ACTIONS = ("auth.login", "auth.login_failed", "auth.logout", "auth.change_password")


@router.get("/logins")
async def list_logins(
    before: Optional[datetime] = Query(None, description="Only entries older than this (paging)"),
    limit: int = Query(100, le=500),
    failed_only: bool = False,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_permission("user:manage")),
):
    """Logi > Logowania: who logged in or out, from where, and every failed
    attempt (also on accounts that do not exist). Sign-in history is
    account administration, hence user:manage."""
    from app.core.config import settings
    q = (
        select(AuditLog, User.username)
        .outerjoin(User, User.id == AuditLog.user_id)
        .where(AuditLog.action.in_(["auth.login_failed"] if failed_only else LOGIN_ACTIONS))
        .order_by(AuditLog.timestamp.desc())
        .limit(limit)
    )
    if before:
        q = q.where(AuditLog.timestamp < before)
    rows = (await db.execute(q)).all()
    items = []
    for entry, account in rows:
        extra = entry.new_value or {}
        items.append({
            "id": entry.id,
            "action": entry.action.removeprefix("auth."),
            "username": extra.get("username") or account,
            "user_exists": entry.user_id is not None,
            "reason": extra.get("reason"),
            "user_agent": extra.get("user_agent"),
            "ip_address": entry.ip_address,
            "timestamp": entry.timestamp,
        })
    return {"enabled": settings.LOG_USER_LOGINS, "items": items}


@router.put("/logins/settings")
async def set_login_logging(
    body: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("user:manage")),
):
    """The "Zapisuj logowania" switch on the Logowania tab."""
    from app.services.runtime_settings import save_setting
    enabled = bool(body.get("enabled"))
    await save_setting(db, "LOG_USER_LOGINS", "true" if enabled else "false")
    db.add(EventLog(
        event_type="settings_changed",
        user_id=current_user.id,
        message=f"{current_user.username}: zapis logowań użytkowników {'włączony' if enabled else 'wyłączony'}",
    ))
    await db.commit()
    return {"enabled": enabled}

