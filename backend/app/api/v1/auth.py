from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.security import verify_password, hash_password, create_access_token, create_refresh_token, decode_token
from app.core.limiter import limiter
from app.models.user import User
from app.schemas.auth import LoginRequest, TokenResponse, RefreshRequest, ChangePasswordRequest
from app.api.deps import get_current_user
from app.services.audit import record_audit

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
@limiter.limit("10/minute")
async def login(request: Request, body: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.username == body.username))
    user = result.scalar_one_or_none()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Nieprawidłowy login lub hasło")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Konto jest nieaktywne")

    user.last_login = datetime.now(timezone.utc)
    await record_audit(
        db, user.id, "auth.login", "user", user.id,
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()

    payload = {"sub": str(user.id)}
    access = create_access_token(payload)
    refresh = create_refresh_token(payload)
    return TokenResponse(
        access_token=access,
        refresh_token=refresh,
        must_change_password=user.must_change_password,
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh(body: RefreshRequest, db: AsyncSession = Depends(get_db)):
    payload = decode_token(body.refresh_token)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")
    user_id = payload.get("sub")
    result = await db.execute(select(User).where(User.id == int(user_id)))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    p = {"sub": str(user.id)}
    return TokenResponse(
        access_token=create_access_token(p),
        refresh_token=create_refresh_token(p),
        must_change_password=user.must_change_password,
    )


@router.post("/change-password")
async def change_password(
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
    await db.commit()
    return {"message": "Hasło zmienione"}


@router.get("/me")
async def me(current_user: User = Depends(get_current_user)):
    from app.schemas.user import UserOut
    return UserOut.model_validate(current_user)
