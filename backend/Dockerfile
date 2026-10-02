FROM python:3.12-slim

WORKDIR /app

# Every dependency ships prebuilt wheels for amd64 and arm64 (asyncpg,
# psycopg2-binary, bcrypt, cryptography, psutil, reportlab), so no compiler
# or libpq headers - a much smaller image and a faster build on the Pi.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Fail the build - not the running panel - on a broken import, including in
# alembic/env.py (outside the app package). Nothing connects to a database
# here; this only loads the modules.
RUN python -c "import app.main, ast; ast.parse(open('alembic/env.py').read())" \
    && python -c "import importlib.util, sys; sys.argv=['x']; [__import__(l.split()[1]) for l in open('alembic/env.py') if l.startswith('import app.')]"

ARG VERSION=dev
LABEL org.opencontainers.image.source="https://github.com/anteq159/JawcoldMonitor" \
      org.opencontainers.image.version="${VERSION}"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
