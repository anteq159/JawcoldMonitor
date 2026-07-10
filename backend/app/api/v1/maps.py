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
from app.core.uploads import read_upload_limited
from app.models.map import FloorMap, DevicePosition
from app.models.user import User
from app.api.deps import get_current_user, require_permission

router = APIRouter(prefix="/maps", tags=["maps"])

MAPS_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "..", "uploads", "maps")
os.makedirs(MAPS_DIR, exist_ok=True)

# Extension comes from the VALIDATED content type, never from the
# client-supplied filename - otherwise "map.html" would be written to disk
# with whatever bytes the client sent and served back to other users.
ALLOWED_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/svg+xml": ".svg",
    "image/webp": ".webp",
}
MAX_SELECTED_PARAMS = 3


def _content_matches_type(content: bytes, content_type: str) -> bool:
    """Magic-byte check: the multipart Content-Type header is entirely
    client-controlled, so verify the bytes actually are the declared image
    format before storing and re-serving them to every user."""
    if content_type == "image/png":
        return content.startswith(b"\x89PNG\r\n\x1a\n")
    if content_type == "image/jpeg":
        return content.startswith(b"\xff\xd8\xff")
    if content_type == "image/webp":
        return len(content) >= 12 and content[:4] == b"RIFF" and content[8:12] == b"WEBP"
    if content_type == "image/svg+xml":
        head = content[:2048].lstrip().lower()
        return head.startswith(b"<?xml") or head.startswith(b"<svg") or b"<svg" in head
    return False


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
    kind: str = "image"
    filename: str | None
    width: int | None
    height: int | None
    drawing: TList[dict] = []
    positions: List[PositionOut]
    model_config = {"from_attributes": True}


class SchematicCreate(BaseModel):
    name: str


MAX_DRAWING_ELEMENTS = 200
DRAWING_COLORS = {"#C23B3B", "#2B6CB0", "#C97C1B", "#7D8E8A"}  # tłoczenie/ssanie/ciecz/neutralny
SHAPE_KINDS = {"rect", "circle", "triangle", "diamond"}


def _validate_drawing(elements: TList[dict]) -> TList[dict]:
    """Server-side validation of schematic content - the drawing is stored
    verbatim as JSONB and rendered back to every user, so shape, ranges and
    sizes are enforced here rather than trusted from the editor UI."""
    if len(elements) > MAX_DRAWING_ELEMENTS:
        raise HTTPException(status_code=400, detail=f"Za dużo elementów (max {MAX_DRAWING_ELEMENTS})")

    def check_coord(v) -> float:
        if not isinstance(v, (int, float)) or not (0 <= float(v) <= 100):
            raise HTTPException(status_code=400, detail="Współrzędne muszą być w zakresie 0-100")
        return round(float(v), 2)

    clean: TList[dict] = []
    for el in elements:
        el_type = el.get("type")
        if el_type == "line":
            points = el.get("points") or []
            if not isinstance(points, list) or len(points) < 2 or len(points) > 50:
                raise HTTPException(status_code=400, detail="Linia musi mieć 2-50 punktów")
            color = el.get("color")
            if color not in DRAWING_COLORS:
                raise HTTPException(status_code=400, detail="Niedozwolony kolor linii")
            width = el.get("width")
            if width not in (2, 3, 4):
                raise HTTPException(status_code=400, detail="Grubość linii: 2, 3 lub 4")
            clean.append({
                "type": "line",
                "points": [{"x": check_coord(p.get("x")), "y": check_coord(p.get("y"))} for p in points],
                "color": color,
                "width": width,
                "arrow_end": bool(el.get("arrow_end")),
            })
        elif el_type == "label":
            text = str(el.get("text") or "").strip()
            if not text or len(text) > 64:
                raise HTTPException(status_code=400, detail="Tekst etykiety: 1-64 znaki")
            size = el.get("size") if el.get("size") in ("sm", "md") else "sm"
            clean.append({
                "type": "label",
                "x": check_coord(el.get("x")),
                "y": check_coord(el.get("y")),
                "text": text,
                "size": size,
            })
        elif el_type == "shape":
            shape = el.get("shape")
            if shape not in SHAPE_KINDS:
                raise HTTPException(status_code=400, detail=f"Nieznana figura: {shape}")
            color = el.get("color")
            if color not in DRAWING_COLORS:
                raise HTTPException(status_code=400, detail="Niedozwolony kolor figury")
            w = el.get("w")
            h = el.get("h")
            if not isinstance(w, (int, float)) or not isinstance(h, (int, float)) \
                    or not (0.5 <= float(w) <= 50) or not (0.5 <= float(h) <= 50):
                raise HTTPException(status_code=400, detail="Rozmiar figury: 0.5-50%")
            clean.append({
                "type": "shape",
                "shape": shape,
                "x": check_coord(el.get("x")),
                "y": check_coord(el.get("y")),
                "w": round(float(w), 2),
                "h": round(float(h), 2),
                "color": color,
                "filled": bool(el.get("filled")),
            })
        else:
            raise HTTPException(status_code=400, detail=f"Nieznany typ elementu: {el_type}")
    return clean


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

    content = await read_upload_limited(file, 20 * 1024 * 1024)
    if not _content_matches_type(content, file.content_type):
        raise HTTPException(status_code=400, detail="Zawartość pliku nie zgadza się z deklarowanym typem obrazu")

    filename = f"{uuid.uuid4().hex}{ALLOWED_TYPES[file.content_type]}"
    path = os.path.join(MAPS_DIR, filename)

    with open(path, "wb") as f:
        f.write(content)

    floor_map = FloorMap(name=name, filename=filename)
    db.add(floor_map)
    await db.commit()
    await db.refresh(floor_map)
    return floor_map


@router.post("/schematic", response_model=MapOut, status_code=201)
async def create_schematic(
    body: SchematicCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_permission("config:write")),
):
    """A drawn refrigeration-circuit schematic - no uploaded file, content
    is edited in the panel and stored in `drawing`. Editing requires
    config:write (Admin); every logged-in user can view it, same as image
    maps."""
    floor_map = FloorMap(name=body.name, kind="schematic", filename=None, drawing=[])
    db.add(floor_map)
    await db.commit()
    await db.refresh(floor_map)
    return floor_map


@router.put("/{map_id}/drawing", response_model=MapOut)
async def save_drawing(
    map_id: int,
    elements: TList[dict],
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_permission("config:write")),
):
    result = await db.execute(
        select(FloorMap).options(selectinload(FloorMap.positions)).where(FloorMap.id == map_id)
    )
    floor_map = result.scalar_one_or_none()
    if not floor_map:
        raise HTTPException(status_code=404, detail="Mapa nie znaleziona")
    if floor_map.kind != "schematic":
        raise HTTPException(status_code=400, detail="Rysować można tylko na schemacie, nie na mapie z obrazem")
    floor_map.drawing = _validate_drawing(elements)
    await db.commit()
    await db.refresh(floor_map)
    return floor_map


@router.get("/file/{filename}")
async def get_map_file(filename: str, _: User = Depends(get_current_user)):
    # basename + realpath containment instead of a ".." substring check:
    # belt-and-braces against any path the router lets through (encoded
    # separators, absolute paths).
    safe_name = os.path.basename(filename)
    maps_root = os.path.realpath(MAPS_DIR)
    path = os.path.realpath(os.path.join(maps_root, safe_name))
    if not path.startswith(maps_root + os.sep) or not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="Plik nie znaleziony")
    # nosniff so a browser never reinterprets a stored file as HTML/JS.
    return FileResponse(path, headers={"X-Content-Type-Options": "nosniff"})


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
    if floor_map.filename:  # schematics have no file on disk
        path = os.path.join(MAPS_DIR, floor_map.filename)
        if os.path.exists(path):
            os.remove(path)
    await db.delete(floor_map)
    await db.commit()
