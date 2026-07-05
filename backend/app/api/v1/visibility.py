from typing import List, Dict
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from pydantic import BaseModel

from app.core.database import get_db
from app.models.user import User
from app.models.visibility import UserDeviceVisibility
from app.api.deps import require_role

router = APIRouter(prefix="/users/{user_id}/visibility", tags=["visibility"])


class VisibilityEntry(BaseModel):
    device_id: int
    parameter_name: str
    visible: bool


@router.get("/", response_model=List[VisibilityEntry])
async def get_visibility(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role("Admin")),
):
    result = await db.execute(
        select(UserDeviceVisibility).where(UserDeviceVisibility.user_id == user_id)
    )
    rows = result.scalars().all()
    return [VisibilityEntry(device_id=r.device_id, parameter_name=r.parameter_name, visible=r.visible) for r in rows]


@router.put("/")
async def set_visibility(
    user_id: int,
    entries: List[VisibilityEntry],
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role("Admin")),
):
    await db.execute(
        delete(UserDeviceVisibility).where(UserDeviceVisibility.user_id == user_id)
    )
    for entry in entries:
        db.add(UserDeviceVisibility(
            user_id=user_id,
            device_id=entry.device_id,
            parameter_name=entry.parameter_name,
            visible=entry.visible,
        ))
    await db.commit()
    return {"ok": True}
