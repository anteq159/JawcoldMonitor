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


@router.get("/info")
async def update_info(_: User = Depends(require_role("Admin"))):
    return {
        "current_version": get_current_version(),
        "last_update": get_update_meta(),
        "rollback_available": has_backup(),
    }


@router.post("/upload")
async def upload_update(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("Admin")),
):
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
