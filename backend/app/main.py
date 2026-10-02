import asyncio
import logging
import re
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select, insert, delete
from sqlalchemy.orm import selectinload
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.core.config import settings
from app.core.database import init_db, AsyncSessionLocal
from app.core.security import hash_password, decode_token, password_fingerprint
from app.core.limiter import limiter
from app.core.diagnostics import install_handler as install_diagnostics_handler
from app.models.user import User, Role, Permission, role_permissions, user_roles
from app.websocket.manager import ws_manager
from app.services.scanner import scanner_loop
from app.core.version import get_current_version
from app.services.builtin_profiles import GENERIC_PROFILES as _GENERIC_PROFILES
from app.api.router import api_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
install_diagnostics_handler()


class _RedactTokenFilter(logging.Filter):
    """The browser WebSocket carries its JWT as ?token=..., and uvicorn's
    access log wrote every one of them in clear text to `docker logs` - a
    still-valid access token for anyone who can read the host's logs."""

    _pattern = re.compile(r"(token=)[^&\s\"']+")

    def filter(self, record: logging.LogRecord) -> bool:
        if record.args and isinstance(record.args, tuple):
            record.args = tuple(
                self._pattern.sub(r"\1***", a) if isinstance(a, str) else a for a in record.args
            )
        elif isinstance(record.msg, str):
            record.msg = self._pattern.sub(r"\1***", record.msg)
        return True


for _name in ("uvicorn.access", "uvicorn.error"):
    logging.getLogger(_name).addFilter(_RedactTokenFilter())

# Everything a logged-in user can do without a permission is read-only:
# dashboard, devices, charts, map, alarms list. Each permission below
# unlocks one area of changes; the Roles page groups them by these names.
DEFAULT_PERMISSIONS = [
    ("device:write", "Dodawanie i edycja sterowników oraz czujników, zmiana nastaw"),
    ("alert:acknowledge", "Oznaczanie aktywnych alarmów jako przyjętych do wiadomości"),
    ("alert:manage", "Tworzenie i edycja reguł alarmowych"),
    ("log:read", "Przeglądanie historii zdarzeń, alarmów i zmian nastaw"),
    ("export:any", "Pobieranie odczytów i alarmów jako CSV, Excel lub PDF"),
    ("config:write", "Edycja map rejestrów sterowników, plany obiektu i rozmieszczenie urządzeń na mapie"),
    ("settings:write", "Port RS485, kanały powiadomień, czas przechowywania danych"),
    ("user:manage", "Dodawanie i blokowanie kont, przypisywanie i tworzenie ról"),
    ("system:manage", "Diagnostyka, kopie zapasowe, aktualizacje, restart Raspberry"),
]

# Permissions that existed in earlier versions and are gone: "device:read"
# was never checked anywhere (viewing needs only a login), so it was a
# checkbox that changed nothing.
RETIRED_PERMISSIONS = ["device:read"]

# Seeded on every boot; the permission sets of the roles listed here are
# RESET to these values at startup (custom roles created in the Roles page
# are untouched). Serwisant is the middle tier a real deployment needs:
# day-to-day operations (device management, register writes, alarm
# handling, exports) without administration (users, backup/restore,
# updates, profile/map configuration).
DEFAULT_ROLES = {
    "Admin": [p[0] for p in DEFAULT_PERMISSIONS],
    "Serwisant": ["device:write", "alert:manage", "alert:acknowledge", "log:read", "export:any"],
}
DEFAULT_ROLE_DESCRIPTIONS = {
    "Admin": "Pełny dostęp do wszystkich funkcji",
    "Serwisant": "Obsługa na co dzień: sterowniki, nastawy, alarmy, logi, eksport - bez administracji",
}


async def _init_defaults():
    async with AsyncSessionLocal() as db:
        # Upsert permissions
        perm_map: dict[str, Permission] = {}
        for perm_name, perm_desc in DEFAULT_PERMISSIONS:
            result = await db.execute(select(Permission).where(Permission.name == perm_name))
            perm = result.scalar_one_or_none()
            if not perm:
                perm = Permission(name=perm_name, description=perm_desc)
                db.add(perm)
                await db.flush()
            perm.description = perm_desc
            perm_map[perm_name] = perm
        retired = (await db.execute(select(Permission.id).where(Permission.name.in_(RETIRED_PERMISSIONS)))).scalars().all()
        if retired:
            await db.execute(role_permissions.delete().where(role_permissions.c.permission_id.in_(retired)))
            await db.execute(Permission.__table__.delete().where(Permission.id.in_(retired)))

        # Upsert roles — avoid lazy-load by using the association table directly
        role_map: dict[str, Role] = {}
        for role_name, perm_names in DEFAULT_ROLES.items():
            result = await db.execute(select(Role).where(Role.name == role_name))
            role = result.scalar_one_or_none()
            if not role:
                role = Role(name=role_name, is_custom=False)
                db.add(role)
                await db.flush()

            role.description = DEFAULT_ROLE_DESCRIPTIONS.get(role_name, role.description)
            role_map[role_name] = role

            # Set permissions via association table to avoid lazy-load in async context
            desired_ids = {perm_map[p].id for p in perm_names if p in perm_map}
            await db.execute(
                role_permissions.delete().where(role_permissions.c.role_id == role.id)
            )
            if desired_ids:
                await db.execute(
                    role_permissions.insert(),
                    [{"role_id": role.id, "permission_id": pid} for pid in desired_ids],
                )

        # Upsert default admin
        result = await db.execute(select(User).where(User.username == "admin"))
        admin = result.scalar_one_or_none()
        if not admin:
            admin = User(
                username="admin",
                password_hash=hash_password("admin"),
                must_change_password=True,
                is_active=True,
            )
            db.add(admin)
            await db.flush()
            # warning, not info: uvicorn's log config filters INFO from app
            # loggers, and this is exactly the line someone needs to find in
            # `docker logs` when asking "why can't I log in".
            logger.warning("Utworzono domyślne konto admin (hasło: admin)")
        elif admin.last_login is None and admin.must_change_password:
            # Factory account nobody has ever logged into - re-assert
            # admin/admin. A half-finished first install (interrupted seed,
            # DB restored from a backup taken before the first login, a
            # password set straight in the DB) otherwise leaves a fresh
            # deployment with no usable credentials and no way in. Once
            # anyone logs in successfully last_login is set, and once the
            # password is changed must_change_password clears - from then on
            # this branch never touches the account again.
            admin.password_hash = hash_password("admin")
            admin.is_active = True
            logger.warning("Przywrócono fabryczne konto admin (hasło: admin)")

        # Idempotent - a partially seeded install can leave the admin row
        # without its role, which logs in but can't do anything.
        has_admin_role = await db.execute(
            select(user_roles.c.user_id).where(
                user_roles.c.user_id == admin.id,
                user_roles.c.role_id == role_map["Admin"].id,
            )
        )
        if has_admin_role.first() is None:
            await db.execute(
                user_roles.insert(),
                [{"user_id": admin.id, "role_id": role_map["Admin"].id}],
            )

        await db.commit()


async def _init_manufacturer_profiles():
    """Seed one built-in DeviceProfile per registered manufacturer driver, so
    the demo has real, browsable register maps for Danfoss/Carel/Eliwell
    without requiring anyone to hand-enter them via the API first. Builtin
    profiles are re-synced to the driver's current register map on every
    startup (source == "builtin" guards user-customized profiles from ever
    being touched), so adding a register or flipping a writable flag in a
    driver module doesn't require manual DB surgery to take effect."""
    import app.drivers.manufacturers  # noqa: F401 - triggers registration
    from app.drivers.registry import all_drivers
    from app.models.device_profile import DeviceProfile, RegisterDefinition

    async with AsyncSessionLocal() as db:
        for manufacturer, driver_cls in all_drivers().items():
            # Scoped to source="builtin": a manufacturer can have other
            # profiles sharing the same manufacturer string (user-created
            # local ones, or now-removed device-specific clones from an
            # earlier release) - matching on manufacturer alone crashed
            # startup with MultipleResultsFound the moment more than one
            # existed for the same manufacturer.
            result = await db.execute(select(DeviceProfile).where(
                DeviceProfile.manufacturer == manufacturer, DeviceProfile.source == "builtin",
            ))
            profile = result.scalars().first()
            driver = driver_cls()
            model = driver.identify()
            registers = [
                RegisterDefinition(
                    position=i,
                    address=r.address,
                    name=r.name,
                    unit=r.unit,
                    description=r.description,
                    data_type=r.data_type,
                    scale_factor=r.scale_factor,
                    writable=r.writable,
                    is_alarm_register=r.is_alarm_register,
                    register_type=r.register_type,
                    category=r.category,
                    bit=r.bit,
                )
                for i, r in enumerate(driver.default_register_map())
            ]
            if profile:
                # customized: edited in Konfiguracja - re-syncing it here
                # used to wipe every user change on each backend restart.
                # "Przywróć domyślne" (POST /device-profiles/{id}/reset)
                # clears the flag to opt back in.
                if profile.source == "builtin" and not profile.customized:
                    profile.model = model.model
                    profile.description = model.description
                    profile.registers = registers
                continue
            # Some drivers key their registry entry on the full model
            # designation already (e.g. manufacturer="Danfoss EKC 202"),
            # not just the brand - avoid "Danfoss EKC 202 EKC 202".
            display_name = manufacturer if model.model in manufacturer else f"{manufacturer} {model.model}"
            profile = DeviceProfile(
                name=display_name,
                manufacturer=manufacturer,
                model=model.model,
                description=model.description,
                source="builtin",
                registers=registers,
            )
            db.add(profile)
            logger.info("Seeded built-in device profile for %s", manufacturer)
        await db.commit()


async def _init_generic_profiles():
    """Seed the fixed generic (non-manufacturer) profile templates above.
    Keyed by name (not manufacturer, which is null for these) for the same
    idempotent re-sync as _init_manufacturer_profiles()."""
    from app.models.device_profile import DeviceProfile, RegisterDefinition

    async with AsyncSessionLocal() as db:
        for spec in _GENERIC_PROFILES:
            result = await db.execute(select(DeviceProfile).where(DeviceProfile.name == spec["name"]))
            profile = result.scalar_one_or_none()
            registers = [RegisterDefinition(**r) for r in spec["registers"]]
            if profile:
                if profile.source == "builtin" and not profile.customized:
                    profile.description = spec["description"]
                    profile.registers = registers
                continue
            db.add(DeviceProfile(
                name=spec["name"],
                manufacturer=None,
                model=None,
                description=spec["description"],
                source="builtin",
                registers=registers,
            ))
            logger.info("Seeded generic device profile: %s", spec["name"])
        await db.commit()


# Known placeholder secrets: the code default and the .env.example value.
# Tokens signed with a public secret are forgeable by anyone who has read
# the repository - when one of these is detected, a random key is
# generated and persisted at first boot instead (see _ensure_secret_key).
_PLACEHOLDER_SECRETS = {
    "dev-secret-key-change-in-production-32chars",
    "change_me_at_least_32_chars_random_string",
}


async def _ensure_secret_key():
    """Factory-fresh installs must be usable AND secure without touching
    .env: when SECRET_KEY is still a placeholder, generate a random key at
    first boot and persist it in app_settings (the DB survives updates and
    container rebuilds, unlike anything under app/, which the update
    mechanism wipes). A real key set in .env always wins - the DB copy is
    only the fallback for installs that never configured one. Stored under
    a "_"-prefixed key so it is not exposed through the web-editable
    settings whitelist."""
    if settings.SECRET_KEY not in _PLACEHOLDER_SECRETS:
        return
    import secrets as pysecrets
    from app.models.app_setting import AppSetting
    async with AsyncSessionLocal() as db:
        row = await db.get(AppSetting, "_SECRET_KEY")
        if row is None:
            row = AppSetting(key="_SECRET_KEY", value=pysecrets.token_hex(32))
            db.add(row)
            await db.commit()
            logger.warning(
                "SECRET_KEY nie był ustawiony - wygenerowano losowy klucz "
                "i zapisano trwale w bazie (instalacja gotowa do użytku)."
            )
        settings.SECRET_KEY = row.value


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting JawcoldMonitor (PREVIEW=%s)", settings.PREVIEW_MODE)
    await init_db()
    from app.core.timescale import ensure_timescale
    try:
        await ensure_timescale()
    except Exception as e:
        # Never keep the panel down over this - the plain-table code paths
        # still work, only slower.
        logger.error("Konfiguracja TimescaleDB nie powiodła się: %s", e)
    await _ensure_secret_key()
    await _init_defaults()
    await _init_manufacturer_profiles()
    await _init_generic_profiles()
    # Apply web-edited setting overrides BEFORE the scanner starts, so
    # RS485 parameters changed from the UI are picked up by init_drivers().
    from app.services.runtime_settings import load_overrides
    from app.models.app_setting import AppSetting  # noqa: F401 - mapper registration
    async with AsyncSessionLocal() as db:
        await load_overrides(db)
    scanner_task = asyncio.create_task(scanner_loop())
    yield
    scanner_task.cancel()
    try:
        await scanner_task
    except asyncio.CancelledError:
        pass
    logger.info("JawcoldMonitor stopped")


# Swagger/ReDoc/openapi.json only in preview/dev: on a production
# appliance they enumerate the entire API surface to anyone on the LAN
# with no login. The frontend never uses them.
app = FastAPI(
    title="JawcoldMonitor API",
    version=get_current_version(),
    docs_url="/api/v1/docs" if settings.PREVIEW_MODE else None,
    redoc_url="/api/v1/redoc" if settings.PREVIEW_MODE else None,
    openapi_url="/api/v1/openapi.json" if settings.PREVIEW_MODE else None,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.include_router(api_router)


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket, token: str = Query(None)):
    # The WS stream carries everything the REST API guards behind a login
    # (live readings, device names, alarm broadcasts, system stats), so it
    # requires the same JWT. Query param instead of a header because the
    # browser WebSocket API cannot set custom headers. Validated once at
    # connect; a token expiring mid-connection keeps the stream (same as a
    # long-lived HTTP response), and the client re-authenticates on its
    # next reconnect.
    payload = decode_token(token) if token else None
    if not payload or payload.get("type") != "access":
        await ws.close(code=4401)
        return
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.id == int(payload.get("sub", 0))))
        user = result.scalar_one_or_none()
        if not user or not user.is_active:
            await ws.close(code=4401)
            return
        if payload.get("pwd") != password_fingerprint(user.password_hash):
            # Same revocation rule as the REST API: tokens issued before
            # the last password change don't open a live data stream.
            await ws.close(code=4401)
            return

    client_id = str(uuid.uuid4())
    await ws_manager.connect(client_id, ws)
    try:
        while True:
            await ws.receive_text()  # keep connection alive, handle pings
    except WebSocketDisconnect:
        ws_manager.disconnect(client_id)
    except Exception:
        ws_manager.disconnect(client_id)


@app.get("/api/v1/health")
async def health():
    return {"status": "ok", "preview": settings.PREVIEW_MODE}
