import asyncio
import json
import logging
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, Optional, Set

from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.models.device import Device
from app.models.device_profile import DeviceProfile
from app.models.sensor import Sensor
from app.models.reading import Reading
from app.models.alert import AlertRule, AlertEvent
from app.models.log import EventLog
from app.websocket.manager import ws_manager
from app.websocket import events as ws_events
from app.services.system_stats import get_system_stats
from app.services import notifications
from app.drivers.registry import get_driver
from app.drivers.base import decode_active_alarms

logger = logging.getLogger(__name__)

_rs485_driver = None
_dallas_driver = None
_last_known_scan: Dict[int, datetime] = {}  # per-device, not global (Etap 3.4)
_last_discovery: Optional[datetime] = None
_last_dallas_scan: Optional[datetime] = None
_last_stats_broadcast: Optional[datetime] = None
_last_prune: Optional[datetime] = None
_last_tick: Optional[datetime] = None
# Edge-triggered like _check_alerts() - which native alarm codes are
# currently active per device, so a steady alarm logs once, not every
# scan cycle, and a WS event fires when it actually clears.
_active_hw_alarms: Dict[int, Set[int]] = {}
# Offline-too-long alarm (edge-triggered): when each device was last seen
# going offline, and which ones have already fired the alarm.
_offline_since: Dict[int, datetime] = {}
_offline_alarmed: Set[int] = set()
_last_disk_check: Optional[datetime] = None
_disk_alarmed = False
_last_auto_backup: Optional[datetime] = None


def get_last_tick() -> Optional[datetime]:
    """Timestamp of the last completed scanner loop iteration - used by the
    /system/services health check to tell if the background loop is alive."""
    return _last_tick


def get_rs485_driver():
    """Current RS485 driver instance (mock or real ModbusRTUDriver),
    whichever mode is active - used by the register-write endpoint so it
    doesn't need to know which mode is running."""
    return _rs485_driver


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
            await _maybe_prune_readings()
            await _maybe_check_disk()
            await _maybe_auto_backup()
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
    # Per-device gating (Etap 3.4) rather than one global interval for
    # every device: a device can set its own poll_interval_seconds (e.g. a
    # critical freezer polled every 10s, a less critical store room every
    # 60s to save bus time), falling back to KNOWN_SCAN_INTERVAL when unset.
    # Checking each device's due-ness is a cheap in-memory comparison; the
    # actual Modbus round trip only happens for devices that are due.
    if not _rs485_driver:
        return
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Device))
        devices = result.scalars().all()
        for device in devices:
            interval = device.poll_interval_seconds or settings.KNOWN_SCAN_INTERVAL
            if not _due(_last_known_scan.get(device.id), interval):
                continue
            _last_known_scan[device.id] = datetime.now(timezone.utc)
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

                await _track_offline_alarm(db, device, is_online)

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
                    await _check_hardware_alarms(db, device, readings_data)
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

            profile_id = None
            manufacturer = mock_info.get("manufacturer")
            recognition_status = "recognized"
            if manufacturer:
                profile_result = await db.execute(
                    select(DeviceProfile.id).where(DeviceProfile.manufacturer == manufacturer)
                )
                profile_id = profile_result.scalar_one_or_none()
                if profile_id is None:
                    # A manufacturer was reported but jawcold has no driver/
                    # profile for it - flag for the "unrecognized controller"
                    # UI flow instead of silently treating it as generic.
                    recognition_status = "unrecognized"

            device = Device(
                name=mock_info.get("name", f"Urządzenie #{addr}"),
                modbus_address=addr,
                profile_id=profile_id,
                status="online",
                recognition_status=recognition_status,
                detected_manufacturer=manufacturer if recognition_status == "unrecognized" else None,
                first_seen=datetime.now(timezone.utc),
                last_seen=datetime.now(timezone.utc),
            )
            db.add(device)
            await db.flush()
            log_message = (
                f"Wykryto nierozpoznany sterownik na adresie {addr} (zgłoszony producent: {manufacturer})"
                if recognition_status == "unrecognized"
                else f"Odkryto nowe urządzenie na adresie {addr}"
            )
            log = EventLog(event_type="device_discovered", device_id=device.id, message=log_message)
            db.add(log)
            await db.commit()
            await ws_manager.broadcast(ws_events.new_device_found(
                {"id": device.id, "name": device.name, "modbus_address": addr, "status": "online"}
            ))
            logger.info("New device discovered at address %d (recognition=%s)", addr, recognition_status)


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
                raw_temp = await _dallas_driver.read_temperature(rom_id)
                if raw_temp is not None:
                    temp = round(raw_temp + sensor.calibration_offset, 2)
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


def _evaluate_condition(rule: AlertRule, value: float) -> bool:
    if rule.condition == "gt" and rule.threshold_value is not None and value > rule.threshold_value:
        return True
    if rule.condition == "lt" and rule.threshold_value is not None and value < rule.threshold_value:
        return True
    if rule.threshold_min is not None and rule.threshold_max is not None:
        if value < rule.threshold_min or value > rule.threshold_max:
            return True
    return False


async def _check_alerts(db: AsyncSession, device_id, sensor_id, readings: dict):
    """Edge-triggered: one AlertEvent per rule per trigger, not one per scan
    cycle. A rule stays 'active' (resolved_at is NULL) for as long as the
    condition holds, so a 10-minute alarm produces one row with a duration,
    not ~600 duplicate rows at a 1s scan interval."""
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
            triggered = _evaluate_condition(rule, value)

            active_result = await db.execute(
                select(AlertEvent)
                .where(AlertEvent.rule_id == rule.id, AlertEvent.resolved_at.is_(None))
                .order_by(AlertEvent.timestamp.desc())
            )
            active_event = active_result.scalars().first()

            if triggered and not active_event:
                event = AlertEvent(
                    rule_id=rule.id,
                    device_id=device_id,
                    sensor_id=sensor_id,
                    value=value,
                    severity=rule.severity,
                    category=rule.category,
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
                    "category": rule.category,
                    "message": event.message,
                }))
                if rule.notify_channels:
                    await notifications.notify(
                        rule.notify_channels,
                        f"[JawcoldMonitor] ALARM: {rule.name}",
                        f"{event.message}\nWażność: {rule.severity} · Kategoria: {rule.category}",
                    )
            elif not triggered and active_event:
                active_event.resolved_at = datetime.now(timezone.utc)
                await db.commit()
                await ws_manager.broadcast(ws_events.alert_resolved(active_event.id, active_event.resolved_at.isoformat()))
            elif triggered and active_event:
                active_event.value = value
                await db.commit()
    except Exception as e:
        logger.warning("Alert check error: %s", e)


async def _check_hardware_alarms(db: AsyncSession, device: Device, readings: dict):
    """Distinct from _check_alerts(): that's threshold rules the user
    configured against parameter values. This reads the controller's own
    reported alarm/status register - Etap 3.3 - and surfaces what the
    device itself says is wrong (e.g. "E1: Awaria sondy B1"), alongside
    the threshold alarms, not instead of them. Edge-triggered the same way:
    logs once per code becoming active, once per code clearing, not every
    scan cycle a steady alarm stays up."""
    try:
        profile = getattr(device, "profile", None)
        if not profile or not profile.manufacturer:
            return
        alarm_register = next((r for r in profile.registers if r.is_alarm_register), None)
        if not alarm_register or alarm_register.name not in readings:
            return
        driver_cls = get_driver(profile.manufacturer)
        if not driver_cls:
            return

        raw_value = int(readings[alarm_register.name]["value"])
        active_alarms = decode_active_alarms(driver_cls(), raw_value)
        active_codes = {a.code for a in active_alarms}
        previously_active = _active_hw_alarms.get(device.id, set())

        newly_active = [a for a in active_alarms if a.code not in previously_active]
        newly_resolved = previously_active - active_codes

        for alarm in newly_active:
            db.add(EventLog(
                event_type="hardware_alarm_triggered",
                device_id=device.id,
                message=f"{device.name}: alarm sterownika {alarm.name} — {alarm.description}",
            ))
            await ws_manager.broadcast(ws_events.hardware_alarm(
                device.id, device.name, alarm.code, alarm.name, alarm.description, alarm.severity, "active",
            ))
            await notifications.notify_system(
                f"[JawcoldMonitor] Alarm sterownika: {device.name}",
                f"{device.name}: {alarm.name} — {alarm.description}",
            )
        if newly_resolved:
            # Codes alone are enough to log/broadcast a clear message even
            # though known_alarm_codes() would need a second lookup for
            # the human-readable name - keep this path cheap.
            db.add(EventLog(
                event_type="hardware_alarm_resolved",
                device_id=device.id,
                message=f"{device.name}: alarm sterownika ustąpił (kod {sorted(newly_resolved)})",
            ))
            await ws_manager.broadcast(ws_events.hardware_alarm(
                device.id, device.name, min(newly_resolved), "", "", "info", "resolved",
            ))

        if newly_active or newly_resolved:
            await db.commit()
        _active_hw_alarms[device.id] = active_codes
    except Exception as e:
        logger.warning("Hardware alarm check error device=%d: %s", device.id, e)


async def _track_offline_alarm(db: AsyncSession, device: Device, is_online: bool):
    """A device being offline for one scan is routine (bus collision, brief
    power dip); offline for OFFLINE_ALARM_MINUTES straight means a real
    problem - a dead controller in a working freezer looks exactly like
    this. Edge-triggered: one alarm when the threshold is crossed, one
    all-clear when the device comes back."""
    if settings.OFFLINE_ALARM_MINUTES <= 0:
        return
    now = datetime.now(timezone.utc)
    if is_online:
        _offline_since.pop(device.id, None)
        if device.id in _offline_alarmed:
            _offline_alarmed.discard(device.id)
            db.add(EventLog(
                event_type="device_offline_resolved",
                device_id=device.id,
                message=f"{device.name}: urządzenie ponownie online",
            ))
            await db.commit()
            await notifications.notify_system(
                f"[JawcoldMonitor] {device.name} ponownie online",
                f"Urządzenie {device.name} (adres {device.modbus_address}) wróciło do komunikacji.",
            )
        return

    since = _offline_since.setdefault(device.id, now)
    minutes = (now - since).total_seconds() / 60
    if minutes >= settings.OFFLINE_ALARM_MINUTES and device.id not in _offline_alarmed:
        _offline_alarmed.add(device.id)
        message = (
            f"{device.name}: brak komunikacji od {settings.OFFLINE_ALARM_MINUTES} min "
            f"(adres {device.modbus_address})"
        )
        db.add(EventLog(event_type="device_offline_alarm", device_id=device.id, message=message))
        await db.commit()
        await ws_manager.broadcast(ws_events.hardware_alarm(
            device.id, device.name, 0, "OFFLINE",
            f"Brak komunikacji od {settings.OFFLINE_ALARM_MINUTES} min", "critical", "active",
        ))
        await notifications.notify_system(f"[JawcoldMonitor] ALARM: {device.name} offline", message)


async def _maybe_check_disk():
    """SD card filling up is how a Pi deployment dies quietly: readings stop
    being written and Postgres eventually corrupts. One alarm when usage
    crosses DISK_ALARM_PERCENT, re-armed only after dropping 5 points below
    (hysteresis, so 89.9%/90.1% flapping doesn't spam)."""
    global _last_disk_check, _disk_alarmed
    if settings.DISK_ALARM_PERCENT <= 0:
        return
    if not _due(_last_disk_check, 300):
        return
    _last_disk_check = datetime.now(timezone.utc)
    try:
        stats = await get_system_stats()
        percent = float(stats.get("disk_percent", 0))
        if percent >= settings.DISK_ALARM_PERCENT and not _disk_alarmed:
            _disk_alarmed = True
            message = f"Dysk zapełniony w {percent:.0f}% (próg {settings.DISK_ALARM_PERCENT}%)"
            async with AsyncSessionLocal() as db:
                db.add(EventLog(event_type="disk_alarm", message=message))
                await db.commit()
            await notifications.notify_system("[JawcoldMonitor] ALARM: mało miejsca na dysku", message)
        elif percent < settings.DISK_ALARM_PERCENT - 5 and _disk_alarmed:
            _disk_alarmed = False
    except Exception as e:
        logger.warning("Disk check error: %s", e)


async def _maybe_auto_backup():
    """Periodic JSON backup - same payload as the manual Ustawienia backup -
    written to BACKUP_DIR, which a deployment should point at a mounted USB
    stick or network share so copies survive the SD card. Keeps the newest
    BACKUP_RETENTION_COUNT files."""
    global _last_auto_backup
    if not settings.BACKUP_AUTO_ENABLED:
        return
    if not _due(_last_auto_backup, settings.BACKUP_INTERVAL_HOURS * 3600):
        return
    _last_auto_backup = datetime.now(timezone.utc)
    from app.services.backup import export_backup
    try:
        backup_dir = Path(settings.BACKUP_DIR)
        backup_dir.mkdir(parents=True, exist_ok=True)
        async with AsyncSessionLocal() as db:
            payload = await export_backup(db)
            filename = backup_dir / f"jawcold_backup_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}.json"
            data = payload.model_dump_json(indent=2)
            await asyncio.to_thread(filename.write_text, data, "utf-8")

            # Retention: newest N by name (timestamped names sort correctly)
            existing = sorted(backup_dir.glob("jawcold_backup_*.json"))
            for old in existing[:-settings.BACKUP_RETENTION_COUNT]:
                await asyncio.to_thread(os.remove, old)

            db.add(EventLog(
                event_type="auto_backup",
                message=f"Automatyczna kopia zapasowa: {filename.name}",
            ))
            await db.commit()
        logger.info("Auto backup written: %s", filename)
    except Exception as e:
        logger.warning("Auto backup failed: %s", e)
        try:
            async with AsyncSessionLocal() as db:
                db.add(EventLog(event_type="auto_backup_failed", message=f"Błąd automatycznej kopii: {e}"))
                await db.commit()
        except Exception:
            pass
        await notifications.notify_system(
            "[JawcoldMonitor] Błąd automatycznej kopii zapasowej", str(e),
        )


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


async def _maybe_prune_readings():
    """Etap 3.4 (Raspberry Pi performance): readings accumulated to
    hundreds of thousands of rows within hours of testing in this session.
    Unbounded on a real deployment's SD card that fills the disk, not a
    hypothetical concern. READINGS_RETENTION_DAYS=0 disables this."""
    global _last_prune
    if settings.READINGS_RETENTION_DAYS <= 0:
        return
    if not _due(_last_prune, settings.READINGS_PRUNE_INTERVAL_SECONDS):
        return
    _last_prune = datetime.now(timezone.utc)
    cutoff = datetime.now(timezone.utc) - timedelta(days=settings.READINGS_RETENTION_DAYS)
    async with AsyncSessionLocal() as db:
        try:
            result = await db.execute(delete(Reading).where(Reading.timestamp < cutoff))
            await db.commit()
            if result.rowcount:
                logger.info("Usunięto %d starych odczytów (starszych niż %d dni)", result.rowcount, settings.READINGS_RETENTION_DAYS)
        except Exception as e:
            logger.warning("Readings prune error: %s", e)
