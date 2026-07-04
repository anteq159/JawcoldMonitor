import asyncio
import random
import math
from typing import Dict, List
from app.drivers.base import AbstractRS485Driver

MOCK_DEVICES = {
    1: {
        "name": "Regulator temperatury",
        "profile": "Temperature Controller",
        "parameters": [
            {"name": "Temperatura", "unit": "°C", "base": 22.0, "noise": 0.5},
            {"name": "Nastawa", "unit": "°C", "base": 21.0, "noise": 0.1},
            {"name": "Wyjście", "unit": "%", "base": 45.0, "noise": 5.0},
        ],
    },
    2: {
        "name": "Licznik energii",
        "profile": "Energy Meter",
        "parameters": [
            {"name": "Napięcie L1", "unit": "V", "base": 230.0, "noise": 2.0},
            {"name": "Napięcie L2", "unit": "V", "base": 230.5, "noise": 2.0},
            {"name": "Prąd L1", "unit": "A", "base": 4.2, "noise": 0.3},
            {"name": "Moc czynna", "unit": "kW", "base": 1.8, "noise": 0.2},
            {"name": "Energia", "unit": "kWh", "base": 1250.0, "noise": 0.01},
        ],
    },
    3: {
        "name": "Sterownik wentylacji",
        "profile": "HVAC Controller",
        "parameters": [
            {"name": "Temp. nawiewu", "unit": "°C", "base": 18.0, "noise": 0.8},
            {"name": "Temp. wywiewu", "unit": "°C", "base": 24.0, "noise": 0.5},
            {"name": "Prędkość wentylatora", "unit": "%", "base": 60.0, "noise": 3.0},
            {"name": "CO2", "unit": "ppm", "base": 650.0, "noise": 30.0},
            {"name": "Wilgotność", "unit": "%RH", "base": 55.0, "noise": 2.0},
        ],
    },
    4: {
        "name": "Czujnik CO2",
        "profile": "CO2 Sensor",
        "parameters": [
            {"name": "CO2", "unit": "ppm", "base": 480.0, "noise": 20.0},
            {"name": "Temperatura", "unit": "°C", "base": 23.5, "noise": 0.3},
            {"name": "Wilgotność", "unit": "%RH", "base": 48.0, "noise": 1.5},
        ],
    },
    5: {
        "name": "Przetwornik ciśnienia",
        "profile": "Pressure Transmitter",
        "parameters": [
            {"name": "Ciśnienie", "unit": "bar", "base": 2.5, "noise": 0.05},
            {"name": "Temperatura medium", "unit": "°C", "base": 45.0, "noise": 1.0},
        ],
    },
}

_counters: Dict[int, float] = {addr: 0.0 for addr in MOCK_DEVICES}


class MockRS485Driver(AbstractRS485Driver):
    def __init__(self):
        self._online: set = set(MOCK_DEVICES.keys())
        self._tick = 0

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
        result = {}
        for param in MOCK_DEVICES[addr]["parameters"]:
            drift = math.sin(t * 0.3) * param["noise"] * 0.5
            noise = random.gauss(0, param["noise"] * 0.3)
            value = round(param["base"] + drift + noise, 2)
            result[param["name"]] = {"value": value, "unit": param["unit"]}
        return result

    async def scan_range(self, start: int, end: int, known_addresses: set) -> List[int]:
        await asyncio.sleep(0.1)
        found = []
        for addr in range(start, end + 1):
            if addr in self._online and addr not in known_addresses:
                found.append(addr)
        return found

    def get_mock_device_info(self, address: int) -> dict:
        return MOCK_DEVICES.get(address, {})
