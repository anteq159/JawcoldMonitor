import asyncio
import logging
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.models.device import Device
from app.models.sensor import Sensor
from app.models.reading import Reading
from app.models.alert import AlertRule, AlertEvent
from app.models.log import EventLog
from app.websocket.manager import ws_manager
from app.websocket import events as ws_events
from app.services.system_stats import get_system_stats

logger = logging.getLogger(__name__)

_rs485_driver = None
_dallas_driver = None
_last_discovery: Optional[datetime] = None
_last_dallas_scan: Optional[datetime] = None
_last_stats_broadcast: Optional[datetime] = None
_last_tick: Optional[datetime] = None


def get_last_tick() -> Optional[datetime]:
    """Timestamp of the last completed scanner loop iteration - used by the
    /system/services health check to tell if the background loop is alive."""
    return _last_tick


def init_drivers():
    global _rs485_driver, _dallas_driver
    if settings.PREVIEW_MODE:
        from app.drivers.rs485.mock import MockRS485Driver
        from app.drivers.dallas.mock import MockDallasDriver
        _rs485_driver = MockRS485Driver()
        _dallas_driver = MockDallasDriver()
    else:
        from app.drivers.rs485.modbus_rtu import ModbusRTUDriver
        from app.drivers.dallas.w1 import W1DallasDriver
        ports = settings.rs485_port_list
        if ports:
            _rs485_driver = ModbusRTUDriver(ports[0], settings.RS485_BAUDRATE, settings.MODBUS_TIMEOUT)
        _dallas_driver = W1DallasDriver()


async def scanner_loop():
    global _last_tick
    init_drivers()
    while True:
        try:
            await _scan_known_devices()
            await _maybe_discovery()
            await _scan_dallas()
            await _maybe_broadcast_stats()
        except asyncio.CancelledError:
            raise
        except Exception as e:
            logger.error("Scanner error: %s", e)
        _last_tick = datetime.now(timezone.utc)
        await asyncio.sleep(1)


def _due(last: Optional[datetime], interval: int) -> bool:
    if last is None:
        return True
    elapsed = (datetime.now(timezone.utc) - last).total_seconds()
    return elapsed >= interval


async def _scan_known_devices():
    if not _rs485_driver:
        return
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Device))
        devices = result.scalars().all()
        for device in devices:
            try:
                is_online = await _rs485_driver.ping(device.modbus_address)
                old_status = device.status
                new_status = "online" if is_online else "offline"
                if old_status != new_status:
                    device.status = new_status
                    device.last_seen = datetime.now(timezone.utc) if is_online else device.last_seen
                    await db.commit()
                    if is_online:
                        event_type = "device_connected"
                        await ws_manager.broadcast(ws_events.device_connected(
                            {"id": device.id, "name": device.name, "status": "online", "modbus_address": device.modbus_address}
                        ))
                    else:
                        event_type = "device_disconnected"
                        await ws_manager.broadcast(ws_events.device_disconnected(device.id, device.name))
                    log = EventLog(event_type=event_type, device_id=device.id, message=f"{device.name} → {new_status}")
                    db.add(log)
                    await db.commit()

                if is_online:
                    readings_data = await _rs485_driver.read_parameters(device)
                    readings_out = []
                    for param_name, data in readings_data.items():
                        r = Reading(
                            device_id=device.id,
                            parameter_name=param_name,
                            value=data["value"],
                            unit=data.get("unit", ""),
                            timestamp=datetime.now(timezone.utc),
                        )
                        db.add(r)
                        readings_out.append({"parameter_name": param_name, "value": data["value"], "unit": data.get("unit", "")})
                    device.last_seen = datetime.now(timezone.utc)
                    await db.commit()
                    if readings_out:
                        await ws_manager.broadcast(ws_events.new_reading(device.id, readings_out))
                    await _check_alerts(db, device.id, None, readings_data)
            except Exception as e:
                logger.warning("Device %d scan error: %s", device.modbus_address, e)


async def _maybe_discovery():
    global _last_discovery
    if not _due(_last_discovery, settings.DISCOVERY_SCAN_INTERVAL):
        return
    _last_discovery = datetime.now(timezone.utc)
    if not _rs485_driver:
        return
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Device.modbus_address))
        known = set(result.scalars().all())
        try:
            new_addresses = await _rs485_driver.scan_range(1, settings.DISCOVERY_MAX_ADDRESS, known)
        except Exception as e:
            logger.warning("Discovery error: %s", e)
            return
        for addr in new_addresses:
            mock_info = {}
            if hasattr(_rs485_driver, "get_mock_device_info"):
                mock_info = _rs485_driver.get_mock_device_info(addr)
            device = Device(
                name=mock_info.get("name", f"Urządzenie #{addr}"),
                modbus_address=addr,
                status="online",
                first_seen=datetime.now(timezone.utc),
                last_seen=datetime.now(timezone.utc),
            )
            db.add(device)
            await db.flush()
            log = EventLog(event_type="device_discovered", device_id=device.id, message=f"Odkryto nowe urządzenie na adresie {addr}")
            db.add(log)
            await db.commit()
            await ws_manager.broadcast(ws_events.new_device_found(
                {"id": device.id, "name": device.name, "modbus_address": addr, "status": "online"}
            ))
            logger.info("New device discovered at address %d", addr)


async def _scan_dallas():
    global _last_dallas_scan
    if not _due(_last_dallas_scan, settings.DALLAS_SCAN_INTERVAL):
        return
    _last_dallas_scan = datetime.now(timezone.utc)
    if not _dallas_driver:
        return
    async with AsyncSessionLocal() as db:
        try:
            rom_ids = await _dallas_driver.scan()
        except Exception as e:
            logger.warning("Dallas scan error: %s", e)
            return

        for rom_id in rom_ids:
            result = await db.execute(select(Sensor).where(Sensor.rom_id == rom_id))
            sensor = result.scalar_one_or_none()
            if not sensor:
                mock_info = {}
                if hasattr(_dallas_driver, "get_mock_sensor_info"):
                    mock_info = _dallas_driver.get_mock_sensor_info(rom_id)
                sensor = Sensor(
                    rom_id=rom_id,
                    name=mock_info.get("name", f"Czujnik {rom_id[:8]}"),
                    status="online",
                    first_seen=datetime.now(timezone.utc),
                    last_seen=datetime.now(timezone.utc),
                )
                db.add(sensor)
                await db.flush()
                log = EventLog(event_type="sensor_discovered", sensor_id=sensor.id, message=f"Odkryto czujnik Dallas {rom_id}")
                db.add(log)

            try:
                temp = await _dallas_driver.read_temperature(rom_id)
                if temp is not None:
                    r = Reading(
                        sensor_id=sensor.id,
                        parameter_name="Temperatura",
                        value=temp,
                        unit="°C",
                        timestamp=datetime.now(timezone.utc),
                    )
                    db.add(r)
                    sensor.status = "online"
                    sensor.last_seen = datetime.now(timezone.utc)
                    await db.commit()
                    await ws_manager.broadcast(ws_events.sensor_reading(sensor.id, temp, rom_id))
                    await _check_alerts(db, None, sensor.id, {"Temperatura": {"value": temp, "unit": "°C"}})
            except Exception as e:
                logger.warning("Dallas read error %s: %s", rom_id, e)

        await db.commit()


async def _check_alerts(db: AsyncSession, device_id, sensor_id, readings: dict):
    try:
        q = select(AlertRule).where(AlertRule.enabled == True)
        if device_id is not None:
            q = q.where(AlertRule.device_id == device_id)
        elif sensor_id is not None:
            q = q.where(AlertRule.sensor_id == sensor_id)
        result = await db.execute(q)
        rules = result.scalars().all()
        for rule in rules:
            if rule.parameter_name not in readings:
                continue
            value = readings[rule.parameter_name]["value"]
            triggered = False
            if rule.condition == "gt" and rule.threshold_value is not None and value > rule.threshold_value:
                triggered = True
            elif rule.condition == "lt" and rule.threshold_value is not None and value < rule.threshold_value:
                triggered = True
            elif rule.threshold_min is not None and rule.threshold_max is not None:
                if value < rule.threshold_min or value > rule.threshold_max:
                    triggered = True
            if triggered:
                event = AlertEvent(
                    rule_id=rule.id,
                    device_id=device_id,
                    sensor_id=sensor_id,
                    value=value,
                    severity=rule.severity,
                    message=f"{rule.name}: wartość {value} przekroczyła próg",
                    timestamp=datetime.now(timezone.utc),
                )
                db.add(event)
                await db.flush()
                await db.commit()
                await ws_manager.broadcast(ws_events.alert_triggered({
                    "id": event.id,
                    "rule_id": rule.id,
                    "rule_name": rule.name,
                    "device_id": device_id,
                    "sensor_id": sensor_id,
                    "value": value,
                    "severity": rule.severity,
                    "message": event.message,
                }))
    except Exception as e:
        logger.warning("Alert check error: %s", e)


async def _maybe_broadcast_stats():
    global _last_stats_broadcast
    if not _due(_last_stats_broadcast, 5):
        return
    _last_stats_broadcast = datetime.now(timezone.utc)
    try:
        stats = await get_system_stats()
        await ws_manager.broadcast(ws_events.system_stats(stats))
    except Exception as e:
        logger.warning("Stats broadcast error: %s", e)
