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
from app.core.security import hash_password
from app.core.limiter import limiter
from app.models.user import User, Role, Permission, role_permissions, user_roles
from app.websocket.manager import ws_manager
from app.services.scanner import scanner_loop
from app.api.router import api_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

DEFAULT_PERMISSIONS = [
    ("device:read", "Odczyt urządzeń"),
    ("device:write", "Zapis urządzeń"),
    ("user:manage", "Zarządzanie użytkownikami"),
    ("alert:manage", "Zarządzanie alertami"),
    ("log:read", "Odczyt logów"),
    ("config:write", "Zapis konfiguracji"),
    ("export:any", "Eksport danych"),
]

DEFAULT_ROLES = {
    "Admin": [p[0] for p in DEFAULT_PERMISSIONS],
    "Viewer": ["device:read", "log:read"],
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


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting JawcoldMonitor (PREVIEW=%s)", settings.PREVIEW_MODE)
    await init_db()
    await init_redis()
    redis = get_redis()
    ws_manager.init_redis(redis)
    await ws_manager.start_listener()
    await _init_defaults()
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


app = FastAPI(
    title="JawcoldMonitor API",
    version="1.0.0",
    docs_url="/api/v1/docs",
    redoc_url="/api/v1/redoc",
    openapi_url="/api/v1/openapi.json",
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
async def websocket_endpoint(ws: WebSocket):
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
