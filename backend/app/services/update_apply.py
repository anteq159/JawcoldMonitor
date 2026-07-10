import asyncio
import io
import json
import os
import shutil
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Optional

# APP_DIR is the live, bind-mounted app/ package (see docker-compose.yml -
# ./backend/app:/app/app). ALEMBIC_VERSIONS_DIR is the other bind-mounted
# path (./backend/alembic/versions:/app/alembic/versions) - a migration
# script has to actually be on disk for `alembic upgrade head` (run at
# every startup, see database.init_db()) to find and apply it, so an
# update that ships new tables/columns but not the migration that creates
# them would leave the new code pointed at a schema that was never
# updated. BACKUP_DIR deliberately lives outside those mounts: it's only
# meant to survive a simple container restart (the kind an update itself
# triggers), not a full `docker compose up --build`, so it doesn't need
# its own volume. There's no equivalent backup for alembic/versions -
# see the note in apply_update().
APP_DIR = Path(__file__).resolve().parent.parent
ROOT_DIR = APP_DIR.parent
ALEMBIC_VERSIONS_DIR = ROOT_DIR / "alembic" / "versions"
BACKUP_DIR = ROOT_DIR / "app_backup"
META_FILE = ROOT_DIR / "update_meta.json"


class UpdateError(Exception):
    """Safe to show directly to the admin who uploaded the file."""


def get_current_version() -> str:
    version_file = APP_DIR / "VERSION"
    if version_file.exists():
        return version_file.read_text().strip()
    return "nieznana"


def get_update_meta() -> Optional[dict]:
    if META_FILE.exists():
        try:
            return json.loads(META_FILE.read_text())
        except (json.JSONDecodeError, OSError):
            return None
    return None


def has_backup() -> bool:
    return BACKUP_DIR.exists()


def _safe_extract_path(member_name: str, target_dir: Path) -> Path:
    """Rejects any zip entry whose resolved path would land outside
    target_dir - protects against zip-slip (../../ path traversal) even
    though this endpoint is Admin-only, since a wrong file is still a
    real risk on a system that writes to refrigeration controllers."""
    resolved_target = target_dir.resolve()
    dest = (target_dir / member_name).resolve()
    if dest != resolved_target and resolved_target not in dest.parents:
        raise UpdateError(f"Nieprawidłowa ścieżka w archiwum: {member_name}")
    return dest


def _validate_and_stage(zip_bytes: bytes, staging_dir: Path) -> tuple[Path, Optional[Path]]:
    """Returns (new_app_dir, new_alembic_versions_dir_or_None). The
    alembic/versions folder is optional in the package - not every
    update includes a schema change - but app/ and app/VERSION are
    always required."""
    try:
        zf = zipfile.ZipFile(io.BytesIO(zip_bytes))
    except zipfile.BadZipFile:
        raise UpdateError("Plik nie jest prawidłowym archiwum .zip")

    names = zf.namelist()
    if not any(n == "app/" or n.startswith("app/") for n in names):
        raise UpdateError("Archiwum musi zawierać folder 'app/' z kodem aplikacji")
    if "app/VERSION" not in names:
        raise UpdateError("Archiwum musi zawierać plik 'app/VERSION' z numerem nowej wersji")

    # Zip-bomb guard: a tiny archive can declare gigabytes of decompressed
    # content and fill the SD card / RAM during extraction. Real update
    # packages are ~1 MB with a few hundred files.
    total_uncompressed = sum(m.file_size for m in zf.infolist())
    if total_uncompressed > 500 * 1024 * 1024:
        raise UpdateError("Archiwum deklaruje ponad 500 MB po rozpakowaniu - odrzucono")
    if len(names) > 20000:
        raise UpdateError("Archiwum zawiera podejrzanie dużo plików - odrzucono")

    extract_root = staging_dir / "extracted"
    extract_root.mkdir(parents=True, exist_ok=True)

    for member in zf.infolist():
        if member.is_dir():
            continue
        dest = _safe_extract_path(member.filename, extract_root)
        dest.parent.mkdir(parents=True, exist_ok=True)
        with zf.open(member) as src, open(dest, "wb") as out:
            shutil.copyfileobj(src, out)

    new_app_dir = extract_root / "app"
    if not new_app_dir.is_dir():
        raise UpdateError("Nie znaleziono folderu 'app/' po rozpakowaniu archiwum")

    new_alembic_dir = extract_root / "alembic" / "versions"
    if not new_alembic_dir.is_dir():
        new_alembic_dir = None

    return new_app_dir, new_alembic_dir


def _replace_dir_contents(source_dir: Path, target_dir: Path):
    for item in target_dir.iterdir():
        if item.is_dir():
            shutil.rmtree(item)
        else:
            item.unlink()
    for item in source_dir.iterdir():
        dest = target_dir / item.name
        if item.is_dir():
            shutil.copytree(item, dest)
        else:
            shutil.copy2(item, dest)


def apply_update(zip_bytes: bytes) -> dict:
    """Validates the upload, backs up the current app/, then swaps in the
    new app/ (and alembic/versions, if the package includes migrations).
    Raises UpdateError for anything wrong with the file itself (nothing
    on disk touched yet at that point). If the swap fails partway
    through, restores app/ from backup rather than leaving a
    half-old-half-new tree for the next restart to load.

    alembic/versions is deliberately NOT backed up/rolled back the same
    way: init_db() runs `alembic upgrade head` on every startup,
    including the one this same update triggers, so by the time anyone
    could decide to roll back, any new migrations almost certainly
    already ran against the real database. Alembic tracks "current
    revision" as a row in the database itself, not by checking which
    files exist on disk - removing a migration file after its revision
    is already recorded would desync the two and break every future
    `alembic upgrade head` call. A schema change is a one-way door once
    applied; only the application code is meant to be quickly reversible
    here."""
    old_version = get_current_version()

    with TemporaryDirectory(prefix="jawcold_update_") as tmp:
        new_app_dir, new_alembic_dir = _validate_and_stage(zip_bytes, Path(tmp))
        new_version = (new_app_dir / "VERSION").read_text().strip()

        if BACKUP_DIR.exists():
            shutil.rmtree(BACKUP_DIR)
        shutil.copytree(APP_DIR, BACKUP_DIR)

        try:
            _replace_dir_contents(new_app_dir, APP_DIR)
            if new_alembic_dir is not None:
                ALEMBIC_VERSIONS_DIR.mkdir(parents=True, exist_ok=True)
                _replace_dir_contents(new_alembic_dir, ALEMBIC_VERSIONS_DIR)
        except Exception:
            _replace_dir_contents(BACKUP_DIR, APP_DIR)
            raise UpdateError("Nie udało się zainstalować aktualizacji, przywrócono poprzednią wersję")

    meta = {
        "from_version": old_version,
        "to_version": new_version,
        "applied_at": datetime.now(timezone.utc).isoformat(),
        "action": "update",
        "included_migrations": new_alembic_dir is not None,
    }
    META_FILE.write_text(json.dumps(meta))
    return meta


def rollback_update() -> dict:
    """Restores app/ only - see the note in apply_update() about why
    alembic/versions is never part of a rollback. If the update being
    rolled back included a migration, the database keeps whatever schema
    change it made; the restored (older) code simply doesn't reference
    the new tables/columns, which is harmless."""
    if not BACKUP_DIR.exists():
        raise UpdateError("Brak zapisanej kopii do przywrócenia")

    current_version = get_current_version()
    backup_version_file = BACKUP_DIR / "VERSION"
    restored_version = backup_version_file.read_text().strip() if backup_version_file.exists() else "nieznana"

    _replace_dir_contents(BACKUP_DIR, APP_DIR)
    shutil.rmtree(BACKUP_DIR)

    meta = {
        "from_version": current_version,
        "to_version": restored_version,
        "applied_at": datetime.now(timezone.utc).isoformat(),
        "action": "rollback",
    }
    META_FILE.write_text(json.dumps(meta))
    return meta


def schedule_restart(delay_seconds: float = 1.5):
    """Forceful self-exit rather than a graceful signal: the goal is just
    to end the process reliably so Docker's `restart: unless-stopped`
    brings up a fresh one that imports the code just written to disk. The
    delay gives the HTTP response time to actually reach the browser first."""
    async def _restart():
        await asyncio.sleep(delay_seconds)
        os._exit(0)
    asyncio.create_task(_restart())
