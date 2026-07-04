import csv
import io
import json
from datetime import datetime, timedelta, timezone
from typing import Optional
from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.models.reading import Reading
from app.models.user import User
from app.api.deps import get_current_user

router = APIRouter(prefix="/export", tags=["export"])

RANGE_MAP = {
    "1h": timedelta(hours=1),
    "6h": timedelta(hours=6),
    "24h": timedelta(hours=24),
    "7d": timedelta(days=7),
    "30d": timedelta(days=30),
}


@router.get("/readings")
async def export_readings(
    format: str = Query("csv", pattern="^(csv|json)$"),
    device_id: Optional[int] = None,
    sensor_id: Optional[int] = None,
    range: str = Query("24h", pattern="^(1h|6h|24h|7d|30d)$"),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    since = datetime.now(timezone.utc) - RANGE_MAP[range]
    q = select(Reading).where(Reading.timestamp >= since).order_by(Reading.timestamp)
    if device_id:
        q = q.where(Reading.device_id == device_id)
    elif sensor_id:
        q = q.where(Reading.sensor_id == sensor_id)
    result = await db.execute(q)
    rows = result.scalars().all()

    if format == "json":
        data = [
            {
                "timestamp": r.timestamp.isoformat(),
                "device_id": r.device_id,
                "sensor_id": r.sensor_id,
                "parameter": r.parameter_name,
                "value": r.value,
                "unit": r.unit,
            }
            for r in rows
        ]
        content = json.dumps(data, ensure_ascii=False, indent=2)
        return StreamingResponse(
            io.BytesIO(content.encode()),
            media_type="application/json",
            headers={"Content-Disposition": f"attachment; filename=readings_{range}.json"},
        )

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["timestamp", "device_id", "sensor_id", "parameter", "value", "unit"])
    for r in rows:
        writer.writerow([r.timestamp.isoformat(), r.device_id, r.sensor_id, r.parameter_name, r.value, r.unit])
    content = output.getvalue()
    return StreamingResponse(
        io.BytesIO(content.encode("utf-8-sig")),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=readings_{range}.csv"},
    )
