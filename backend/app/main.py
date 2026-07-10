import asyncio
import logging
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
from app.core.redis import init_redis, close_redis, get_redis
from app.core.security import hash_password, decode_token, password_fingerprint
from app.core.limiter import limiter
from app.core.diagnostics import install_handler as install_diagnostics_handler
from app.models.user import User, Role, Permission, role_permissions, user_roles
from app.websocket.manager import ws_manager
from app.services.scanner import scanner_loop
from app.api.router import api_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
install_diagnostics_handler()

DEFAULT_PERMISSIONS = [
    ("device:read", "Odczyt urządzeń"),
    ("device:write", "Zapis urządzeń"),
    ("user:manage", "Zarządzanie użytkownikami"),
    ("alert:manage", "Zarządzanie alertami"),
    ("alert:acknowledge", "Potwierdzanie alarmów"),
    ("log:read", "Odczyt logów"),
    ("config:write", "Zapis konfiguracji"),
    ("export:any", "Eksport danych"),
]

# Seeded on every boot; the permission sets of the roles listed here are
# RESET to these values at startup (custom roles created in the Roles page
# are untouched). Serwisant is the middle tier a real deployment needs:
# day-to-day operations (device management, register writes, alarm
# handling, exports) without administration (users, backup/restore,
# updates, profile/map configuration).
DEFAULT_ROLES = {
    "Admin": [p[0] for p in DEFAULT_PERMISSIONS],
    "Serwisant": ["device:read", "device:write", "alert:manage", "alert:acknowledge", "log:read", "export:any"],
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
            perm_map[perm_name] = perm

        # Upsert roles — avoid lazy-load by using the association table directly
        role_map: dict[str, Role] = {}
        for role_name, perm_names in DEFAULT_ROLES.items():
            result = await db.execute(select(Role).where(Role.name == role_name))
            role = result.scalar_one_or_none()
            if not role:
                role = Role(name=role_name, is_custom=False)
                db.add(role)
                await db.flush()

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
            # Set role via association table
            await db.execute(
                user_roles.insert(),
                [{"user_id": admin.id, "role_id": role_map["Admin"].id}],
            )
            logger.info("Created default admin user (password: admin)")

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
                )
                for i, r in enumerate(driver.default_register_map())
            ]
            if profile:
                if profile.source == "builtin":
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


# Generic, vendor-agnostic starting templates for the Konfiguracja page's
# "Inne" tab - other common Modbus devices someone might monitor alongside
# refrigeration controllers (a site's energy meter, a pressure transducer
# on a compressor line). Not manufacturer/driver-backed like the profiles
# above: no real-world brand identity, no alarm register, so there's
# nothing for decode_active_alarms() to do with them and no mock
# simulation - a device assigned one of these needs its own real
# register values, this is a starting point to edit, not a demo device.
_GENERIC_PROFILES = [
    {
        "name": "Licznik energii (ogólny)",
        "description": "Uniwersalny szablon licznika energii 3-fazowego - adresy przykładowe, dostosuj do konkretnego licznika.",
        "registers": [
            {"address": 0, "name": "Napięcie L1", "unit": "V", "data_type": "float32", "scale_factor": 1.0},
            {"address": 2, "name": "Napięcie L2", "unit": "V", "data_type": "float32", "scale_factor": 1.0},
            {"address": 4, "name": "Napięcie L3", "unit": "V", "data_type": "float32", "scale_factor": 1.0},
            {"address": 6, "name": "Prąd L1", "unit": "A", "data_type": "float32", "scale_factor": 1.0},
            {"address": 20, "name": "Moc czynna", "unit": "kW", "data_type": "float32", "scale_factor": 1.0},
            {"address": 40, "name": "Energia", "unit": "kWh", "data_type": "float32", "scale_factor": 1.0},
        ],
    },
    {
        "name": "Przetwornik ciśnienia (ogólny)",
        "description": "Uniwersalny szablon przetwornika ciśnienia (np. na linii ssawnej/tłocznej sprężarki) - adresy przykładowe.",
        "registers": [
            {"address": 0, "name": "Ciśnienie", "unit": "bar", "data_type": "int16", "scale_factor": 0.01},
            {"address": 1, "name": "Temperatura medium", "unit": "°C", "data_type": "int16", "scale_factor": 0.1},
        ],
    },
]


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
                if profile.source == "builtin":
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
    await _ensure_secret_key()
    await init_redis()
    redis = get_redis()
    ws_manager.init_redis(redis)
    await ws_manager.start_listener()
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
    await ws_manager.stop_listener()
    await close_redis()
    logger.info("JawcoldMonitor stopped")


# Swagger/ReDoc/openapi.json only in preview/dev: on a production
# appliance they enumerate the entire API surface to anyone on the LAN
# with no login. The frontend never uses them.
app = FastAPI(
    title="JawcoldMonitor API",
    version="1.0.0",
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
