from typing import Optional
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.security import decode_token, password_fingerprint
from app.models.user import User, Role

bearer = HTTPBearer(auto_error=False)

# Endpoints a user with must_change_password=True may still call: exactly
# what's needed to actually change the password and render that screen.
# The frontend already redirects to /change-password, but a client talking
# to the API directly (curl, script) would otherwise bypass the forced
# change entirely - e.g. the factory admin/admin account staying usable
# forever without ever rotating the password.
_MUST_CHANGE_ALLOWED_PATHS = {
    "/api/v1/auth/change-password",
    "/api/v1/auth/me",
}


async def get_current_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
    db: AsyncSession = Depends(get_db),
) -> User:
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    payload = decode_token(credentials.credentials)
    if not payload or payload.get("type") != "access":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    # selectinload here (not at module level) to avoid triggering mapper config during import
    result = await db.execute(
        select(User)
        .options(selectinload(User.roles).selectinload(Role.permissions))
        .where(User.id == int(user_id))
    )
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")
    if payload.get("pwd") != password_fingerprint(user.password_hash):
        # Token issued before the last password change - revoked.
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token unieważniony, zaloguj się ponownie")
    if user.must_change_password and request.url.path not in _MUST_CHANGE_ALLOWED_PATHS:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Wymagana zmiana hasła przed dalszą pracą",
        )
    return user


def require_role(role_name: str):
    async def checker(current_user: User = Depends(get_current_user)) -> User:
        if not current_user.has_role(role_name) and not current_user.has_role("Admin"):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
        return current_user
    return checker


def require_permission(perm_name: str):
    async def checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.has_role("Admin"):
            return current_user
        if not current_user.has_permission(perm_name):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
        return current_user
    return checker
