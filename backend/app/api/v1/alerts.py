from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.models.alert import AlertRule, AlertEvent
from app.models.user import User
from app.schemas.alert import AlertRuleCreate, AlertRuleUpdate, AlertRuleOut, AlertEventOut
from app.api.deps import get_current_user, require_permission

router = APIRouter(prefix="/alerts", tags=["alerts"])


@router.get("/rules", response_model=List[AlertRuleOut])
async def list_rules(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(AlertRule).order_by(AlertRule.id))
    return result.scalars().all()


@router.post("/rules", response_model=AlertRuleOut, status_code=201)
async def create_rule(
    body: AlertRuleCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_permission("alert:manage")),
):
    rule = AlertRule(**body.model_dump())
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return rule


@router.put("/rules/{rule_id}", response_model=AlertRuleOut)
async def update_rule(
    rule_id: int,
    body: AlertRuleUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_permission("alert:manage")),
):
    result = await db.execute(select(AlertRule).where(AlertRule.id == rule_id))
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=404, detail="Reguła nie znaleziona")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(rule, k, v)
    await db.commit()
    await db.refresh(rule)
    return rule


@router.delete("/rules/{rule_id}", status_code=204)
async def delete_rule(
    rule_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_permission("alert:manage")),
):
    result = await db.execute(select(AlertRule).where(AlertRule.id == rule_id))
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=404, detail="Reguła nie znaleziona")
    await db.delete(rule)
    await db.commit()


@router.get("/events", response_model=List[AlertEventOut])
async def list_events(
    unacknowledged_only: bool = Query(False),
    severity: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    device_id: Optional[int] = Query(None),
    since: Optional[datetime] = Query(None),
    until: Optional[datetime] = Query(None),
    limit: int = Query(100, le=500),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = select(AlertEvent).order_by(AlertEvent.timestamp.desc()).limit(limit)
    if unacknowledged_only:
        q = q.where(AlertEvent.acknowledged == False)
    if severity:
        q = q.where(AlertEvent.severity == severity)
    if category:
        q = q.where(AlertEvent.category == category)
    if device_id:
        q = q.where(AlertEvent.device_id == device_id)
    if since:
        q = q.where(AlertEvent.timestamp >= since)
    if until:
        q = q.where(AlertEvent.timestamp <= until)
    result = await db.execute(q)
    return result.scalars().all()


@router.post("/events/{event_id}/acknowledge")
async def acknowledge_event(
    event_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(AlertEvent).where(AlertEvent.id == event_id))
    event = result.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Zdarzenie nie znalezione")
    event.acknowledged = True
    event.acknowledged_by = current_user.id
    event.acknowledged_at = datetime.now(timezone.utc)
    await db.commit()
    from app.websocket.manager import ws_manager
    from app.websocket import events as ws_events
    await ws_manager.broadcast(ws_events.alert_acknowledged(event_id))
    return {"message": "Potwierdzone"}
