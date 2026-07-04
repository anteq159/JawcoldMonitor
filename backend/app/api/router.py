from fastapi import APIRouter
from app.api.v1 import auth, devices, sensors, readings, alerts, users, logs, system, export, maps, visibility, roles, favorites

api_router = APIRouter(prefix="/api/v1")

api_router.include_router(auth.router)
api_router.include_router(devices.router)
api_router.include_router(sensors.router)
api_router.include_router(readings.router)
api_router.include_router(alerts.router)
api_router.include_router(users.router)
api_router.include_router(logs.router)
api_router.include_router(system.router)
api_router.include_router(export.router)
api_router.include_router(maps.router)
api_router.include_router(visibility.router)
api_router.include_router(roles.router)
api_router.include_router(favorites.router)
