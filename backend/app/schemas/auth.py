from typing import Optional

from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    # Caps keep a hostile client from feeding megabytes into bcrypt.
    username: str = Field(max_length=64)
    password: str = Field(max_length=128)


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    must_change_password: bool = False


class RefreshRequest(BaseModel):
    refresh_token: str


class ChangePasswordRequest(BaseModel):
    # Optional only for the forced first change (must_change_password), where
    # the caller has just authenticated with the factory password and there is
    # nothing to protect by making them type it a second time. Every voluntary
    # change still requires it - see the check in the endpoint.
    current_password: Optional[str] = Field(default=None, max_length=128)
    new_password: str = Field(min_length=6, max_length=128)
