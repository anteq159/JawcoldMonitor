from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel

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
    username: str
    email: Optional[str] = None
    password: str
    role_ids: List[int] = []


class UserUpdate(BaseModel):
    email: Optional[str] = None
    is_active: Optional[bool] = None
    role_ids: Optional[List[int]] = None
    must_change_password: Optional[bool] = None
