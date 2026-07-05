from typing import Literal, Optional
from pydantic import BaseModel


class FavoriteOut(BaseModel):
    device_id: int

    model_config = {"from_attributes": True}


class FavoriteParameterOut(BaseModel):
    source_type: Literal["device", "sensor"]
    source_id: int
    param_name: Optional[str] = None

    model_config = {"from_attributes": True}


class FavoriteParameterCreate(BaseModel):
    source_type: Literal["device", "sensor"]
    source_id: int
    param_name: Optional[str] = None
