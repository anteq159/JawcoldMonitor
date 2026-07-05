import sys
from logging.config import fileConfig
from pathlib import Path

from sqlalchemy import engine_from_config
from sqlalchemy import pool

from alembic import context

# Make the "app" package importable when Alembic is invoked from anywhere.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import settings  # noqa: E402
from app.models.base import Base  # noqa: E402

# Import every model module so Base.metadata is fully populated before
# autogenerate compares it against the live database. Order matches
# app/core/database.py's init_db() (device_profile before device).
import app.models.user  # noqa: E402,F401
import app.models.device_profile  # noqa: E402,F401
import app.models.device  # noqa: E402,F401
import app.models.sensor  # noqa: E402,F401
import app.models.parameter  # noqa: E402,F401
import app.models.reading  # noqa: E402,F401
import app.models.alert  # noqa: E402,F401
import app.models.log  # noqa: E402,F401
import app.models.audit  # noqa: E402,F401
import app.models.map  # noqa: E402,F401
import app.models.visibility  # noqa: E402,F401
import app.models.favorite  # noqa: E402,F401

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Interpret the config file for Python logging. disable_existing_loggers=False
# so this doesn't clobber the host app's own logging setup when migrations
# are run inline at FastAPI startup (see core/database.py).
if config.config_file_name is not None:
    fileConfig(config.config_file_name, disable_existing_loggers=False)

# The app talks to Postgres over asyncpg; Alembic migrations run
# synchronously over psycopg2 (already a project dependency for this
# exact reason). Derive the sync URL from the app's own settings so
# there is a single source of truth for the connection string.
sync_url = settings.DATABASE_URL.replace("postgresql+asyncpg", "postgresql+psycopg2")
config.set_main_option("sqlalchemy.url", sync_url)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode (emits SQL, no DB connection)."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode against a live connection."""
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
