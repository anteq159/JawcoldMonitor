from datetime import datetime, timedelta, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.models.reading import Reading
from app.models.user import User
from app.schemas.reading import ReadingOut, ParameterReadings, ReadingPoint
from app.api.deps import get_current_user

router = APIRouter(prefix="/readings", tags=["readings"])

RANGE_MAP = {
    "1h": timedelta(hours=1),
    "6h": timedelta(hours=6),
    "24h": timedelta(hours=24),
    "7d": timedelta(days=7),
    "30d": timedelta(days=30),
}


@router.get("/device/{device_id}", response_model=List[ParameterReadings])
async def get_device_readings(
    device_id: int,
    range: str = Query("1h", pattern="^(1h|6h|24h|7d|30d)$"),
    params: Optional[str] = Query(None, description="Comma-separated parameter names"),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    since = datetime.now(timezone.utc) - RANGE_MAP[range]
    q = select(Reading).where(
        Reading.device_id == device_id,
        Reading.timestamp >= since,
    ).order_by(Reading.timestamp)
    if params:
        param_list = [p.strip() for p in params.split(",")]
        q = q.where(Reading.parameter_name.in_(param_list))
    result = await db.execute(q)
    rows = result.scalars().all()

    grouped: dict = {}
    units: dict = {}
    for r in rows:
        grouped.setdefault(r.parameter_name, []).append(ReadingPoint(timestamp=r.timestamp, value=r.value))
        units[r.parameter_name] = r.unit

    return [
        ParameterReadings(parameter_name=name, unit=units.get(name), readings=pts)
        for name, pts in grouped.items()
    ]


@router.get("/sensor/{sensor_id}", response_model=List[ParameterReadings])
async def get_sensor_readings(
    sensor_id: int,
    range: str = Query("24h", pattern="^(1h|6h|24h|7d|30d)$"),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    since = datetime.now(timezone.utc) - RANGE_MAP[range]
    result = await db.execute(
        select(Reading)
        .where(Reading.sensor_id == sensor_id, Reading.timestamp >= since)
        .order_by(Reading.timestamp)
    )
    rows = result.scalars().all()
    pts = [ReadingPoint(timestamp=r.timestamp, value=r.value) for r in rows]
    unit = rows[0].unit if rows else "°C"
    return [ParameterReadings(parameter_name="Temperatura", unit=unit, readings=pts)]


@router.get("/latest/device/{device_id}")
async def get_latest_device_readings(
    device_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Reading)
        .where(Reading.device_id == device_id)
        .order_by(Reading.timestamp.desc())
        .limit(20)
    )
    rows = result.scalars().all()
    latest = {}
    for r in rows:
        if r.parameter_name not in latest:
            latest[r.parameter_name] = {"value": r.value, "unit": r.unit, "timestamp": r.timestamp.isoformat()}
    return latest
