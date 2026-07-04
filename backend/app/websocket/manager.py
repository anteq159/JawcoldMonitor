import asyncio
import json
import logging
from typing import Dict, Set
from fastapi import WebSocket
import redis.asyncio as aioredis

logger = logging.getLogger(__name__)

REDIS_CHANNEL = "ws_broadcast"


class WebSocketManager:
    def __init__(self):
        self._connections: Dict[str, WebSocket] = {}
        self._redis: aioredis.Redis | None = None
        self._listener_task: asyncio.Task | None = None

    def init_redis(self, redis_client: aioredis.Redis) -> None:
        self._redis = redis_client

    async def start_listener(self) -> None:
        self._listener_task = asyncio.create_task(self._redis_listener())

    async def stop_listener(self) -> None:
        if self._listener_task:
            self._listener_task.cancel()
            try:
                await self._listener_task
            except asyncio.CancelledError:
                pass

    async def connect(self, client_id: str, ws: WebSocket) -> None:
        await ws.accept()
        self._connections[client_id] = ws
        logger.debug("WS connected: %s (total: %d)", client_id, len(self._connections))

    def disconnect(self, client_id: str) -> None:
        self._connections.pop(client_id, None)
        logger.debug("WS disconnected: %s (total: %d)", client_id, len(self._connections))

    async def broadcast(self, event: dict) -> None:
        if self._redis:
            await self._redis.publish(REDIS_CHANNEL, json.dumps(event))
        else:
            await self._send_to_all(json.dumps(event))

    async def _redis_listener(self) -> None:
        if not self._redis:
            return
        pubsub = self._redis.pubsub()
        await pubsub.subscribe(REDIS_CHANNEL)
        try:
            async for message in pubsub.listen():
                if message["type"] == "message":
                    payload = message["data"]
                    await self._send_to_all(payload)
        except asyncio.CancelledError:
            pass
        finally:
            await pubsub.unsubscribe(REDIS_CHANNEL)
            await pubsub.aclose()

    async def _send_to_all(self, payload: str) -> None:
        dead: Set[str] = set()
        for client_id, ws in list(self._connections.items()):
            try:
                await ws.send_text(payload)
            except Exception:
                dead.add(client_id)
        for client_id in dead:
            self.disconnect(client_id)


ws_manager = WebSocketManager()
