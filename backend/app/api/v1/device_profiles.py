from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.models.device_profile import DeviceProfile, RegisterDefinition
from app.models.device import Device
from app.models.user import User
from app.schemas.device_profile import DeviceProfileOut, DeviceProfileCreate, DeviceProfileUpdate
from app.api.deps import get_current_user, require_permission

router = APIRouter(prefix="/device-profiles", tags=["device-profiles"])


@router.get("/", response_model=List[DeviceProfileOut])
async def list_profiles(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(DeviceProfile).order_by(DeviceProfile.name))
    return result.scalars().all()


@router.get("/{profile_id}", response_model=DeviceProfileOut)
async def get_profile(
    profile_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(DeviceProfile).where(DeviceProfile.id == profile_id))
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Profil nie znaleziony")
    return profile


@router.post("/", response_model=DeviceProfileOut, status_code=201)
async def create_profile(
    body: DeviceProfileCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_permission("config:write")),
):
    existing = await db.execute(select(DeviceProfile).where(DeviceProfile.name == body.name))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Profil o tej nazwie już istnieje")
    profile = DeviceProfile(
        name=body.name,
        manufacturer=body.manufacturer,
        model=body.model,
        description=body.description,
        source="local",
        registers=[RegisterDefinition(**r.model_dump()) for r in body.registers],
    )
    db.add(profile)
    await db.commit()
    await db.refresh(profile)
    return profile


@router.put("/{profile_id}", response_model=DeviceProfileOut)
async def update_profile(
    profile_id: int,
    body: DeviceProfileUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_permission("config:write")),
):
    result = await db.execute(select(DeviceProfile).where(DeviceProfile.id == profile_id))
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Profil nie znaleziony")
    data = body.model_dump(exclude_unset=True, exclude={"registers"})
    for k, v in data.items():
        setattr(profile, k, v)
    if body.registers is not None:
        profile.registers = [RegisterDefinition(**r.model_dump()) for r in body.registers]
    await db.commit()
    await db.refresh(profile)
    return profile


@router.delete("/{profile_id}", status_code=204)
async def delete_profile(
    profile_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_permission("config:write")),
):
    result = await db.execute(select(DeviceProfile).where(DeviceProfile.id == profile_id))
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Profil nie znaleziony")
    in_use = await db.execute(select(Device.id).where(Device.profile_id == profile_id).limit(1))
    if in_use.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Profil jest używany przez co najmniej jedno urządzenie")
    await db.delete(profile)
    await db.commit()
