import csv
import io
import json
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.models.reading import Reading
from app.models.sensor import Sensor
from app.models.device import Device
from app.models.alert import AlertEvent
from app.models.hardware_alarm import HardwareAlarmEvent
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

# An unfiltered 30d export can cover millions of readings; materializing that
# on a 2 GB Raspberry Pi kills the container. These caps refuse the export
# with an actionable message instead of dying halfway through - never a
# silent truncation, which would look like a complete report but isn't.
# xlsx/pdf are lower because both build the whole document in memory on top
# of the rows themselves.
MAX_EXPORT_ROWS = 500_000
MAX_DOCUMENT_ROWS = 100_000


def _row_cap(format: str) -> int:
    return MAX_DOCUMENT_ROWS if format in ("xlsx", "pdf") else MAX_EXPORT_ROWS


def _too_many(count: int, cap: int, format: str) -> HTTPException:
    return HTTPException(
        status_code=400,
        detail=(
            f"Eksport obejmuje ponad {cap:,} wierszy (format {format}). "
            "Zawęź zakres czasu lub wybierz konkretne urządzenie; "
            "dla dużych zbiorów użyj formatu CSV."
        ).replace(",", " "),
    )


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
    cap = _row_cap(format)
    # Columns, not entities: a Row tuple is a fraction of the size of a
    # hydrated Reading, and nothing here needs the ORM object.
    q = (
        select(
            Reading.timestamp, Reading.device_id, Reading.sensor_id,
            Reading.parameter_name, Reading.value, Reading.unit,
        )
        .where(Reading.timestamp >= since)
        .order_by(Reading.timestamp)
        .limit(cap + 1)  # one over the cap tells us it was exceeded
    )
    if device_id:
        q = q.where(Reading.device_id == device_id)
    elif sensor_id:
        q = q.where(Reading.sensor_id == sensor_id)
    result = await db.execute(q)
    rows = result.all()
    if len(rows) > cap:
        raise _too_many(len(rows), cap, format)

    # Names instead of bare ids - "device_id 16" meant nothing to whoever
    # opened the spreadsheet.
    device_names = dict((await db.execute(select(Device.id, Device.name))).all())
    sensor_names = dict((await db.execute(select(Sensor.id, Sensor.name))).all())

    def source(dev_id, sens_id):
        if dev_id is not None:
            return device_names.get(dev_id, f"Urządzenie #{dev_id}")
        return sensor_names.get(sens_id, f"Czujnik #{sens_id}")

    if format == "json":
        data = [
            {
                "timestamp": ts.isoformat(),
                "source": source(dev_id, sens_id),
                "device_id": dev_id,
                "sensor_id": sens_id,
                "parameter": param,
                "value": value,
                "unit": unit,
            }
            for ts, dev_id, sens_id, param, value, unit in rows
        ]
        content = json.dumps(data, ensure_ascii=False, indent=2).encode()
        return _file_response(content, "application/json", f"readings_{range}.json")

    headers = ["Czas", "Urządzenie / czujnik", "Parametr", "Wartość", "Jednostka"]
    table_rows = [
        [ts.isoformat(), source(dev_id, sens_id), param, value, unit]
        for ts, dev_id, sens_id, param, value, unit in rows
    ]

    if format == "xlsx":
        content = build_xlsx(headers, table_rows, sheet_title="Odczyty")
        return _file_response(
            content,
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            f"readings_{range}.xlsx",
        )

    if format == "pdf":
        by_param: dict = defaultdict(list)
        for _ts, dev_id, sens_id, param, value, _unit in rows:
            by_param[f"{source(dev_id, sens_id)} · {param}"].append(value)
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
    cap = _row_cap(format)
    q = (
        select(AlertEvent)
        .where(AlertEvent.timestamp >= since)
        .order_by(AlertEvent.timestamp.desc())
        .limit(cap + 1)
    )
    if device_id:
        q = q.where(AlertEvent.device_id == device_id)
    if unacknowledged_only:
        q = q.where(AlertEvent.acknowledged == False)
    rule_events = (await db.execute(q)).scalars().all()

    # Controller-reported alarms (sensor faults, LO/HI, alarm relay) belong
    # in the same report - they used to be missing from it entirely.
    hq = (
        select(HardwareAlarmEvent)
        .where(HardwareAlarmEvent.triggered_at >= since)
        .order_by(HardwareAlarmEvent.triggered_at.desc())
        .limit(cap + 1)
    )
    if device_id:
        hq = hq.where(HardwareAlarmEvent.device_id == device_id)
    if unacknowledged_only:
        hq = hq.where(HardwareAlarmEvent.acknowledged == False)
    hw_events = (await db.execute(hq)).scalars().all()

    if len(rule_events) + len(hw_events) > cap:
        raise _too_many(len(rule_events) + len(hw_events), cap, format)

    device_names = dict((await db.execute(select(Device.id, Device.name))).all())
    sensor_names = dict((await db.execute(select(Sensor.id, Sensor.name))).all())
    severity_pl = {"critical": "krytyczny", "warning": "ostrzeżenie", "info": "informacja"}

    def source(dev_id, sens_id):
        if dev_id is not None:
            return device_names.get(dev_id, f"Urządzenie #{dev_id}")
        if sens_id is not None:
            return sensor_names.get(sens_id, f"Czujnik #{sens_id}")
        return ""

    events = [
        {
            "timestamp": r.timestamp, "kind": "Reguła progowa", "source": source(r.device_id, r.sensor_id),
            "severity": r.severity, "category": r.category, "message": r.message, "value": r.value,
            "acknowledged": r.acknowledged, "resolved_at": r.resolved_at,
        }
        for r in rule_events
    ] + [
        {
            "timestamp": h.triggered_at, "kind": "Alarm sterownika", "source": source(h.device_id, None),
            "severity": h.severity, "category": "Sprzęt",
            "message": f"{h.name}" + (f" — {h.description}" if h.description else ""), "value": None,
            "acknowledged": h.acknowledged, "resolved_at": h.resolved_at,
        }
        for h in hw_events
    ]
    events.sort(key=lambda e: e["timestamp"], reverse=True)

    if format == "json":
        data = [
            {**e, "timestamp": e["timestamp"].isoformat(),
             "resolved_at": e["resolved_at"].isoformat() if e["resolved_at"] else None}
            for e in events
        ]
        content = json.dumps(data, ensure_ascii=False, indent=2).encode()
        return _file_response(content, "application/json", f"alerts_{range}.json")

    headers = ["Czas", "Rodzaj", "Urządzenie / czujnik", "Ważność", "Kategoria", "Opis", "Wartość", "Potwierdzony", "Zakończony"]
    table_rows = [
        [
            e["timestamp"].isoformat(), e["kind"], e["source"], severity_pl.get(e["severity"], e["severity"]),
            e["category"], e["message"], e["value"] if e["value"] is not None else "",
            "tak" if e["acknowledged"] else "nie", e["resolved_at"].isoformat() if e["resolved_at"] else "trwa",
        ]
        for e in events
    ]
    rows = events  # for the PDF summary below

    if format == "xlsx":
        content = build_xlsx(headers, table_rows, sheet_title="Alarmy")
        return _file_response(
            content,
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            f"alerts_{range}.xlsx",
        )

    if format == "pdf":
        by_severity: dict = defaultdict(int)
        for e in rows:
            by_severity[severity_pl.get(e["severity"], e["severity"])] += 1
        unacked = sum(1 for e in rows if not e["acknowledged"])
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
