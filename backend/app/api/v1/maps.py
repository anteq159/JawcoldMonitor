import os
import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from typing import List as TList
from pydantic import BaseModel, field_validator

from app.core.database import get_db
from app.models.map import FloorMap, DevicePosition
from app.models.user import User
from app.api.deps import get_current_user, require_permission

router = APIRouter(prefix="/maps", tags=["maps"])

MAPS_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "..", "uploads", "maps")
os.makedirs(MAPS_DIR, exist_ok=True)

ALLOWED_TYPES = {"image/jpeg", "image/png", "image/svg+xml", "image/webp"}
MAX_SELECTED_PARAMS = 3


class PositionIn(BaseModel):
    device_id: int
    x_percent: float
    y_percent: float
    selected_params: TList[str] = []

    @field_validator("selected_params")
    @classmethod
    def _cap_selected_params(cls, v: TList[str]) -> TList[str]:
        if len(v) > MAX_SELECTED_PARAMS:
            raise ValueError(f"Można wybrać maksymalnie {MAX_SELECTED_PARAMS} parametry")
        return v


class PositionOut(BaseModel):
    id: int
    device_id: int
    x_percent: float
    y_percent: float
    selected_params: TList[str] = []
    model_config = {"from_attributes": True}


class MapOut(BaseModel):
    id: int
    name: str
    filename: str
    width: int | None
    height: int | None
    positions: List[PositionOut]
    model_config = {"from_attributes": True}


@router.get("/", response_model=List[MapOut])
async def list_maps(db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await db.execute(
        select(FloorMap).options(selectinload(FloorMap.positions)).order_by(FloorMap.id)
    )
    return result.scalars().all()


@router.post("/", response_model=MapOut, status_code=201)
async def upload_map(
    name: str = Form(...),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_permission("config:write")),
):
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail="Niedozwolony typ pliku (PNG/JPG/SVG/WEBP)")

    ext = os.path.splitext(file.filename or "map.png")[1] or ".png"
    filename = f"{uuid.uuid4().hex}{ext}"
    path = os.path.join(MAPS_DIR, filename)

    content = await file.read()
    if len(content) > 20 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Plik za duży (max 20 MB)")

    with open(path, "wb") as f:
        f.write(content)

    floor_map = FloorMap(name=name, filename=filename)
    db.add(floor_map)
    await db.commit()
    await db.refresh(floor_map)
    return floor_map


@router.get("/file/{filename}")
async def get_map_file(filename: str, _: User = Depends(get_current_user)):
    path = os.path.join(MAPS_DIR, filename)
    if not os.path.exists(path) or ".." in filename:
        raise HTTPException(status_code=404, detail="Plik nie znaleziony")
    return FileResponse(path)


@router.put("/{map_id}/positions")
async def save_positions(
    map_id: int,
    positions: List[PositionIn],
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_permission("config:write")),
):
    result = await db.execute(select(FloorMap).where(FloorMap.id == map_id))
    floor_map = result.scalar_one_or_none()
    if not floor_map:
        raise HTTPException(status_code=404, detail="Mapa nie znaleziona")

    await db.execute(
        DevicePosition.__table__.delete().where(DevicePosition.map_id == map_id)
    )
    for pos in positions:
        db.add(DevicePosition(
            map_id=map_id,
            device_id=pos.device_id,
            x_percent=pos.x_percent,
            y_percent=pos.y_percent,
            selected_params=pos.selected_params,
        ))
    await db.commit()
    result = await db.execute(
        select(FloorMap).options(selectinload(FloorMap.positions)).where(FloorMap.id == map_id)
    )
    return result.scalar_one()


@router.delete("/{map_id}", status_code=204)
async def delete_map(
    map_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_permission("config:write")),
):
    result = await db.execute(select(FloorMap).where(FloorMap.id == map_id))
    floor_map = result.scalar_one_or_none()
    if not floor_map:
        raise HTTPException(status_code=404, detail="Mapa nie znaleziona")
    path = os.path.join(MAPS_DIR, floor_map.filename)
    if os.path.exists(path):
        os.remove(path)
    await db.delete(floor_map)
    await db.commit()
