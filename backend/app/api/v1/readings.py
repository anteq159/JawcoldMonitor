from dataclasses import asdict
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
    "90d": timedelta(days=90),
    "1y": timedelta(days=365),
}
RANGE_PATTERN = "^(1h|6h|24h|7d|30d|90d|1y)$"


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
    "90d": timedelta(hours=6),
    "1y": timedelta(days=1),
}
_BIN_ORIGIN = datetime(2000, 1, 1, tzinfo=timezone.utc)


# Ranges served from the TimescaleDB 15-minute continuous aggregate when it
# exists (app.core.timescale) - a few thousand pre-aggregated rows instead
# of millions of raw ones.
# 90d/1y outlive READINGS_RETENTION_DAYS: the aggregate keeps its rows when
# raw day-chunks are dropped, so on TimescaleDB a year of 15-min averages
# stays available (on plain Postgres those ranges just show what raw rows
# are left).
CAGG_RANGES = {"7d", "30d", "90d", "1y"}


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
    range: str = Query("1h", pattern=RANGE_PATTERN),
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
    range: str = Query("24h", pattern=RANGE_PATTERN),
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
    return {
        name: {"value": value, "unit": unit, "timestamp": ts.isoformat()}
        for name, (value, unit, ts) in (await _latest_values(db, device_id)).items()
    }


async def _latest_values(db: AsyncSession, device_id: int) -> dict:
    newest = await db.scalar(select(func.max(Reading.timestamp)).where(Reading.device_id == device_id))
    if newest is None:
        return {}
    result = await db.execute(
        select(Reading.parameter_name, Reading.value, Reading.unit, Reading.timestamp)
        .where(Reading.device_id == device_id, Reading.timestamp >= newest - timedelta(hours=1))
        .distinct(Reading.parameter_name)
        .order_by(Reading.parameter_name, Reading.timestamp.desc())
    )
    return {name: (value, unit, ts) for name, value, unit, ts in result.all()}


@router.get("/thresholds/device/{device_id}")
async def get_device_thresholds(
    device_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Horizontal reference lines for the device chart (setpoint, effective
    alarm limits) computed by the manufacturer driver from the controller's
    current values. Empty for profiles without a driver."""
    import app.drivers.manufacturers  # noqa: F401 - registration
    from app.drivers.registry import get_driver
    from app.models.device import Device

    device = await db.get(Device, device_id)
    profile = device.profile if device else None
    driver_cls = get_driver(profile.manufacturer) if profile and profile.manufacturer else None
    if not driver_cls or not driver_cls.threshold_registers:
        return []
    by_location = {(r.register_type, r.address): r.name for r in profile.registers}
    latest = await _latest_values(db, device_id)
    values = {}
    for role, location in driver_cls.threshold_registers.items():
        name = by_location.get(location)
        if name in latest:
            values[role] = latest[name][0]
    return [asdict(t) for t in driver_cls().chart_thresholds(values)]
