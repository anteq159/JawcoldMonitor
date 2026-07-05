from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.models.sensor import Sensor
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
    return result.scalars().all()


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
    # recorded temperature from this sensor - a read-only Viewer must not
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
