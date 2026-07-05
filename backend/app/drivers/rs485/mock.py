import asyncio
import random
import math
from typing import Dict, List
from app.drivers.base import AbstractRS485Driver
import app.drivers.manufacturers  # noqa: F401 - triggers manufacturer driver registration
from app.drivers.registry import get_driver

MOCK_DEVICES = {
    # Trimmed to 2 controllers (2026-07-05) so this test environment's
    # sample data matches what a lean real deployment would look like,
    # rather than the wider demo fleet from Etap 1. Kept one sequential-
    # alarm-code driver and one bitmask-alarm-code driver (Danfoss,
    # Carel MPX) so both paths through decode_active_alarms() still have
    # live coverage. Addresses kept as their original 1/6 rather than
    # renumbered, so existing discovered Device rows didn't need updating.
    1: {
        "name": "Chłodnia mroźnicza #1",
        "manufacturer": "Danfoss",
    },
    6: {
        "name": "Regał chłodniczy EEV #1",
        "manufacturer": "Carel MPX",
    },
}

_counters: Dict[int, float] = {addr: 0.0 for addr in MOCK_DEVICES}
_overrides: Dict[int, Dict[str, float]] = {}


def set_override(address: int, register_name: str, value: float) -> None:
    """Simulated register write - subsequent reads for this device/register
    return `value` instead of whatever simulate_reading() would compute,
    until overridden again. Mirrors what a real Modbus write would do to a
    holding register (it sticks until someone changes it again)."""
    _overrides.setdefault(address, {})[register_name] = value


class MockRS485Driver(AbstractRS485Driver):
    def __init__(self):
        self._online: set = set(MOCK_DEVICES.keys())

    async def ping(self, address: int) -> bool:
        await asyncio.sleep(0.01)
        return address in self._online

    async def read_parameters(self, device) -> Dict[str, dict]:
        await asyncio.sleep(0.02)
        addr = device.modbus_address
        if addr not in MOCK_DEVICES:
            return {}
        _counters[addr] = _counters.get(addr, 0) + 0.1
        t = _counters[addr]
        info = MOCK_DEVICES[addr]

        manufacturer = info.get("manufacturer")
        if manufacturer:
            driver_cls = get_driver(manufacturer)
            if driver_cls:
                result = driver_cls().simulate_reading(t)
                for name, value in _overrides.get(addr, {}).items():
                    if name in result:
                        result[name] = {"value": value, "unit": result[name].get("unit", "")}
                return result

        result = {}
        for param in info.get("parameters", []):
            drift = math.sin(t * 0.3) * param["noise"] * 0.5
            noise = random.gauss(0, param["noise"] * 0.3)
            value = round(param["base"] + drift + noise, 2)
            result[param["name"]] = {"value": value, "unit": param["unit"]}
        for name, value in _overrides.get(addr, {}).items():
            if name in result:
                result[name] = {"value": value, "unit": result[name].get("unit", "")}
        return result

    async def scan_range(self, start: int, end: int, known_addresses: set) -> List[int]:
        await asyncio.sleep(0.1)
        found = []
        for addr in range(start, end + 1):
            if addr in self._online and addr not in known_addresses:
                found.append(addr)
        return found

    async def write_register(
        self,
        modbus_address: int,
        register_address: int,
        register_name: str,
        value: float,
        data_type: str = "uint16",
        scale_factor: float = 1.0,
        register_type: str = "holding",
    ) -> None:
        set_override(modbus_address, register_name, value)

    def get_mock_device_info(self, address: int) -> dict:
        return MOCK_DEVICES.get(address, {})
