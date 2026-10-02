from typing import Optional, List
from pydantic import BaseModel, Field


class PermissionOut(BaseModel):
    id: int
    name: str
    description: Optional[str] = None

    model_config = {"from_attributes": True}


class RoleCreate(BaseModel):
    name: str = Field(min_length=1, max_length=64)
    description: Optional[str] = Field(default=None, max_length=256)
    permission_ids: List[int] = []


class RoleUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=64)
    description: Optional[str] = Field(default=None, max_length=256)
    permission_ids: Optional[List[int]] = None


class RoleOut(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    is_custom: bool = False

    model_config = {"from_attributes": True}


class RoleWithPermissionsOut(RoleOut):
    permissions: List[PermissionOut] = []
    # Filled by the Roles API only (how many accounts use the role).
    user_count: Optional[int] = None
