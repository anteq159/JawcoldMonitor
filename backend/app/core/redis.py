from typing import Optional
import redis.asyncio as aioredis
from app.core.config import settings

_redis: Optional[aioredis.Redis] = None


async def init_redis() -> None:
    global _redis
    _redis = await aioredis.from_url(
        settings.REDIS_URL, encoding="utf-8", decode_responses=True
    )


async def close_redis() -> None:
    global _redis
    if _redis:
        await _redis.aclose()
        _redis = None


def get_redis() -> aioredis.Redis:
    if _redis is None:
        raise RuntimeError("Redis not initialised")
    return _redis
