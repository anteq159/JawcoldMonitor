import asyncio
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


@router.get("/settings")
async def list_runtime_settings(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role("Admin")),
):
    """All web-editable operational settings with their CURRENT effective
    values (env bootstrap or DB override, whichever applies). Secrets are
    returned as empty strings with is_set - the UI submits a new value to
    change one and simply doesn't submit the field to keep it."""
    from app.services.runtime_settings import (
        EDITABLE_SETTINGS, ENV_FILE_SETTINGS, ENV_FILE_HINTS, read_env_file_setting,
    )
    out = []
    for key, meta in EDITABLE_SETTINGS.items():
        current = getattr(settings, key)
        out.append({
            "key": key,
            "label": meta.label,
            "category": meta.category,
            "type": meta.type,
            "value": "" if meta.secret else str(current),
            "is_set": bool(current) if meta.secret else None,
            "restart_required": meta.restart_required,
            "secret": meta.secret,
        })
    # Deploy-level values living in the host .env (docker compose reads
    # them, not this process) - shown in the same form, applied differently
    for key, meta in ENV_FILE_SETTINGS.items():
        out.append({
            "key": key,
            "label": meta.label,
            "category": meta.category,
            "type": meta.type,
            "value": read_env_file_setting(key, "80" if key == "PANEL_PORT" else ""),
            "is_set": None,
            "restart_required": False,
            "secret": False,
            "hint": ENV_FILE_HINTS.get(key),
        })
    return out


@router.put("/settings")
async def update_runtime_settings(
    body: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("Admin")),
):
    """Persist and immediately apply the submitted subset of settings.
    Body: {"values": {"KEY": "value", ...}}. Validation errors abort the
    whole batch (400) before anything is written."""
    from app.services.runtime_settings import (
        EDITABLE_SETTINGS, ENV_FILE_SETTINGS, coerce, save_setting,
        validate_env_file_setting, write_env_file_setting,
    )
    from app.models.log import EventLog
    from fastapi import HTTPException

    values = body.get("values") or {}
    # Validate everything first so a typo in one field doesn't half-apply
    for key, raw in values.items():
        if key in EDITABLE_SETTINGS:
            try:
                coerce(key, str(raw))
            except ValueError as e:
                raise HTTPException(status_code=400, detail=str(e))
        elif key in ENV_FILE_SETTINGS:
            try:
                validate_env_file_setting(key, str(raw))
            except ValueError as e:
                raise HTTPException(status_code=400, detail=str(e))
        else:
            raise HTTPException(status_code=400, detail=f"Nieznane ustawienie: {key}")

    changed = []
    for key, raw in values.items():
        if key in ENV_FILE_SETTINGS:
            # Written to the host .env, not app_settings - docker compose
            # applies it on the next `up -d`, not this process.
            try:
                write_env_file_setting(key, validate_env_file_setting(key, str(raw)))
            except ValueError as e:
                raise HTTPException(status_code=400, detail=str(e))
        else:
            await save_setting(db, key, str(raw))
        changed.append(key)
    if changed:
        db.add(EventLog(
            event_type="settings_changed",
            user_id=current_user.id,
            message=f"{current_user.username}: zmieniono ustawienia: {', '.join(sorted(changed))}",
        ))
        await db.commit()

    restart_needed = any(k in EDITABLE_SETTINGS and EDITABLE_SETTINGS[k].restart_required for k in changed)
    compose_apply_required = any(k in ENV_FILE_SETTINGS for k in changed)
    return {
        "changed": changed,
        "restart_required": restart_needed,
        "compose_apply_required": compose_apply_required,
    }


@router.post("/power/{action}")
async def power_action(
    action: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("Admin")),
):
    """Device management from the panel: restart the application, reboot
    or shut down the Raspberry. App restart reuses the update mechanism's
    self-exit (Docker's restart policy brings up a fresh process). Host
    reboot/shutdown is attempted via systemctl and reported honestly with
    501 when the environment doesn't allow it (an unprivileged container
    cannot power the host off - see README)."""
    from fastapi import HTTPException
    from app.models.log import EventLog
    from app.services.update_apply import schedule_restart

    labels = {
        "restart-app": "restart aplikacji",
        "reboot": "restart Raspberry",
        "shutdown": "wyłączenie Raspberry",
    }
    if action not in labels:
        raise HTTPException(status_code=404, detail="Nieznana akcja")

    db.add(EventLog(
        event_type="power_action",
        user_id=current_user.id,
        message=f"{current_user.username}: {labels[action]} z panelu",
    ))
    await db.commit()

    if action == "restart-app":
        schedule_restart()
        return {"message": "Aplikacja restartuje się teraz."}

    command = ["systemctl", "reboot"] if action == "reboot" else ["systemctl", "poweroff"]
    try:
        proc = await asyncio.create_subprocess_exec(
            *command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        _, stderr = await asyncio.wait_for(proc.communicate(), timeout=5)
        if proc.returncode != 0:
            raise RuntimeError(stderr.decode().strip() or f"kod wyjścia {proc.returncode}")
    except FileNotFoundError:
        raise HTTPException(
            status_code=501,
            detail=(
                f"Nie można wykonać: {labels[action]} — aplikacja działa w kontenerze "
                "bez dostępu do hosta. Zrestartuj Raspberry przez SSH (sudo reboot)."
            ),
        )
    except Exception as e:
        raise HTTPException(status_code=501, detail=f"Nie udało się: {labels[action]} — {e}")
    return {"message": f"Wykonuję: {labels[action]}…"}
