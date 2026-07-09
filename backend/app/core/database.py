import asyncio
from pathlib import Path

from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from app.core.config import settings

BACKEND_DIR = Path(__file__).resolve().parents[2]

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=False,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        yield session


def _run_migrations_sync() -> None:
    """Run Alembic migrations up to head. Sync API, so this must be
    called off the event loop (see init_db)."""
    from alembic import command
    from alembic.config import Config

    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    command.upgrade(cfg, "head")


async def init_db() -> None:
    # Import every model module so SQLAlchemy can resolve the string-based
    # relationship() references between them (e.g. Device.profile ->
    # "DeviceProfile"), independently of whatever alembic/env.py imports.
    import app.models.user  # noqa
    import app.models.device_profile  # noqa — must come before device
    import app.models.device  # noqa
    import app.models.sensor  # noqa
    import app.models.parameter  # noqa
    import app.models.reading  # noqa
    import app.models.alert  # noqa
    import app.models.log  # noqa
    import app.models.audit  # noqa
    import app.models.map  # noqa
    import app.models.visibility  # noqa
    import app.models.favorite  # noqa
    import app.models.hardware_alarm  # noqa

    await asyncio.to_thread(_run_migrations_sync)
