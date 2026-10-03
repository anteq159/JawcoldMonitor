from datetime import datetime, timezone
from typing import Dict

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.app_setting import AppSetting
from app.models.bus_line import BusLine
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
    BackupLine,
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

    lines = (await db.execute(select(BusLine).order_by(BusLine.id))).scalars().all()
    stored_settings = (await db.execute(select(AppSetting))).scalars().all()

    from app.services.runtime_settings import EDITABLE_SETTINGS
    default_line = lines[0].id if lines else None
    line_name_by_id = {line.id: line.name for line in lines}
    profile_name_by_id = {p.id: p.name for p in profiles}
    device_addr_by_id = {d.id: d.modbus_address for d in devices}
    device_line_by_id = {d.id: line_name_by_id.get(d.line_id or default_line) for d in devices}
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
                customized=bool(p.customized),
                registers=[
                    BackupRegister(
                        address=r.address, name=r.name, unit=r.unit,
                        description=r.description, data_type=r.data_type, scale_factor=r.scale_factor,
                        register_type=r.register_type, writable=r.writable,
                        is_alarm_register=r.is_alarm_register, category=r.category, bit=r.bit,
                    )
                    for r in p.registers
                ],
            )
            for p in profiles
        ],
        lines=[
            BackupLine(
                name=line.name, port=line.port, baudrate=line.baudrate,
                parity=line.parity, stopbits=line.stopbits, enabled=line.enabled,
            )
            for line in lines
        ],
        settings={
            row.key: row.value for row in stored_settings
            if row.key in EDITABLE_SETTINGS and not EDITABLE_SETTINGS[row.key].secret
        },
        devices=[
            BackupDevice(
                name=d.name, modbus_address=d.modbus_address,
                line_name=device_line_by_id.get(d.id),
                profile_name=profile_name_by_id.get(d.profile_id) if d.profile_id else None,
                location=d.location, group_name=d.group_name, description=d.description,
                poll_interval_seconds=d.poll_interval_seconds,
                hidden_parameters=d.hidden_parameters or [],
                parameter_aliases=d.parameter_aliases or {},
                parameter_units=d.parameter_units or {},
                card_parameters=d.card_parameters or [],
                chart_hidden_parameters=d.chart_hidden_parameters or [],
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
                device_line_name=device_line_by_id.get(r.device_id) if r.device_id else None,
                sensor_rom_id=sensor_rom_by_id.get(r.sensor_id) if r.sensor_id else None,
                parameter_name=r.parameter_name, condition=r.condition,
                threshold_value=r.threshold_value, threshold_min=r.threshold_min, threshold_max=r.threshold_max,
                severity=r.severity, category=r.category, enabled=r.enabled,
                notify_channels=r.notify_channels or [],
                delay_seconds=r.delay_seconds or 0,
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
                position=i, address=r.address, name=r.name, unit=r.unit,
                description=r.description, data_type=r.data_type, scale_factor=r.scale_factor,
                register_type=r.register_type, writable=r.writable,
                is_alarm_register=r.is_alarm_register, category=r.category, bit=r.bit,
            )
            for i, r in enumerate(bp.registers)
        ]
        if profile and profile.source == "builtin" and not bp.customized:
            # An untouched built-in profile: the installed version's map
            # (possibly newer than the one in the file) stays.
            profile_id_by_name[bp.name] = profile.id
            continue
        if profile:
            profile.manufacturer = bp.manufacturer
            profile.model = bp.model
            profile.description = bp.description
            profile.customized = bp.customized or profile.source != "builtin"
            profile.registers = registers
            summary.profiles_updated += 1
        else:
            profile = DeviceProfile(
                name=bp.name, manufacturer=bp.manufacturer, model=bp.model,
                description=bp.description, source=bp.source, customized=bp.customized, registers=registers,
            )
            db.add(profile)
            summary.profiles_created += 1
        await db.flush()
        profile_id_by_name[bp.name] = profile.id

    # RS485 lines by name. An existing line keeps its port: a backup taken
    # on another Raspberry may name a different adapter path.
    line_id_by_name: Dict[str, int] = {}
    for bl in payload.lines:
        line = (await db.execute(select(BusLine).where(BusLine.name == bl.name))).scalar_one_or_none()
        if line:
            line.baudrate, line.parity, line.stopbits, line.enabled = bl.baudrate, bl.parity, bl.stopbits, bl.enabled
            summary.lines_updated += 1
        else:
            port_taken = await db.scalar(select(BusLine.id).where(BusLine.port == bl.port))
            line = BusLine(
                name=bl.name, port=bl.port if not port_taken else f"{bl.port} (do ustawienia)",
                baudrate=bl.baudrate, parity=bl.parity, stopbits=bl.stopbits,
                # a line restored without its own port stays off until set
                enabled=bl.enabled and not port_taken,
            )
            db.add(line)
            summary.lines_created += 1
        await db.flush()
        line_id_by_name[bl.name] = line.id
    first_line = await db.scalar(select(BusLine.id).order_by(BusLine.id).limit(1))

    def line_of(name):
        return line_id_by_name.get(name) if name else first_line

    device_id_by_key: Dict[tuple, int] = {}
    all_devices = (await db.execute(select(Device))).scalars().all()
    for bd in payload.devices:
        line_id = line_of(bd.line_name) or first_line
        device = next(
            (d for d in all_devices if d.modbus_address == bd.modbus_address and (d.line_id or first_line) == line_id),
            None,
        )
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
        display = dict(
            poll_interval_seconds=bd.poll_interval_seconds,
            hidden_parameters=bd.hidden_parameters, parameter_aliases=bd.parameter_aliases,
            parameter_units=bd.parameter_units, card_parameters=bd.card_parameters,
            chart_hidden_parameters=bd.chart_hidden_parameters,
        )
        if device:
            device.name = bd.name
            device.profile_id = profile_id
            device.line_id = line_id
            device.location = bd.location
            device.group_name = bd.group_name
            device.description = bd.description
            device.parameters = parameters
            for key, value in display.items():
                setattr(device, key, value)
            summary.devices_updated += 1
        else:
            device = Device(
                name=bd.name, modbus_address=bd.modbus_address, line_id=line_id,
                profile_id=profile_id, location=bd.location, group_name=bd.group_name,
                description=bd.description, status="unknown", parameters=parameters, **display,
            )
            db.add(device)
            all_devices.append(device)
            summary.devices_created += 1
        await db.flush()
        device_id_by_key[(line_id, bd.modbus_address)] = device.id

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
        device_id = (
            device_id_by_key.get((line_of(br.device_line_name) or first_line, br.device_modbus_address))
            if br.device_modbus_address else None
        )
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
            rule.delay_seconds = br.delay_seconds
            summary.rules_updated += 1
        else:
            rule = AlertRule(
                name=br.name, device_id=device_id, sensor_id=sensor_id, parameter_name=br.parameter_name,
                condition=br.condition, threshold_value=br.threshold_value, threshold_min=br.threshold_min,
                threshold_max=br.threshold_max, severity=br.severity, category=br.category,
                enabled=br.enabled, notify_channels=br.notify_channels, delay_seconds=br.delay_seconds,
            )
            db.add(rule)
            summary.rules_created += 1

    from app.services.runtime_settings import EDITABLE_SETTINGS, save_setting
    for key, value in payload.settings.items():
        meta = EDITABLE_SETTINGS.get(key)
        if not meta or meta.secret:
            continue
        try:
            await save_setting(db, key, value)
            summary.settings_restored += 1
        except ValueError:
            pass  # a value this version no longer accepts - keep the current one

    await db.commit()
    return summary
