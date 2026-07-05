import csv
import io
import json
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Optional
from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.models.reading import Reading
from app.models.alert import AlertEvent
from app.models.user import User
from app.api.deps import require_permission
from app.services.report_export import build_xlsx, build_pdf

router = APIRouter(prefix="/export", tags=["export"])

RANGE_MAP = {
    "1h": timedelta(hours=1),
    "6h": timedelta(hours=6),
    "24h": timedelta(hours=24),
    "7d": timedelta(days=7),
    "30d": timedelta(days=30),
}

FORMAT_PATTERN = "^(csv|json|xlsx|pdf)$"


def _file_response(content: bytes, media_type: str, filename: str) -> StreamingResponse:
    return StreamingResponse(
        io.BytesIO(content),
        media_type=media_type,
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.get("/readings")
async def export_readings(
    format: str = Query("csv", pattern=FORMAT_PATTERN),
    device_id: Optional[int] = None,
    sensor_id: Optional[int] = None,
    range: str = Query("24h", pattern="^(1h|6h|24h|7d|30d)$"),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_permission("export:any")),
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
        content = json.dumps(data, ensure_ascii=False, indent=2).encode()
        return _file_response(content, "application/json", f"readings_{range}.json")

    headers = ["timestamp", "device_id", "sensor_id", "parameter", "value", "unit"]
    table_rows = [[r.timestamp.isoformat(), r.device_id, r.sensor_id, r.parameter_name, r.value, r.unit] for r in rows]

    if format == "xlsx":
        content = build_xlsx(headers, table_rows, sheet_title="Odczyty")
        return _file_response(
            content,
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            f"readings_{range}.xlsx",
        )

    if format == "pdf":
        by_param: dict = defaultdict(list)
        for r in rows:
            by_param[r.parameter_name].append(r.value)
        summary = [("Liczba odczytów", str(len(rows))), ("Zakres czasowy", range)]
        for name, values in by_param.items():
            summary.append((f"{name} (min / śr. / max)", f"{min(values):.2f} / {sum(values)/len(values):.2f} / {max(values):.2f}"))
        content = build_pdf(
            "Raport odczytów — JawcoldMonitor",
            f"Zakres: {range} · wygenerowano {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}",
            headers,
            table_rows,
            summary=summary,
        )
        return _file_response(content, "application/pdf", f"readings_{range}.pdf")

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(headers)
    writer.writerows(table_rows)
    return _file_response(output.getvalue().encode("utf-8-sig"), "text/csv", f"readings_{range}.csv")


@router.get("/alerts")
async def export_alerts(
    format: str = Query("csv", pattern=FORMAT_PATTERN),
    device_id: Optional[int] = None,
    unacknowledged_only: bool = Query(False),
    range: str = Query("24h", pattern="^(1h|6h|24h|7d|30d)$"),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_permission("export:any")),
):
    since = datetime.now(timezone.utc) - RANGE_MAP[range]
    q = select(AlertEvent).where(AlertEvent.timestamp >= since).order_by(AlertEvent.timestamp.desc())
    if device_id:
        q = q.where(AlertEvent.device_id == device_id)
    if unacknowledged_only:
        q = q.where(AlertEvent.acknowledged == False)
    result = await db.execute(q)
    rows = result.scalars().all()

    if format == "json":
        data = [
            {
                "timestamp": r.timestamp.isoformat(),
                "severity": r.severity,
                "category": r.category,
                "message": r.message,
                "device_id": r.device_id,
                "sensor_id": r.sensor_id,
                "value": r.value,
                "acknowledged": r.acknowledged,
                "resolved_at": r.resolved_at.isoformat() if r.resolved_at else None,
            }
            for r in rows
        ]
        content = json.dumps(data, ensure_ascii=False, indent=2).encode()
        return _file_response(content, "application/json", f"alerts_{range}.json")

    headers = ["timestamp", "severity", "category", "message", "device_id", "sensor_id", "value", "acknowledged", "resolved_at"]
    table_rows = [
        [
            r.timestamp.isoformat(), r.severity, r.category, r.message, r.device_id, r.sensor_id, r.value,
            "tak" if r.acknowledged else "nie", r.resolved_at.isoformat() if r.resolved_at else "",
        ]
        for r in rows
    ]

    if format == "xlsx":
        content = build_xlsx(headers, table_rows, sheet_title="Alarmy")
        return _file_response(
            content,
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            f"alerts_{range}.xlsx",
        )

    if format == "pdf":
        by_severity: dict = defaultdict(int)
        for r in rows:
            by_severity[r.severity] += 1
        unacked = sum(1 for r in rows if not r.acknowledged)
        summary = [("Liczba zdarzeń", str(len(rows))), ("Niepotwierdzone", str(unacked)), ("Zakres czasowy", range)]
        for sev, count in by_severity.items():
            summary.append((f"Ważność: {sev}", str(count)))
        content = build_pdf(
            "Raport alarmów — JawcoldMonitor",
            f"Zakres: {range} · wygenerowano {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}",
            headers,
            table_rows,
            summary=summary,
        )
        return _file_response(content, "application/pdf", f"alerts_{range}.pdf")

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(headers)
    writer.writerows(table_rows)
    return _file_response(output.getvalue().encode("utf-8-sig"), "text/csv", f"alerts_{range}.csv")
