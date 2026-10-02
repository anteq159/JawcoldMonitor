from typing import List
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.user import Role, Permission, User, user_roles
from app.schemas.role import RoleWithPermissionsOut, RoleCreate, RoleUpdate, PermissionOut
from app.api.deps import require_permission, can_grant
from app.services.audit import record_audit

router = APIRouter(prefix="/roles", tags=["roles"])


async def _role_out(db: AsyncSession, role_id: int) -> dict:
    role = (await db.execute(
        select(Role).options(selectinload(Role.permissions)).where(Role.id == role_id)
    )).scalar_one()
    count = await db.scalar(select(func.count()).select_from(user_roles).where(user_roles.c.role_id == role_id))
    return {**RoleWithPermissionsOut.model_validate(role).model_dump(), "user_count": count or 0}


async def _permissions(db: AsyncSession, ids: List[int]) -> List[Permission]:
    if not ids:
        return []
    perms = (await db.execute(select(Permission).where(Permission.id.in_(ids)))).scalars().all()
    if len(perms) != len(set(ids)):
        raise HTTPException(status_code=400, detail="Nieznane uprawnienie")
    return list(perms)


async def _check_name(db: AsyncSession, name: str, role_id: int | None = None) -> str:
    name = name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Podaj nazwę roli")
    clash = await db.scalar(select(Role.id).where(func.lower(Role.name) == name.lower()))
    if clash and clash != role_id:
        raise HTTPException(status_code=400, detail=f"Rola „{name}” już istnieje")
    return name


def _no_escalation(current_user: User, perms: List[Permission]) -> None:
    if not can_grant(current_user, [p.name for p in perms]):
        raise HTTPException(status_code=403, detail="Możesz nadać tylko uprawnienia, które sam posiadasz")


@router.get("/", response_model=List[RoleWithPermissionsOut])
async def list_roles(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_permission("user:manage")),
):
    roles = (await db.execute(select(Role).options(selectinload(Role.permissions)))).scalars().all()
    counts = dict((await db.execute(
        select(user_roles.c.role_id, func.count()).group_by(user_roles.c.role_id)
    )).all())
    # System roles first (Admin, Serwisant), then custom ones by name.
    roles = sorted(roles, key=lambda r: (r.is_custom, r.name.lower()))
    return [
        {**RoleWithPermissionsOut.model_validate(r).model_dump(), "user_count": counts.get(r.id, 0)}
        for r in roles
    ]


@router.get("/permissions", response_model=List[PermissionOut])
async def list_permissions(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_permission("user:manage")),
):
    result = await db.execute(select(Permission).order_by(Permission.id))
    return result.scalars().all()


@router.post("/", response_model=RoleWithPermissionsOut, status_code=201)
async def create_role(
    request: Request,
    body: RoleCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("user:manage")),
):
    name = await _check_name(db, body.name)
    perms = await _permissions(db, body.permission_ids)
    _no_escalation(current_user, perms)
    role = Role(name=name, description=(body.description or "").strip() or None, is_custom=True)
    role.permissions = perms
    db.add(role)
    await db.flush()
    await record_audit(
        db, current_user.id, "role.create", "role", role.id,
        new_value={"name": name, "permissions": sorted(p.name for p in perms)},
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()
    return await _role_out(db, role.id)


@router.put("/{role_id}", response_model=RoleWithPermissionsOut)
async def update_role(
    request: Request,
    role_id: int,
    body: RoleUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("user:manage")),
):
    result = await db.execute(select(Role).options(selectinload(Role.permissions)).where(Role.id == role_id))
    role = result.scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=404, detail="Rola nie znaleziona")
    if not role.is_custom:
        # System roles are re-seeded on every startup (main.DEFAULT_ROLES),
        # so an edit here would silently revert at the next restart.
        raise HTTPException(status_code=400, detail="Ról systemowych nie można edytować - utwórz kopię jako własną rolę")
    old_value = {"name": role.name, "description": role.description, "permissions": sorted(p.name for p in role.permissions)}
    # Taking permissions away is as sensitive as granting them: someone
    # without e.g. system:manage must not be able to edit a role that has it.
    _no_escalation(current_user, role.permissions)
    if body.name is not None:
        role.name = await _check_name(db, body.name, role_id)
    if body.description is not None:
        role.description = body.description.strip() or None
    if body.permission_ids is not None:
        perms = await _permissions(db, body.permission_ids)
        _no_escalation(current_user, perms)
        role.permissions = perms
    await record_audit(
        db, current_user.id, "role.update", "role", role_id,
        old_value=old_value,
        new_value={"name": role.name, "description": role.description, "permissions": sorted(p.name for p in role.permissions)},
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()
    return await _role_out(db, role_id)


@router.delete("/{role_id}", status_code=204)
async def delete_role(
    request: Request,
    role_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("user:manage")),
):
    result = await db.execute(select(Role).options(selectinload(Role.permissions)).where(Role.id == role_id))
    role = result.scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=404, detail="Rola nie znaleziona")
    if not role.is_custom:
        raise HTTPException(status_code=400, detail="Ról systemowych nie można usunąć")
    _no_escalation(current_user, role.permissions)
    users = await db.scalar(select(func.count()).select_from(user_roles).where(user_roles.c.role_id == role_id))
    if users:
        raise HTTPException(
            status_code=409,
            detail=f"Rola jest przypisana do {users} użytkownik{'a' if users == 1 else 'ów'} - najpierw zmień im rolę",
        )
    await record_audit(
        db, current_user.id, "role.delete", "role", role_id,
        old_value={"name": role.name, "permissions": sorted(p.name for p in role.permissions)},
        ip_address=request.client.host if request.client else None,
    )
    role.permissions = []
    await db.delete(role)
    await db.commit()
