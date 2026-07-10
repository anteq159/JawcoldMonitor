from typing import List
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.limiter import client_ip
from app.core.security import hash_password
from app.models.user import User, Role
from app.schemas.user import UserOut, UserCreate, UserUpdate
from app.api.deps import require_role
from app.services.audit import record_audit

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/", response_model=List[UserOut])
async def list_users(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role("Admin")),
):
    result = await db.execute(
        select(User).options(selectinload(User.roles).selectinload(Role.permissions)).order_by(User.username)
    )
    return result.scalars().all()


@router.post("/", response_model=UserOut, status_code=201)
async def create_user(
    request: Request,
    body: UserCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("Admin")),
):
    existing = await db.execute(select(User).where(User.username == body.username))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Nazwa użytkownika zajęta")
    user = User(
        username=body.username,
        email=body.email,
        password_hash=hash_password(body.password),
        must_change_password=True,
    )
    db.add(user)
    await db.flush()
    if body.role_ids:
        roles_res = await db.execute(select(Role).where(Role.id.in_(body.role_ids)))
        from app.models.user import user_roles
        for role in roles_res.scalars().all():
            await db.execute(
                user_roles.insert().values(user_id=user.id, role_id=role.id)
            )
    await record_audit(
        db, current_user.id, "user.create", "user", user.id,
        new_value={"username": user.username, "role_ids": body.role_ids},
        ip_address=client_ip(request),
    )
    await db.commit()
    result = await db.execute(
        select(User).options(selectinload(User.roles).selectinload(Role.permissions)).where(User.id == user.id)
    )
    return result.scalar_one()


@router.put("/{user_id}", response_model=UserOut)
async def update_user(
    request: Request,
    user_id: int,
    body: UserUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("Admin")),
):
    result = await db.execute(
        select(User).options(selectinload(User.roles).selectinload(Role.permissions)).where(User.id == user_id)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Użytkownik nie znaleziony")
    old_value = {"email": user.email, "is_active": user.is_active, "role_ids": [r.id for r in user.roles]}
    if body.email is not None:
        user.email = body.email
    if body.is_active is not None:
        user.is_active = body.is_active
    if body.must_change_password is not None:
        user.must_change_password = body.must_change_password
    if body.role_ids is not None:
        from app.models.user import user_roles
        await db.execute(user_roles.delete().where(user_roles.c.user_id == user_id))
        for rid in body.role_ids:
            await db.execute(user_roles.insert().values(user_id=user_id, role_id=rid))
    await record_audit(
        db, current_user.id, "user.update", "user", user_id,
        old_value=old_value,
        new_value={"email": body.email, "is_active": body.is_active, "role_ids": body.role_ids},
        ip_address=client_ip(request),
    )
    await db.commit()
    result = await db.execute(
        select(User).options(selectinload(User.roles).selectinload(Role.permissions)).where(User.id == user_id)
    )
    return result.scalar_one()


@router.delete("/{user_id}", status_code=204)
async def delete_user(
    request: Request,
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("Admin")),
):
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Nie można usunąć własnego konta")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Użytkownik nie znaleziony")
    await record_audit(
        db, current_user.id, "user.delete", "user", user_id,
        old_value={"username": user.username},
        ip_address=client_ip(request),
    )
    await db.delete(user)
    await db.commit()
