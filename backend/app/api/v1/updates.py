import time
from typing import Optional

import httpx
from fastapi import APIRouter, Depends

from app.core.version import get_current_version
from app.models.user import User
from app.api.deps import require_role

router = APIRouter(prefix="/system/update", tags=["update"])

# Updates run on the host (`scripts/jawcold update`): the code lives inside
# Docker images built from the repository, so there is nothing the panel
# could upload into. The panel only reports the installed and newest version.
UPDATE_COMMAND = "~/JawcoldMonitor/scripts/jawcold update"
_VERSION_URL = "https://raw.githubusercontent.com/anteq159/JawcoldMonitor/main/backend/app/VERSION"
_latest_cache: dict = {"at": 0.0, "version": None}


async def _latest_version() -> Optional[str]:
    """Newest released version (VERSION on the main branch), cached for an
    hour; None when offline - the panel then just doesn't offer anything."""
    if time.monotonic() - _latest_cache["at"] < 3600 and _latest_cache["at"]:
        return _latest_cache["version"]
    version = None
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            r = await client.get(_VERSION_URL)
            if r.status_code == 200 and len(r.text) < 32:
                version = r.text.strip()
    except Exception:
        pass
    _latest_cache.update(at=time.monotonic(), version=version)
    return version


def _newer(a: Optional[str], b: str) -> bool:
    try:
        return tuple(int(x) for x in a.split(".")) > tuple(int(x) for x in b.split("."))
    except (AttributeError, ValueError):
        return False


@router.get("/info")
async def update_info(_: User = Depends(require_role("Admin"))):
    current = get_current_version()
    latest = await _latest_version()
    return {
        "current_version": current,
        "latest_version": latest,
        "update_available": _newer(latest, current),
        "update_command": UPDATE_COMMAND,
    }
