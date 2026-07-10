from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field

from app.schemas.role import RoleWithPermissionsOut


class UserOut(BaseModel):
    id: int
    username: str
    email: Optional[str] = None
    is_active: bool
    must_change_password: bool
    created_at: datetime
    last_login: Optional[datetime] = None
    # Roles WITH their permissions so the frontend can hide actions the
    # user can't perform (the backend still enforces everything; this is
    # UX, not the security boundary).
    roles: List[RoleWithPermissionsOut] = []

    model_config = {"from_attributes": True}


class UserCreate(BaseModel):
    # Same minimum the change-password endpoint enforces - without it an
    # admin could create accounts with a 1-character password.
    username: str = Field(min_length=3, max_length=64, pattern=r"^[a-zA-Z0-9_.\-]+$")
    email: Optional[str] = None
    password: str = Field(min_length=6, max_length=128)
    role_ids: List[int] = []


class UserUpdate(BaseModel):
    email: Optional[str] = None
    is_active: Optional[bool] = None
    role_ids: Optional[List[int]] = None
    must_change_password: Optional[bool] = None
