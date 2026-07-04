from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.user import Role, Permission, User
from app.schemas.role import RoleWithPermissionsOut, RoleCreate, RoleUpdate, PermissionOut
from app.api.deps import require_role

router = APIRouter(prefix="/roles", tags=["roles"])


@router.get("/", response_model=List[RoleWithPermissionsOut])
async def list_roles(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role("Admin")),
):
    result = await db.execute(select(Role).options(selectinload(Role.permissions)).order_by(Role.name))
    return result.scalars().all()


@router.get("/permissions", response_model=List[PermissionOut])
async def list_permissions(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role("Admin")),
):
    result = await db.execute(select(Permission).order_by(Permission.name))
    return result.scalars().all()


@router.post("/", response_model=RoleWithPermissionsOut, status_code=201)
async def create_role(
    body: RoleCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role("Admin")),
):
    role = Role(name=body.name, description=body.description, is_custom=True)
    if body.permission_ids:
        perms = await db.execute(select(Permission).where(Permission.id.in_(body.permission_ids)))
        role.permissions = perms.scalars().all()
    db.add(role)
    await db.commit()
    result = await db.execute(select(Role).options(selectinload(Role.permissions)).where(Role.id == role.id))
    return result.scalar_one()


@router.put("/{role_id}", response_model=RoleWithPermissionsOut)
async def update_role(
    role_id: int,
    body: RoleUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role("Admin")),
):
    result = await db.execute(select(Role).options(selectinload(Role.permissions)).where(Role.id == role_id))
    role = result.scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=404, detail="Rola nie znaleziona")
    if body.description is not None:
        role.description = body.description
    if body.permission_ids is not None:
        perms = await db.execute(select(Permission).where(Permission.id.in_(body.permission_ids)))
        role.permissions = perms.scalars().all()
    await db.commit()
    result = await db.execute(select(Role).options(selectinload(Role.permissions)).where(Role.id == role_id))
    return result.scalar_one()
