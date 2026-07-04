-- JawcoldMonitor — PostgreSQL init
-- This file runs once when the container is first created.
-- Alembic handles the schema; this file only sets up extensions.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
