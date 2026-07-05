import logging
from collections import deque
from datetime import datetime, timezone
from typing import Deque, List

from pydantic import BaseModel


class DiagnosticEntry(BaseModel):
    timestamp: str
    level: str
    logger: str
    message: str


_buffer: Deque[DiagnosticEntry] = deque(maxlen=200)
_installed = False


class _BufferHandler(logging.Handler):
    def emit(self, record: logging.LogRecord) -> None:
        try:
            _buffer.append(DiagnosticEntry(
                timestamp=datetime.now(timezone.utc).isoformat(),
                level=record.levelname,
                logger=record.name,
                message=record.getMessage(),
            ))
        except Exception:
            pass  # a broken log record must never crash the app


def install_handler() -> None:
    """Capture WARNING+ records from the app's own loggers into an
    in-memory buffer, surfaced via /system/diagnostics. Taps into the
    logger.warning()/error() calls scanner.py and others already make -
    no changes to their exception handling needed. Idempotent so it's
    safe to call from lifespan on every restart."""
    global _installed
    if _installed:
        return
    handler = _BufferHandler()
    handler.setLevel(logging.WARNING)
    logging.getLogger("app").addHandler(handler)
    _installed = True


def get_recent(limit: int = 100) -> List[DiagnosticEntry]:
    return list(_buffer)[-limit:][::-1]
