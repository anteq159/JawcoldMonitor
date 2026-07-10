from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.security import (
    verify_password, hash_password, create_access_token, create_refresh_token,
    decode_token, password_fingerprint,
)
from app.core.limiter import limiter, client_ip
from app.models.user import User
from app.schemas.auth import LoginRequest, TokenResponse, RefreshRequest, ChangePasswordRequest
from app.api.deps import get_current_user
from app.services.audit import record_audit

router = APIRouter(prefix="/auth", tags=["auth"])

# Verified against when the username doesn't exist, so a failed login
# costs one bcrypt comparison either way - without this, "user not found"
# returns in microseconds while "wrong password" takes ~100ms, and that
# timing difference lets an attacker enumerate valid usernames.
_DUMMY_HASH = hash_password("jawcold-timing-equalizer")


def _token_payload(user: User) -> dict:
    return {"sub": str(user.id), "pwd": password_fingerprint(user.password_hash)}


@router.post("/login", response_model=TokenResponse)
@limiter.limit("10/minute")
async def login(request: Request, body: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.username == body.username))
    user = result.scalar_one_or_none()
    if not user:
        verify_password(body.password, _DUMMY_HASH)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Nieprawidłowy login lub hasło")
    if not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Nieprawidłowy login lub hasło")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Konto jest nieaktywne")

    user.last_login = datetime.now(timezone.utc)
    await record_audit(
        db, user.id, "auth.login", "user", user.id,
        ip_address=client_ip(request),
    )
    await db.commit()

    payload = _token_payload(user)
    access = create_access_token(payload)
    refresh = create_refresh_token(payload)
    return TokenResponse(
        access_token=access,
        refresh_token=refresh,
        must_change_password=user.must_change_password,
    )


@router.post("/refresh", response_model=TokenResponse)
@limiter.limit("30/minute")
async def refresh(request: Request, body: RefreshRequest, db: AsyncSession = Depends(get_db)):
    payload = decode_token(body.refresh_token)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")
    user_id = payload.get("sub")
    result = await db.execute(select(User).where(User.id == int(user_id)))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    if payload.get("pwd") != password_fingerprint(user.password_hash):
        # Refresh token issued before the last password change - revoked.
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token unieważniony, zaloguj się ponownie")
    p = _token_payload(user)
    return TokenResponse(
        access_token=create_access_token(p),
        refresh_token=create_refresh_token(p),
        must_change_password=user.must_change_password,
    )


@router.post("/change-password", response_model=TokenResponse)
async def change_password(
    request: Request,
    body: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not verify_password(body.current_password, current_user.password_hash):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nieprawidłowe bieżące hasło")
    if len(body.new_password) < 6:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Hasło musi mieć co najmniej 6 znaków")
    current_user.password_hash = hash_password(body.new_password)
    current_user.must_change_password = False
    await record_audit(
        db, current_user.id, "auth.change_password", "user", current_user.id,
        ip_address=client_ip(request),
    )
    await db.commit()
    # The password change just revoked every previously issued token,
    # including the one authorizing this very request - hand the client a
    # fresh pair so the session continues without a forced re-login.
    p = _token_payload(current_user)
    return TokenResponse(
        access_token=create_access_token(p),
        refresh_token=create_refresh_token(p),
        must_change_password=False,
    )


@router.get("/me")
async def me(current_user: User = Depends(get_current_user)):
    from app.schemas.user import UserOut
    return UserOut.model_validate(current_user)
