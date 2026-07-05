from typing import Optional, List
from pydantic import BaseModel


class PermissionOut(BaseModel):
    id: int
    name: str
    description: Optional[str] = None

    model_config = {"from_attributes": True}


class RoleCreate(BaseModel):
    name: str
    description: Optional[str] = None
    permission_ids: List[int] = []


class RoleUpdate(BaseModel):
    description: Optional[str] = None
    permission_ids: Optional[List[int]] = None


class RoleOut(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    is_custom: bool = False

    model_config = {"from_attributes": True}


class RoleWithPermissionsOut(RoleOut):
    permissions: List[PermissionOut] = []
