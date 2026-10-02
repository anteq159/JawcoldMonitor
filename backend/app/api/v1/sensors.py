from datetime import datetime, timedelta, timezone
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.models.sensor import Sensor
from app.models.reading import Reading
from app.models.user import User
from app.schemas.sensor import SensorOut, SensorUpdate
from app.api.deps import get_current_user, require_permission

router = APIRouter(prefix="/sensors", tags=["sensors"])


@router.get("/", response_model=List[SensorOut])
async def list_sensors(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(Sensor).order_by(Sensor.name))
    sensors = result.scalars().all()
    # One DISTINCT ON over the last day (index ix_readings_sensor_ts) rather
    # than a query per sensor.
    latest = await db.execute(
        select(Reading.sensor_id, Reading.value)
        .where(Reading.sensor_id.is_not(None), Reading.timestamp >= datetime.now(timezone.utc) - timedelta(days=1))
        .distinct(Reading.sensor_id)
        .order_by(Reading.sensor_id, Reading.timestamp.desc())
    )
    values = dict(latest.all())
    return [SensorOut.model_validate(s).model_copy(update={"last_value": values.get(s.id)}) for s in sensors]


@router.get("/{sensor_id}", response_model=SensorOut)
async def get_sensor(
    sensor_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(Sensor).where(Sensor.id == sensor_id))
    sensor = result.scalar_one_or_none()
    if not sensor:
        raise HTTPException(status_code=404, detail="Czujnik nie znaleziony")
    return sensor


@router.put("/{sensor_id}", response_model=SensorOut)
async def update_sensor(
    sensor_id: int,
    body: SensorUpdate,
    db: AsyncSession = Depends(get_db),
    # device:write, not just login: calibration_offset shifts every
    # recorded temperature from this sensor - a user without config:write must not
    # be able to alter measurement data.
    _: User = Depends(require_permission("device:write")),
):
    result = await db.execute(select(Sensor).where(Sensor.id == sensor_id))
    sensor = result.scalar_one_or_none()
    if not sensor:
        raise HTTPException(status_code=404, detail="Czujnik nie znaleziony")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(sensor, k, v)
    await db.commit()
    await db.refresh(sensor)
    return sensor
