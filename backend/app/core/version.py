import asyncio
import os
from pathlib import Path

APP_DIR = Path(__file__).resolve().parent.parent


def get_current_version() -> str:
    version_file = APP_DIR / "VERSION"
    if version_file.exists():
        return version_file.read_text().strip()
    return "nieznana"


def schedule_restart(delay_seconds: float = 1.5):
    """Forceful self-exit rather than a graceful signal: the goal is just
    to end the process reliably so Docker's `restart: unless-stopped`
    brings up a fresh one. The delay gives the HTTP response time to
    actually reach the browser first."""
    async def _restart():
        await asyncio.sleep(delay_seconds)
        os._exit(0)
    asyncio.create_task(_restart())
