from typing import Optional
import redis.asyncio as aioredis
from app.core.config import settings

_redis: Optional[aioredis.Redis] = None


async def init_redis() -> None:
    """Redis is optional: it only fans WebSocket broadcasts out across
    several backend processes, and the backend runs a single uvicorn
    worker - without REDIS_URL the manager broadcasts in-process."""
    global _redis
    if not settings.REDIS_URL:
        return
    _redis = await aioredis.from_url(
        settings.REDIS_URL, encoding="utf-8", decode_responses=True
    )


async def close_redis() -> None:
    global _redis
    if _redis:
        await _redis.aclose()
        _redis = None


def get_redis() -> Optional[aioredis.Redis]:
    return _redis
