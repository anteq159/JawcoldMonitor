from datetime import datetime, timedelta, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, text

from app.core.database import get_db
from app.models.reading import Reading
from app.models.user import User
from app.schemas.reading import ReadingOut, ParameterReadings, ReadingPoint
from app.api.deps import get_current_user
from app.core import timescale

router = APIRouter(prefix="/readings", tags=["readings"])

RANGE_MAP = {
    "1h": timedelta(hours=1),
    "6h": timedelta(hours=6),
    "24h": timedelta(hours=24),
    "7d": timedelta(days=7),
    "30d": timedelta(days=30),
}


# Server-side downsampling bucket per range - at most ~720 points per series.
# One MPXPRO polled every 5 s writes ~535k rows a day; returning them raw
# meant loading millions of ORM objects for a 7d/30d chart (minutes and
# gigabytes on a Raspberry Pi) only for ECharts to draw a few hundred pixels.
# Averages per bucket; the 1h bucket matches the fastest sensible poll rate
# so that range stays effectively raw.
BUCKET_MAP = {
    "1h": timedelta(seconds=5),
    "6h": timedelta(seconds=30),
    "24h": timedelta(minutes=2),
    "7d": timedelta(minutes=15),
    "30d": timedelta(hours=1),
}
_BIN_ORIGIN = datetime(2000, 1, 1, tzinfo=timezone.utc)


# Ranges served from the TimescaleDB 15-minute continuous aggregate when it
# exists (app.core.timescale) - a few thousand pre-aggregated rows instead
# of millions of raw ones.
CAGG_RANGES = {"7d", "30d"}


async def _cagg_series(db: AsyncSession, owner_col: str, owner_id: int, range: str, params: Optional[List[str]]):
    since = datetime.now(timezone.utc) - RANGE_MAP[range]
    sql = (
        "SELECT parameter_name, time_bucket(CAST(:bucket AS interval), bucket) AS b, "
        "sum(total) / sum(n) AS value, max(unit) AS unit "
        f"FROM readings_15m WHERE {owner_col} = :owner AND bucket >= :since "
    )
    bind = {"bucket": BUCKET_MAP[range], "owner": owner_id, "since": since}
    if params:
        sql += "AND parameter_name = ANY(:params) "
        bind["params"] = params
    sql += "GROUP BY parameter_name, b ORDER BY parameter_name, b"
    result = await db.execute(text(sql), bind)
    series: dict = {}
    for name, ts, value, unit in result.all():
        entry = series.setdefault(name, [unit, []])
        if unit:
            entry[0] = unit
        entry[1].append(ReadingPoint(timestamp=ts, value=round(value, 3)))
    return series


async def _bucketed_series(db: AsyncSession, owner_filter, range: str, params: Optional[List[str]] = None):
    """{parameter_name: (unit, [ReadingPoint])} averaged into BUCKET_MAP[range]
    buckets, in time order. Selects plain columns aggregated in Postgres -
    never ORM objects."""
    if range in CAGG_RANGES and timescale.state["cagg"]:
        col = owner_filter.left.key
        return await _cagg_series(db, col, owner_filter.right.value, range, params)
    since = datetime.now(timezone.utc) - RANGE_MAP[range]
    bucket = func.date_bin(BUCKET_MAP[range], Reading.timestamp, _BIN_ORIGIN).label("bucket")
    q = (
        select(Reading.parameter_name, bucket, func.avg(Reading.value), func.max(Reading.unit))
        .where(owner_filter, Reading.timestamp >= since)
        .group_by(Reading.parameter_name, bucket)
        .order_by(Reading.parameter_name, bucket)
    )
    if params:
        q = q.where(Reading.parameter_name.in_(params))
    result = await db.execute(q)

    series: dict = {}
    for name, ts, value, unit in result.all():
        entry = series.setdefault(name, [unit, []])
        if unit:
            entry[0] = unit
        entry[1].append(ReadingPoint(timestamp=ts, value=round(value, 3)))
    return series


@router.get("/device/{device_id}", response_model=List[ParameterReadings])
async def get_device_readings(
    device_id: int,
    range: str = Query("1h", pattern="^(1h|6h|24h|7d|30d)$"),
    params: Optional[str] = Query(None, description="Comma-separated parameter names"),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    param_list = [p.strip() for p in params.split(",")] if params else None
    series = await _bucketed_series(db, Reading.device_id == device_id, range, param_list)
    # Sorted by name, not by which parameter happened to be written first:
    # the chart assigns colours by series index, so an unstable order made
    # a series change colour between time ranges.
    return [
        ParameterReadings(parameter_name=name, unit=series[name][0], readings=series[name][1])
        for name in sorted(series)
    ]


@router.get("/sensor/{sensor_id}", response_model=List[ParameterReadings])
async def get_sensor_readings(
    sensor_id: int,
    range: str = Query("24h", pattern="^(1h|6h|24h|7d|30d)$"),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    series = await _bucketed_series(db, Reading.sensor_id == sensor_id, range)
    unit, pts = series.get("Temperatura", ["°C", []])
    return [ParameterReadings(parameter_name="Temperatura", unit=unit or "°C", readings=pts)]


@router.get("/latest/device/{device_id}")
async def get_latest_device_readings(
    device_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    # DISTINCT ON, not LIMIT: a Carel MPXPRO alone has 31 registers, and
    # "newest 20 rows" returned an arbitrary, changing subset. But DISTINCT ON
    # over the device's whole history sorted every row it ever wrote - 33 s
    # and ~1 GB of temp files on the SD card at 15M rows. Every successful
    # scan cycle writes all its parameters together, so the newest hour
    # before the device's last reading holds the latest value of each one;
    # both steps are range scans on ix_readings_device_ts (~0.2 s).
    newest = await db.scalar(select(func.max(Reading.timestamp)).where(Reading.device_id == device_id))
    if newest is None:
        return {}
    result = await db.execute(
        select(Reading.parameter_name, Reading.value, Reading.unit, Reading.timestamp)
        .where(Reading.device_id == device_id, Reading.timestamp >= newest - timedelta(hours=1))
        .distinct(Reading.parameter_name)
        .order_by(Reading.parameter_name, Reading.timestamp.desc())
    )
    return {
        name: {"value": value, "unit": unit, "timestamp": ts.isoformat()}
        for name, value, unit, ts in result.all()
    }
