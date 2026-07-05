import asyncio
import random
import math
from typing import Dict, List
from app.drivers.base import AbstractRS485Driver
import app.drivers.manufacturers  # noqa: F401 - triggers manufacturer driver registration
from app.drivers.registry import get_driver

MOCK_DEVICES = {
    1: {
        "name": "Chłodnia mroźnicza #1",
        "manufacturer": "Danfoss",
    },
    2: {
        "name": "Witryna chłodnicza #1",
        "manufacturer": "Carel",
    },
    3: {
        "name": "Komora chłodnicza #1",
        "manufacturer": "Eliwell",
    },
    4: {
        "name": "Licznik energii",
        "manufacturer": None,
        "parameters": [
            {"name": "Napięcie L1", "unit": "V", "base": 230.0, "noise": 2.0},
            {"name": "Napięcie L2", "unit": "V", "base": 230.5, "noise": 2.0},
            {"name": "Prąd L1", "unit": "A", "base": 4.2, "noise": 0.3},
            {"name": "Moc czynna", "unit": "kW", "base": 1.8, "noise": 0.2},
            {"name": "Energia", "unit": "kWh", "base": 1250.0, "noise": 0.01},
        ],
    },
    5: {
        "name": "Przetwornik ciśnienia",
        "manufacturer": None,
        "parameters": [
            {"name": "Ciśnienie", "unit": "bar", "base": 2.5, "noise": 0.05},
            {"name": "Temperatura medium", "unit": "°C", "base": 45.0, "noise": 1.0},
        ],
    },
    6: {
        "name": "Regał chłodniczy EEV #1",
        "manufacturer": "Carel MPX",
    },
    7: {
        "name": "Sterownik nieznany #1",
        # Deliberately not a registered manufacturer - simulates a controller
        # answering on the bus whose brand/register map jawcold doesn't
        # recognize yet, so the discovery/recognition-status flow has a
        # real case to demonstrate.
        "manufacturer": "Unknown-XR2000",
        "parameters": [
            {"name": "Rejestr 0", "unit": "", "base": 512.0, "noise": 3.0},
            {"name": "Rejestr 1", "unit": "", "base": 88.0, "noise": 1.0},
        ],
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
    ) -> None:
        set_override(modbus_address, register_name, value)

    def get_mock_device_info(self, address: int) -> dict:
        return MOCK_DEVICES.get(address, {})
