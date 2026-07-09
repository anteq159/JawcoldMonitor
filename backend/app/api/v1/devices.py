from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

from app.core.config import settings
from app.core.database import get_db
from app.models.device import Device
from app.models.device_profile import DeviceProfile, RegisterDefinition
from app.models.log import EventLog
from app.models.alert import AlertRule, AlertEvent
from app.models.reading import Reading
from app.models.favorite import Favorite, FavoriteParameter
from app.models.visibility import UserDeviceVisibility
from app.models.map import DevicePosition
from app.models.user import User
from app.schemas.device import (
    DeviceOut, DeviceCreate, DeviceUpdate,
    RegisterWriteRequest, RegisterWriteResult, ManufacturerLookupResult,
    DiscoveredDeviceOut,
)
from app.schemas.device_profile import RegisterDefinitionIn
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


@router.get("/discover", response_model=List[DiscoveredDeviceOut])
async def discover_devices(
    db: AsyncSession = Depends(get_db),
    # device:write, not just login: this triggers active scan traffic on
    # the RS485 bus and only exists as part of the add-device flow.
    _: User = Depends(require_permission("device:write")),
):
    """On-demand bus scan for the "Dodaj urządzenie" tab - distinct from
    the background scanner's automatic discovery (services/scanner.py
    _maybe_discovery), which already creates a Device row the moment it
    finds one. This is read-only: it reports what's on the bus but isn't
    in the devices table yet, so the user can review/name/assign a
    profile before anything is saved, rather than a row appearing with a
    placeholder name and a silently-guessed profile."""
    driver = scanner.get_rs485_driver()
    if not driver:
        return []
    result = await db.execute(select(Device.modbus_address))
    known = set(result.scalars().all())
    try:
        found_addresses = await driver.scan_range(1, settings.DISCOVERY_MAX_ADDRESS, known)
    except Exception:
        return []

    out: List[DiscoveredDeviceOut] = []
    for addr in found_addresses:
        mock_info = {}
        if hasattr(driver, "get_mock_device_info"):
            mock_info = driver.get_mock_device_info(addr)
        manufacturer = mock_info.get("manufacturer")

        matched_profile_id = None
        matched_profile_name = None
        if manufacturer:
            profile_result = await db.execute(
                select(DeviceProfile.id, DeviceProfile.name).where(DeviceProfile.manufacturer == manufacturer)
            )
            row = profile_result.first()
            if row:
                matched_profile_id, matched_profile_name = row

        out.append(DiscoveredDeviceOut(
            modbus_address=addr,
            suggested_name=mock_info.get("name", f"Urządzenie #{addr}"),
            detected_manufacturer=manufacturer,
            matched_profile_id=matched_profile_id,
            matched_profile_name=matched_profile_name,
        ))
    return out


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


@router.put("/{device_id}/registers", response_model=DeviceOut)
async def update_device_registers(
    device_id: int,
    body: List[RegisterDefinitionIn],
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_permission("device:write")),
):
    """Add/remove Modbus registers for one specific device, independent of
    every other device sharing the same profile - Konfiguracja still
    defines the full profile for a controller type, this is where a
    technician trims/extends it per physical unit (e.g. this MPXPRO has
    Sonda 6/7 wired, that one doesn't).

    A profile is never edited in place here: builtin profiles are
    re-synced from the driver code on every backend startup (see
    _init_manufacturer_profiles in main.py), so any direct edit would be
    silently wiped on the next restart; a shared "local" profile would
    otherwise mutate every other device using it. Instead this clones the
    device's current profile into a private one (source="device") the
    first time it's customized, then edits that clone in place on every
    later call."""
    result = await db.execute(select(Device).where(Device.id == device_id))
    device = result.scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=404, detail="Urządzenie nie znalezione")
    if not device.profile_id:
        raise HTTPException(status_code=400, detail="Urządzenie nie ma przypisanego profilu")

    profile_result = await db.execute(select(DeviceProfile).where(DeviceProfile.id == device.profile_id))
    profile = profile_result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Profil nie znaleziony")

    if profile.source != "device":
        other_users = await db.execute(
            select(Device.id).where(Device.profile_id == profile.id, Device.id != device.id).limit(1)
        )
        needs_clone = profile.source == "builtin" or other_users.scalar_one_or_none() is not None
        if needs_clone:
            base_name = f"{profile.name} ({device.name})"
            name = base_name
            suffix = 2
            while (await db.execute(select(DeviceProfile.id).where(DeviceProfile.name == name))).scalar_one_or_none():
                name = f"{base_name} #{suffix}"
                suffix += 1
            profile = DeviceProfile(
                name=name,
                manufacturer=profile.manufacturer,
                model=profile.model,
                description=profile.description,
                source="device",
                registers=[RegisterDefinition(
                    address=r.address, name=r.name, unit=r.unit, description=r.description,
                    data_type=r.data_type, scale_factor=r.scale_factor, writable=r.writable,
                    is_alarm_register=r.is_alarm_register, register_type=r.register_type,
                ) for r in profile.registers],
            )
            db.add(profile)
            await db.flush()
            device.profile_id = profile.id
        else:
            # Local profile only used by this device already - edit in place.
            pass

    profile.registers = [RegisterDefinition(**r.model_dump()) for r in body]
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

    # None of these FKs are ON DELETE CASCADE at the DB level, and only
    # DeviceParameter has an ORM-side cascade (via Device.parameters) -
    # deleting a device with any reading/alert/log history (i.e. almost
    # any device that's been online for more than a moment) would
    # otherwise fail with a foreign key violation. Explicit cleanup first.
    await db.execute(delete(AlertEvent).where(AlertEvent.device_id == device_id))
    await db.execute(delete(AlertRule).where(AlertRule.device_id == device_id))
    await db.execute(delete(Reading).where(Reading.device_id == device_id))
    await db.execute(delete(EventLog).where(EventLog.device_id == device_id))
    await db.execute(delete(Favorite).where(Favorite.device_id == device_id))
    await db.execute(delete(FavoriteParameter).where(
        FavoriteParameter.source_type == "device", FavoriteParameter.source_id == device_id
    ))
    await db.execute(delete(UserDeviceVisibility).where(UserDeviceVisibility.device_id == device_id))
    await db.execute(delete(DevicePosition).where(DevicePosition.device_id == device_id))

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
        await driver.write_register(
            device.modbus_address, register.address, body.name, body.value,
            data_type=register.data_type, scale_factor=register.scale_factor,
            register_type=register.register_type,
        )
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
