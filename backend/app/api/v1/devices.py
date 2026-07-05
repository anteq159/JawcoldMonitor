from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.models.device import Device
from app.models.log import EventLog
from app.models.user import User
from app.schemas.device import (
    DeviceOut, DeviceCreate, DeviceUpdate,
    RegisterWriteRequest, RegisterWriteResult, ManufacturerLookupResult,
)
from app.api.deps import get_current_user, require_permission
from app.services import scanner
from app.websocket.manager import ws_manager
from app.websocket import events as ws_events

router = APIRouter(prefix="/devices", tags=["devices"])


@router.get("/", response_model=List[DeviceOut])
async def list_devices(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(Device).order_by(Device.name))
    return result.scalars().all()


@router.get("/{device_id}", response_model=DeviceOut)
async def get_device(
    device_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(Device).where(Device.id == device_id))
    device = result.scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=404, detail="Urządzenie nie znalezione")
    return device


@router.post("/", response_model=DeviceOut, status_code=201)
async def create_device(
    body: DeviceCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_permission("device:write")),
):
    device = Device(**body.model_dump())
    db.add(device)
    await db.commit()
    await db.refresh(device)
    return device


@router.put("/{device_id}", response_model=DeviceOut)
async def update_device(
    device_id: int,
    body: DeviceUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_permission("device:write")),
):
    result = await db.execute(select(Device).where(Device.id == device_id))
    device = result.scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=404, detail="Urządzenie nie znalezione")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(device, k, v)
    if body.profile_id is not None and device.recognition_status == "unrecognized":
        # Closes the "unrecognized controller" loop: assigning a profile
        # (via manual creation in Konfiguracja, matched by detected
        # manufacturer) is how a technician resolves the flag today.
        device.recognition_status = "recognized"
    await db.commit()
    await db.refresh(device)
    return device


@router.delete("/{device_id}", status_code=204)
async def delete_device(
    device_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_permission("device:write")),
):
    result = await db.execute(select(Device).where(Device.id == device_id))
    device = result.scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=404, detail="Urządzenie nie znalezione")
    await db.delete(device)
    await db.commit()


@router.post("/{device_id}/registers/write", response_model=RegisterWriteResult)
async def write_register(
    device_id: int,
    body: RegisterWriteRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("device:write")),
):
    result = await db.execute(select(Device).where(Device.id == device_id))
    device = result.scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=404, detail="Urządzenie nie znalezione")
    if not device.profile:
        raise HTTPException(status_code=400, detail="Urządzenie nie ma przypisanego profilu z mapą rejestrów")

    register = next((r for r in device.profile.registers if r.name == body.name), None)
    if not register:
        raise HTTPException(status_code=404, detail=f"Nie znaleziono zmiennej '{body.name}' w profilu urządzenia")
    if not register.writable:
        raise HTTPException(status_code=400, detail=f"Zmienna '{body.name}' jest tylko do odczytu")

    driver = scanner.get_rs485_driver()
    if not driver:
        raise HTTPException(status_code=503, detail="Sterownik komunikacji RS485 nie jest zainicjalizowany")

    try:
        await driver.write_register(device.modbus_address, body.name, body.value)
    except NotImplementedError as e:
        raise HTTPException(status_code=501, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Błąd zapisu do urządzenia: {e}")

    db.add(EventLog(
        event_type="register_written",
        device_id=device.id,
        user_id=current_user.id,
        message=f"Zmieniono '{body.name}' na {body.value} na urządzeniu {device.name}",
    ))
    await db.commit()

    await ws_manager.broadcast(ws_events.new_reading(
        device.id, [{"parameter_name": body.name, "value": body.value, "unit": register.unit or ""}]
    ))

    return RegisterWriteResult(name=body.name, value=body.value, unit=register.unit)


@router.post("/{device_id}/lookup-manufacturer", response_model=ManufacturerLookupResult)
async def lookup_manufacturer(
    device_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("device:write")),
):
    """Simulated manufacturer-documentation lookup for an unrecognized
    controller. Deliberately does not make a live outbound request to an
    arbitrary manufacturer website: this Raspberry Pi appliance may run on
    an isolated/OT network by design, and turning free-text "manufacturer"
    strings from the wire into real HTTP requests is its own scoped,
    validated feature - not something to fake convincingly here. This
    demonstrates the intended workflow so the UI/UX can be reviewed now."""
    result = await db.execute(select(Device).where(Device.id == device_id))
    device = result.scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=404, detail="Urządzenie nie znalezione")
    if device.recognition_status != "unrecognized":
        raise HTTPException(status_code=400, detail="To urządzenie jest już rozpoznane")

    db.add(EventLog(
        event_type="manufacturer_lookup",
        device_id=device.id,
        user_id=current_user.id,
        message=f"Symulowane wyszukiwanie dokumentacji producenta dla {device.name} ({device.detected_manufacturer})",
    ))
    await db.commit()

    return ManufacturerLookupResult(
        simulated=True,
        detected_manufacturer=device.detected_manufacturer,
        message=(
            f"To jest symulacja: w wersji produkcyjnej (Etap 3) ta funkcja rozpozna sterownik "
            f"'{device.detected_manufacturer}' po jego odpowiedziach na magistrali i pobierze zweryfikowaną "
            f"mapę rejestrów z zaufanego źródła."
        ),
        suggested_next_step="Do tego czasu dodaj profil producenta ręcznie w zakładce Konfiguracja.",
    )
