from pydantic import BaseModel


class FavoriteOut(BaseModel):
    device_id: int

    model_config = {"from_attributes": True}
