"""Linie RS485: several serial ports, each with its own speed and frame.

Changes apply immediately (scanner.reload_lines rebuilds only the drivers
of lines that changed), no restart needed.
"""
import os
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_permission
from app.core.config import settings
from app.core.database import get_db
from app.models.bus_line import BusLine
from app.models.device import Device
from app.models.log import EventLog
from app.models.user import User
from app.services import scanner

router = APIRouter(prefix="/lines", tags=["lines"])

BAUDRATES = (1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200)


class LineIn(BaseModel):
    name: str = Field(min_length=1, max_length=64)
    port: str = Field(min_length=1, max_length=256)
    baudrate: int = 19200
    parity: str = "N"
    stopbits: int = 1
    enabled: bool = True


class LineUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=64)
    port: Optional[str] = Field(default=None, min_length=1, max_length=256)
    baudrate: Optional[int] = None
    parity: Optional[str] = None
    stopbits: Optional[int] = None
    enabled: Optional[bool] = None


def _line_out(line: BusLine, counts: dict) -> dict:
    online, offline = counts.get(line.id, (0, 0))
    return {
        "id": line.id,
        "name": line.name,
        "port": line.port,
        "baudrate": line.baudrate,
        "parity": line.parity,
        "stopbits": line.stopbits,
        "enabled": line.enabled,
        "frame": line.frame,
        "is_default": line.id == scanner.default_line_id(),
        "devices_online": online,
        "devices_offline": offline,
        "device_count": online + offline,
        # A missing device file = adapter unplugged or a typo in the port.
        "port_present": settings.PREVIEW_MODE or os.path.exists(line.port),
    }


async def _counts(db: AsyncSession) -> dict:
    default = scanner.default_line_id()
    rows = (await db.execute(
        select(Device.line_id, Device.status, func.count(Device.id)).group_by(Device.line_id, Device.status)
    )).all()
    counts: dict = {}
    for line_id, status, n in rows:
        lid = line_id or default
        online, offline = counts.get(lid, (0, 0))
        if status == "online":
            online += n
        else:
            offline += n
        counts[lid] = (online, offline)
    return counts


async def _validate(db: AsyncSession, data: dict, line_id: Optional[int] = None) -> dict:
    if "name" in data:
        data["name"] = data["name"].strip()
        if not data["name"]:
            raise HTTPException(status_code=400, detail="Podaj nazwę linii")
    if "port" in data:
        data["port"] = data["port"].strip()
        clash = await db.scalar(select(BusLine.name).where(BusLine.port == data["port"], BusLine.id != (line_id or 0)))
        if clash:
            raise HTTPException(status_code=400, detail=f"Ten port ma już linia „{clash}”")
        if settings.SMS_MODEM_PORT and data["port"] == settings.SMS_MODEM_PORT:
            raise HTTPException(status_code=400, detail="Ten port jest ustawiony jako modem SMS")
    if "baudrate" in data and data["baudrate"] not in BAUDRATES:
        raise HTTPException(status_code=400, detail=f"Prędkość musi być jedną z: {', '.join(map(str, BAUDRATES))}")
    if "parity" in data:
        data["parity"] = (data["parity"] or "N").upper()[:1]
        if data["parity"] not in ("N", "E", "O"):
            raise HTTPException(status_code=400, detail="Parzystość: N (brak), E (parzysta) lub O (nieparzysta)")
    if "stopbits" in data and data["stopbits"] not in (1, 2):
        raise HTTPException(status_code=400, detail="Bity stopu: 1 lub 2")
    return data


@router.get("/")
async def list_lines(db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    lines = (await db.execute(select(BusLine).order_by(BusLine.id))).scalars().all()
    counts = await _counts(db)
    return [_line_out(line, counts) for line in lines]


@router.post("/", status_code=201)
async def create_line(
    body: LineIn,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("settings:write")),
):
    data = await _validate(db, body.model_dump())
    line = BusLine(**data)
    db.add(line)
    await db.flush()
    db.add(EventLog(
        event_type="settings_changed", user_id=current_user.id,
        message=f"{current_user.username}: dodano linię RS485 „{line.name}” ({line.port}, {line.frame})",
    ))
    await db.commit()
    await scanner.reload_lines()
    return _line_out(line, await _counts(db))


@router.put("/{line_id}")
async def update_line(
    line_id: int,
    body: LineUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("settings:write")),
):
    line = await db.get(BusLine, line_id)
    if not line:
        raise HTTPException(status_code=404, detail="Linia nie znaleziona")
    data = await _validate(db, body.model_dump(exclude_none=True), line_id)
    before = f"{line.port}, {line.frame}"
    for key, value in data.items():
        setattr(line, key, value)
    db.add(EventLog(
        event_type="settings_changed", user_id=current_user.id,
        message=f"{current_user.username}: zmieniono linię RS485 „{line.name}” ({before} → {line.port}, {line.frame}"
                f"{'' if line.enabled else ', wyłączona'})",
    ))
    await db.commit()
    await scanner.reload_lines()
    return _line_out(line, await _counts(db))


@router.delete("/{line_id}", status_code=204)
async def delete_line(
    line_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("settings:write")),
):
    line = await db.get(BusLine, line_id)
    if not line:
        raise HTTPException(status_code=404, detail="Linia nie znaleziona")
    count = (await _counts(db)).get(line_id, (0, 0))
    if sum(count):
        raise HTTPException(status_code=409, detail="Na tej linii są sterowniki - najpierw przenieś je na inną linię lub usuń")
    if line_id == scanner.default_line_id() and await db.scalar(select(func.count(BusLine.id))) > 1:
        raise HTTPException(status_code=409, detail="To pierwsza linia - sterowniki bez przypisanej linii trafiają na nią")
    db.add(EventLog(
        event_type="settings_changed", user_id=current_user.id,
        message=f"{current_user.username}: usunięto linię RS485 „{line.name}” ({line.port})",
    ))
    await db.delete(line)
    await db.commit()
    await scanner.reload_lines()
