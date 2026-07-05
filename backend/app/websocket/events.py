from typing import Any, Optional
from pydantic import BaseModel


class WSEvent(BaseModel):
    type: str
    data: Any


def device_connected(device_data: dict) -> dict:
    return {"type": "device_connected", "data": device_data}


def device_disconnected(device_id: int, name: str) -> dict:
    return {"type": "device_disconnected", "data": {"device_id": device_id, "name": name}}


def new_reading(device_id: int, readings: list) -> dict:
    return {"type": "new_reading", "data": {"device_id": device_id, "readings": readings}}


def sensor_reading(sensor_id: int, temperature: float, rom_id: str) -> dict:
    return {"type": "sensor_reading", "data": {"sensor_id": sensor_id, "temperature": temperature, "rom_id": rom_id}}


def alert_triggered(event_data: dict) -> dict:
    return {"type": "alert_triggered", "data": event_data}


def alert_acknowledged(event_id: int) -> dict:
    return {"type": "alert_acknowledged", "data": {"event_id": event_id}}


def alert_resolved(event_id: int, resolved_at: str) -> dict:
    return {"type": "alert_resolved", "data": {"event_id": event_id, "resolved_at": resolved_at}}


def new_device_found(device_data: dict) -> dict:
    return {"type": "new_device_found", "data": device_data}


def system_stats(stats: dict) -> dict:
    return {"type": "system_stats", "data": stats}


def hardware_alarm(device_id: int, device_name: str, code: int, name: str, description: str, severity: str, status: str) -> dict:
    """A controller's own reported alarm/status code, decoded via
    decode_active_alarms() - distinct from alert_triggered/alert_resolved,
    which are threshold rules the user configured against parameter
    values. status is 'active' or 'resolved'."""
    return {"type": "hardware_alarm", "data": {
        "device_id": device_id, "device_name": device_name, "code": code,
        "name": name, "description": description, "severity": severity, "status": status,
    }}
