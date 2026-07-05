from typing import List
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

from app.core.database import get_db
from app.models.favorite import Favorite
from app.models.user import User
from app.schemas.favorite import FavoriteOut
from app.api.deps import get_current_user

router = APIRouter(prefix="/favorites", tags=["favorites"])


@router.get("/", response_model=List[FavoriteOut])
async def list_favorites(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Favorite).where(Favorite.user_id == current_user.id))
    return result.scalars().all()


@router.post("/{device_id}", response_model=FavoriteOut, status_code=201)
async def add_favorite(
    device_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Favorite).where(Favorite.user_id == current_user.id, Favorite.device_id == device_id)
    )
    existing = result.scalar_one_or_none()
    if existing:
        return existing
    fav = Favorite(user_id=current_user.id, device_id=device_id)
    db.add(fav)
    await db.commit()
    await db.refresh(fav)
    return fav


@router.delete("/{device_id}", status_code=204)
async def remove_favorite(
    device_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await db.execute(
        delete(Favorite).where(Favorite.user_id == current_user.id, Favorite.device_id == device_id)
    )
    await db.commit()
