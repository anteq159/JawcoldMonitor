import os
import time
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.uploads import read_upload_limited
from app.models.user import User
from app.models.log import EventLog
from app.api.deps import require_role
from app.services.update_apply import (
    get_current_version,
    get_update_meta,
    has_backup,
    apply_update,
    rollback_update,
    schedule_restart,
    UpdateError,
)

router = APIRouter(prefix="/system/update", tags=["update"])


# Since 1.22 the stack runs prebuilt/compose-built images (JAWCOLD_DEPLOY=
# image): the code lives inside the image, so a .zip written into app/
# would vanish on the next container recreate. Updates then go through
# `scripts/jawcold update` on the host; the panel only reports versions.
IMAGE_MODE = os.environ.get("JAWCOLD_DEPLOY") == "image"
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
        "mode": "image" if IMAGE_MODE else "legacy",
        "update_command": UPDATE_COMMAND,
        "last_update": None if IMAGE_MODE else get_update_meta(),
        "rollback_available": False if IMAGE_MODE else has_backup(),
    }


def _reject_in_image_mode():
    if IMAGE_MODE:
        raise HTTPException(
            status_code=400,
            detail=f"Ta instalacja aktualizuje się przez obrazy Dockera - wykonaj na Raspberry: {UPDATE_COMMAND}",
        )


@router.post("/upload")
async def upload_update(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("Admin")),
):
    _reject_in_image_mode()
    if not file.filename or not file.filename.lower().endswith(".zip"):
        raise HTTPException(status_code=400, detail="Plik musi być archiwum .zip")

    content = await read_upload_limited(file, 100 * 1024 * 1024)
    try:
        meta = apply_update(content)
    except UpdateError as e:
        raise HTTPException(status_code=400, detail=str(e))

    db.add(EventLog(
        event_type="update_applied",
        user_id=current_user.id,
        message=f"{current_user.username}: aktualizacja {meta['from_version']} → {meta['to_version']}, restart aplikacji",
    ))
    await db.commit()

    schedule_restart()
    return {"message": "Aktualizacja zainstalowana. Aplikacja restartuje się teraz.", **meta}


@router.post("/rollback")
async def rollback(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("Admin")),
):
    _reject_in_image_mode()
    try:
        meta = rollback_update()
    except UpdateError as e:
        raise HTTPException(status_code=400, detail=str(e))

    db.add(EventLog(
        event_type="update_rolled_back",
        user_id=current_user.id,
        message=f"{current_user.username}: przywrócono wersję sprzed aktualizacji ({meta['to_version']}), restart aplikacji",
    ))
    await db.commit()

    schedule_restart()
    return {"message": "Przywrócono poprzednią wersję. Aplikacja restartuje się teraz.", **meta}
