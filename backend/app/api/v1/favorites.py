from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

from app.core.database import get_db
from app.models.favorite import Favorite, FavoriteParameter
from app.models.user import User
from app.schemas.favorite import FavoriteOut, FavoriteParameterOut, FavoriteParameterCreate
from app.api.deps import get_current_user

router = APIRouter(prefix="/favorites", tags=["favorites"])

MAX_FAVORITE_PARAMETERS = 32


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


@router.get("/parameters/", response_model=List[FavoriteParameterOut])
async def list_favorite_parameters(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(FavoriteParameter).where(FavoriteParameter.user_id == current_user.id))
    return result.scalars().all()


@router.post("/parameters/", response_model=FavoriteParameterOut, status_code=201)
async def add_favorite_parameter(
    body: FavoriteParameterCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(FavoriteParameter).where(
            FavoriteParameter.user_id == current_user.id,
            FavoriteParameter.source_type == body.source_type,
            FavoriteParameter.source_id == body.source_id,
            FavoriteParameter.param_name == body.param_name,
        )
    )
    existing = result.scalar_one_or_none()
    if existing:
        return existing

    count = await db.execute(select(FavoriteParameter).where(FavoriteParameter.user_id == current_user.id))
    if len(count.scalars().all()) >= MAX_FAVORITE_PARAMETERS:
        raise HTTPException(status_code=400, detail=f"Można dodać maksymalnie {MAX_FAVORITE_PARAMETERS} ulubionych parametrów")

    fav = FavoriteParameter(
        user_id=current_user.id,
        source_type=body.source_type,
        source_id=body.source_id,
        param_name=body.param_name,
    )
    db.add(fav)
    await db.commit()
    await db.refresh(fav)
    return fav


@router.delete("/parameters/", status_code=204)
async def remove_favorite_parameter(
    source_type: str,
    source_id: int,
    param_name: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await db.execute(
        delete(FavoriteParameter).where(
            FavoriteParameter.user_id == current_user.id,
            FavoriteParameter.source_type == source_type,
            FavoriteParameter.source_id == source_id,
            FavoriteParameter.param_name == param_name,
        )
    )
    await db.commit()
