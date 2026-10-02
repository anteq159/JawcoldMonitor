import json
import logging
from typing import Dict, Set
from fastapi import WebSocket

logger = logging.getLogger(__name__)


class WebSocketManager:
    """In-process broadcast to every connected browser. The backend runs a
    single uvicorn worker, so there is no other process to fan out to (the
    Redis pub/sub that used to sit here was removed in 1.25)."""

    def __init__(self):
        self._connections: Dict[str, WebSocket] = {}

    async def connect(self, client_id: str, ws: WebSocket) -> None:
        await ws.accept()
        self._connections[client_id] = ws
        logger.debug("WS connected: %s (total: %d)", client_id, len(self._connections))

    def disconnect(self, client_id: str) -> None:
        self._connections.pop(client_id, None)
        logger.debug("WS disconnected: %s (total: %d)", client_id, len(self._connections))

    async def broadcast(self, event: dict) -> None:
        payload = json.dumps(event)
        dead: Set[str] = set()
        for client_id, ws in list(self._connections.items()):
            try:
                await ws.send_text(payload)
            except Exception:
                dead.add(client_id)
        for client_id in dead:
            self.disconnect(client_id)


ws_manager = WebSocketManager()
