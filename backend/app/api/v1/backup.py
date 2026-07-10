import io
import json
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import ValidationError

from app.core.database import get_db
from app.core.uploads import read_upload_limited
from app.models.user import User
from app.schemas.backup import BackupPayload, RestoreSummary
from app.services.backup import export_backup, import_backup
from app.api.deps import require_role

router = APIRouter(prefix="/backup", tags=["backup"])


@router.get("/", response_model=BackupPayload)
async def get_backup(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role("Admin")),
):
    return await export_backup(db)


@router.get("/download")
async def download_backup(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role("Admin")),
):
    payload = await export_backup(db)
    content = payload.model_dump_json(indent=2).encode()
    filename = f"jawcold-backup-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}.json"
    return StreamingResponse(
        io.BytesIO(content),
        media_type="application/json",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.post("/restore", response_model=RestoreSummary)
async def restore_backup(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role("Admin")),
):
    raw = await read_upload_limited(file, 50 * 1024 * 1024)
    try:
        data = json.loads(raw)
        payload = BackupPayload.model_validate(data)
    except (json.JSONDecodeError, ValidationError) as e:
        raise HTTPException(status_code=400, detail=f"Nieprawidłowy plik kopii zapasowej: {e}")

    return await import_backup(db, payload)
