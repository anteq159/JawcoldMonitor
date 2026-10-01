"""TimescaleDB for the readings table.

One MPXPRO polled every 5 s writes ~535k rows a day; plain Postgres kept
every row uncompressed (3.3 GB after 3 months for one controller) and the
7d/30d charts had to aggregate millions of rows per request. With
TimescaleDB:

- readings is a hypertable chunked per day, so pruning old history drops
  whole chunks instead of DELETE-ing (and vacuuming) millions of rows,
- chunks older than COMPRESS_AFTER are compressed (typically 10-20x
  smaller on the SD card),
- readings_15m is a continuous aggregate (sum/count/min/max per 15 min)
  that the long chart ranges read instead of raw rows. It is kept when raw
  chunks are dropped, so long-term trends outlive READINGS_RETENTION_DAYS.

Applied by ensure_timescale() at startup rather than as an Alembic
migration: it depends on which Postgres image the installation runs, not
on the schema revision. An install still on plain postgres:16 (or a
backend-only update package applied to one) simply keeps working the old
way, and converts automatically the first time it starts on the
timescaledb image. Every step is idempotent.
"""

import asyncio
import logging

from sqlalchemy import text

from app.core.database import engine

logger = logging.getLogger(__name__)

COMPRESS_AFTER = "2 days"
CAGG = "readings_15m"

# Set by ensure_timescale(); read by the readings API and the pruning job.
state = {"hypertable": False, "cagg": False}


async def _scalar(conn, sql: str, **params):
    return (await conn.execute(text(sql), params)).scalar()


async def ensure_timescale() -> None:
    async with engine.connect() as conn:
        conn = await conn.execution_options(isolation_level="AUTOCOMMIT")
        preload = await _scalar(conn, "SHOW shared_preload_libraries")
        if "timescaledb" not in (preload or ""):
            logger.info("TimescaleDB niedostępny (obraz postgres bez rozszerzenia) - zwykła tabela odczytów")
            return
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS timescaledb"))

        is_hyper = await _scalar(
            conn,
            "SELECT count(*) FROM timescaledb_information.hypertables WHERE hypertable_name = 'readings'",
        )
        if not is_hyper:
            # reltuples is -1 for a never-analyzed (fresh, empty) table.
            rows = await _scalar(conn, "SELECT reltuples::bigint FROM pg_class WHERE relname = 'readings'")
            if rows and rows > 0:
                logger.warning(
                    "Konwersja historii odczytów do TimescaleDB (~%s wierszy) - jednorazowo, może potrwać kilka minut",
                    rows,
                )
            # A hypertable's unique constraints must include the time
            # column; nothing looks readings up by id, so the primary key
            # index (one more write per inserted reading) just goes.
            await conn.execute(text("ALTER TABLE readings DROP CONSTRAINT IF EXISTS readings_pkey"))
            await conn.execute(text(
                "SELECT create_hypertable('readings', by_range('timestamp', INTERVAL '1 day'), "
                "create_default_indexes => false, migrate_data => true)"
            ))
            logger.info("Tabela odczytów przekonwertowana do TimescaleDB")
        state["hypertable"] = True

        compressed = await _scalar(
            conn,
            "SELECT compression_enabled FROM timescaledb_information.hypertables WHERE hypertable_name = 'readings'",
        )
        if not compressed:
            await conn.execute(text(
                "ALTER TABLE readings SET (timescaledb.compress, "
                "timescaledb.compress_segmentby = 'device_id, sensor_id, parameter_name', "
                "timescaledb.compress_orderby = 'timestamp DESC')"
            ))
        await conn.execute(text(
            f"SELECT add_compression_policy('readings', INTERVAL '{COMPRESS_AFTER}', if_not_exists => true)"
        ))

        has_cagg = await _scalar(
            conn,
            "SELECT count(*) FROM timescaledb_information.continuous_aggregates WHERE view_name = :v",
            v=CAGG,
        )
        if not has_cagg:
            # sum + count rather than avg, so re-bucketing to 1 h for the
            # 30-day chart stays a correctly weighted average.
            await conn.execute(text(f"""
                CREATE MATERIALIZED VIEW {CAGG}
                WITH (timescaledb.continuous, timescaledb.materialized_only = false) AS
                SELECT device_id, sensor_id, parameter_name,
                       time_bucket(INTERVAL '15 minutes', "timestamp") AS bucket,
                       sum(value) AS total, count(*) AS n,
                       min(value) AS min_value, max(value) AS max_value,
                       max(unit) AS unit
                FROM readings
                GROUP BY device_id, sensor_id, parameter_name, bucket
                WITH NO DATA
            """))
            await conn.execute(text(
                f"CREATE INDEX IF NOT EXISTS ix_{CAGG}_device ON {CAGG} (device_id, bucket)"
            ))
            await conn.execute(text(
                f"CREATE INDEX IF NOT EXISTS ix_{CAGG}_sensor ON {CAGG} (sensor_id, bucket)"
            ))
            # Fill the existing history in the background - the scanner
            # should not wait for it. Until it finishes, real-time
            # aggregation (materialized_only = false) answers from raw rows,
            # so charts are correct, just slower.
            asyncio.create_task(_initial_refresh())
        await conn.execute(text(
            f"SELECT add_continuous_aggregate_policy('{CAGG}', "
            "start_offset => INTERVAL '3 days', end_offset => INTERVAL '15 minutes', "
            "schedule_interval => INTERVAL '15 minutes', if_not_exists => true)"
        ))
        state["cagg"] = True


async def _initial_refresh() -> None:
    try:
        async with engine.connect() as conn:
            conn = await conn.execution_options(isolation_level="AUTOCOMMIT")
            await conn.execute(text(f"CALL refresh_continuous_aggregate('{CAGG}', NULL, now() - INTERVAL '15 minutes')"))
        logger.info("Agregat %s wypełniony historią", CAGG)
    except Exception as e:
        logger.warning("Wypełnianie agregatu %s nie powiodło się: %s", CAGG, e)


async def drop_old_chunks(older_than) -> int:
    """Retention for the hypertable: drops whole day-chunks, which unlike a
    DELETE frees the disk space immediately. The 15-minute aggregate keeps
    its rows."""
    async with engine.connect() as conn:
        conn = await conn.execution_options(isolation_level="AUTOCOMMIT")
        result = await conn.execute(
            text("SELECT drop_chunks('readings', older_than => CAST(:t AS timestamptz))"), {"t": older_than}
        )
        return len(result.all())
