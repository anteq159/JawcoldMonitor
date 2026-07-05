import glob
from datetime import datetime, timezone
from typing import List
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.core.database import get_db
from app.core.config import settings
from app.core.redis import get_redis
from app.models.user import User
from app.models.device import Device
from app.models.sensor import Sensor
from app.models.alert import AlertEvent
from app.models.reading import Reading
from app.schemas.system import SystemStats, RS485Stats, RS485PortStats, ServiceStatus
from app.services.system_stats import get_system_stats
from app.services import scanner
from app.core.diagnostics import get_recent, DiagnosticEntry
from app.api.deps import get_current_user, require_role

router = APIRouter(prefix="/system", tags=["system"])


@router.get("/stats", response_model=SystemStats)
async def system_stats(_: User = Depends(get_current_user)):
    return await get_system_stats()


@router.get("/rs485")
async def rs485_status(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    online = await db.execute(select(func.count(Device.id)).where(Device.status == "online"))
    offline = await db.execute(select(func.count(Device.id)).where(Device.status == "offline"))
    total_sensors = await db.execute(select(func.count(Sensor.id)))
    unacked_alerts = await db.execute(select(func.count(AlertEvent.id)).where(AlertEvent.acknowledged == False))
    return {
        "devices_online": online.scalar(),
        "devices_offline": offline.scalar(),
        "sensors_total": total_sensors.scalar(),
        "unacknowledged_alerts": unacked_alerts.scalar(),
        "preview_mode": settings.PREVIEW_MODE,
        "known_scan_interval": settings.KNOWN_SCAN_INTERVAL,
        "discovery_interval": settings.DISCOVERY_SCAN_INTERVAL,
    }


@router.get("/diagnostics", response_model=List[DiagnosticEntry])
async def diagnostics(
    limit: int = 100,
    _: User = Depends(require_role("Admin")),
):
    """Recent WARNING+ log records from the app's own loggers (scanner
    errors, driver failures, etc.) that previously only existed in the
    server console. Admin-only since messages can include internal detail."""
    return get_recent(limit)


@router.get("/services", response_model=List[ServiceStatus])
async def services_status(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    services: List[ServiceStatus] = []

    try:
        await db.execute(select(1))
        services.append(ServiceStatus(name="PostgreSQL", status="online"))
    except Exception as e:
        services.append(ServiceStatus(name="PostgreSQL", status="offline", detail=str(e)))

    try:
        await get_redis().ping()
        services.append(ServiceStatus(name="Redis", status="online"))
    except Exception as e:
        services.append(ServiceStatus(name="Redis", status="offline", detail=str(e)))

    last_tick = scanner.get_last_tick()
    scanner_alive = last_tick is not None and (datetime.now(timezone.utc) - last_tick).total_seconds() < 10
    services.append(ServiceStatus(
        name="Skaner RS485/Dallas",
        status="online" if scanner_alive else "offline",
        detail=None if scanner_alive else "Brak aktywności pętli skanującej",
    ))

    return services


@router.get("/ports")
async def list_serial_ports(_: User = Depends(get_current_user)):
    ports = sorted(glob.glob("/dev/ttyUSB*") + glob.glob("/dev/ttyS[0-9]*") + glob.glob("/dev/ttyAMA*"))
    if not ports:
        ports = ["/dev/ttyUSB0", "/dev/ttyUSB1", "/dev/ttyAMA0"]
    return {"ports": ports}


@router.get("/dashboard")
async def dashboard_summary(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    devices_online = (await db.execute(select(func.count(Device.id)).where(Device.status == "online"))).scalar()
    devices_offline = (await db.execute(select(func.count(Device.id)).where(Device.status == "offline"))).scalar()
    sensors_online = (await db.execute(select(func.count(Sensor.id)).where(Sensor.status == "online"))).scalar()
    alerts = (await db.execute(select(func.count(AlertEvent.id)).where(AlertEvent.acknowledged == False))).scalar()

    recent_readings = await db.execute(
        select(Reading).order_by(Reading.timestamp.desc()).limit(20)
    )
    recent = recent_readings.scalars().all()
    recent_list = [
        {
            "device_id": r.device_id,
            "sensor_id": r.sensor_id,
            "parameter_name": r.parameter_name,
            "value": r.value,
            "unit": r.unit,
            "timestamp": r.timestamp.isoformat(),
        }
        for r in recent
    ]

    system = await get_system_stats()
    return {
        "devices_online": devices_online,
        "devices_offline": devices_offline,
        "sensors_online": sensors_online,
        "active_alerts": alerts,
        "recent_readings": recent_list,
        "system": system,
    }
