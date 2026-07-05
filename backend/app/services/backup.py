from datetime import datetime, timezone
from typing import Dict

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.device import Device
from app.models.device_profile import DeviceProfile, RegisterDefinition
from app.models.parameter import DeviceParameter
from app.models.sensor import Sensor
from app.models.alert import AlertRule
from app.schemas.backup import (
    BackupPayload,
    BackupProfile,
    BackupRegister,
    BackupDevice,
    BackupParameter,
    BackupSensor,
    BackupAlertRule,
    RestoreSummary,
)

# Deliberately excluded from backup/restore: users/roles/permissions (never
# ship credentials in a downloadable file), reading/event history (not
# "configuration", and far too large), floor map image binaries.


async def export_backup(db: AsyncSession) -> BackupPayload:
    profiles = (await db.execute(select(DeviceProfile))).scalars().all()
    devices = (await db.execute(select(Device))).scalars().all()
    sensors = (await db.execute(select(Sensor))).scalars().all()
    rules = (await db.execute(select(AlertRule))).scalars().all()

    profile_name_by_id = {p.id: p.name for p in profiles}
    device_addr_by_id = {d.id: d.modbus_address for d in devices}
    sensor_rom_by_id = {s.id: s.rom_id for s in sensors}

    return BackupPayload(
        exported_at=datetime.now(timezone.utc).isoformat(),
        device_profiles=[
            BackupProfile(
                name=p.name,
                manufacturer=p.manufacturer,
                model=p.model,
                description=p.description,
                source=p.source,
                registers=[
                    BackupRegister(
                        address=r.address, name=r.name, unit=r.unit,
                        description=r.description, data_type=r.data_type, scale_factor=r.scale_factor,
                    )
                    for r in p.registers
                ],
            )
            for p in profiles
        ],
        devices=[
            BackupDevice(
                name=d.name, modbus_address=d.modbus_address, port=d.port,
                baudrate=d.baudrate, parity=d.parity, stopbits=d.stopbits, timeout=d.timeout,
                profile_name=profile_name_by_id.get(d.profile_id) if d.profile_id else None,
                location=d.location, group_name=d.group_name, description=d.description,
                parameters=[
                    BackupParameter(
                        name=p.name, unit=p.unit, description=p.description,
                        register_address=p.register_address, register_type=p.register_type,
                        data_type=p.data_type, scale_factor=p.scale_factor, offset=p.offset,
                        threshold_min=p.threshold_min, threshold_max=p.threshold_max, enabled=p.enabled,
                    )
                    for p in d.parameters
                ],
            )
            for d in devices
        ],
        sensors=[
            BackupSensor(
                rom_id=s.rom_id, name=s.name, sensor_type=s.sensor_type,
                location=s.location, room=s.room, description=s.description,
                calibration_offset=s.calibration_offset,
            )
            for s in sensors
        ],
        alert_rules=[
            BackupAlertRule(
                name=r.name,
                device_modbus_address=device_addr_by_id.get(r.device_id) if r.device_id else None,
                sensor_rom_id=sensor_rom_by_id.get(r.sensor_id) if r.sensor_id else None,
                parameter_name=r.parameter_name, condition=r.condition,
                threshold_value=r.threshold_value, threshold_min=r.threshold_min, threshold_max=r.threshold_max,
                severity=r.severity, category=r.category, enabled=r.enabled,
                notify_channels=r.notify_channels or [],
            )
            for r in rules
        ],
    )


async def import_backup(db: AsyncSession, payload: BackupPayload) -> RestoreSummary:
    """Upsert-by-natural-key restore, all in one transaction (only commits at
    the end) so a bad file never leaves the database half-updated."""
    summary = RestoreSummary()

    profile_id_by_name: Dict[str, int] = {}
    for bp in payload.device_profiles:
        result = await db.execute(select(DeviceProfile).where(DeviceProfile.name == bp.name))
        profile = result.scalar_one_or_none()
        registers = [
            RegisterDefinition(
                address=r.address, name=r.name, unit=r.unit,
                description=r.description, data_type=r.data_type, scale_factor=r.scale_factor,
            )
            for r in bp.registers
        ]
        if profile:
            profile.manufacturer = bp.manufacturer
            profile.model = bp.model
            profile.description = bp.description
            profile.registers = registers
            summary.profiles_updated += 1
        else:
            profile = DeviceProfile(
                name=bp.name, manufacturer=bp.manufacturer, model=bp.model,
                description=bp.description, source=bp.source, registers=registers,
            )
            db.add(profile)
            summary.profiles_created += 1
        await db.flush()
        profile_id_by_name[bp.name] = profile.id

    device_id_by_addr: Dict[int, int] = {}
    for bd in payload.devices:
        result = await db.execute(select(Device).where(Device.modbus_address == bd.modbus_address))
        device = result.scalar_one_or_none()
        profile_id = profile_id_by_name.get(bd.profile_name) if bd.profile_name else None
        parameters = [
            DeviceParameter(
                name=p.name, unit=p.unit, description=p.description,
                register_address=p.register_address, register_type=p.register_type,
                data_type=p.data_type, scale_factor=p.scale_factor, offset=p.offset,
                threshold_min=p.threshold_min, threshold_max=p.threshold_max, enabled=p.enabled,
            )
            for p in bd.parameters
        ]
        if device:
            device.name = bd.name
            device.port = bd.port
            device.baudrate = bd.baudrate
            device.parity = bd.parity
            device.stopbits = bd.stopbits
            device.timeout = bd.timeout
            device.profile_id = profile_id
            device.location = bd.location
            device.group_name = bd.group_name
            device.description = bd.description
            device.parameters = parameters
            summary.devices_updated += 1
        else:
            device = Device(
                name=bd.name, modbus_address=bd.modbus_address, port=bd.port,
                baudrate=bd.baudrate, parity=bd.parity, stopbits=bd.stopbits, timeout=bd.timeout,
                profile_id=profile_id, location=bd.location, group_name=bd.group_name,
                description=bd.description, status="unknown", parameters=parameters,
            )
            db.add(device)
            summary.devices_created += 1
        await db.flush()
        device_id_by_addr[bd.modbus_address] = device.id

    sensor_id_by_rom: Dict[str, int] = {}
    for bs in payload.sensors:
        result = await db.execute(select(Sensor).where(Sensor.rom_id == bs.rom_id))
        sensor = result.scalar_one_or_none()
        if sensor:
            sensor.name = bs.name
            sensor.sensor_type = bs.sensor_type
            sensor.location = bs.location
            sensor.room = bs.room
            sensor.description = bs.description
            sensor.calibration_offset = bs.calibration_offset
            summary.sensors_updated += 1
        else:
            sensor = Sensor(
                rom_id=bs.rom_id, name=bs.name, sensor_type=bs.sensor_type,
                location=bs.location, room=bs.room, description=bs.description,
                calibration_offset=bs.calibration_offset, status="unknown",
            )
            db.add(sensor)
            summary.sensors_created += 1
        await db.flush()
        sensor_id_by_rom[bs.rom_id] = sensor.id

    for br in payload.alert_rules:
        result = await db.execute(select(AlertRule).where(AlertRule.name == br.name))
        rule = result.scalar_one_or_none()
        device_id = device_id_by_addr.get(br.device_modbus_address) if br.device_modbus_address else None
        sensor_id = sensor_id_by_rom.get(br.sensor_rom_id) if br.sensor_rom_id else None
        if rule:
            rule.device_id = device_id
            rule.sensor_id = sensor_id
            rule.parameter_name = br.parameter_name
            rule.condition = br.condition
            rule.threshold_value = br.threshold_value
            rule.threshold_min = br.threshold_min
            rule.threshold_max = br.threshold_max
            rule.severity = br.severity
            rule.category = br.category
            rule.enabled = br.enabled
            rule.notify_channels = br.notify_channels
            summary.rules_updated += 1
        else:
            rule = AlertRule(
                name=br.name, device_id=device_id, sensor_id=sensor_id, parameter_name=br.parameter_name,
                condition=br.condition, threshold_value=br.threshold_value, threshold_min=br.threshold_min,
                threshold_max=br.threshold_max, severity=br.severity, category=br.category,
                enabled=br.enabled, notify_channels=br.notify_channels,
            )
            db.add(rule)
            summary.rules_created += 1

    await db.commit()
    return summary
