import asyncio
import random
import math
from typing import List, Optional
from app.drivers.base import AbstractDallasDriver

# Trimmed to 2 (2026-07-05) to match the lean 2-controller test set - see
# app/drivers/rs485/mock.py.
MOCK_SENSORS = [
    {"rom_id": "28-0000001a2b3c", "name": "Czujnik serwerowni", "base": 19.5, "noise": 0.3},
    {"rom_id": "28-0000002d4e5f", "name": "Czujnik magazynu", "base": 14.0, "noise": 0.8},
]

_ticks: dict = {s["rom_id"]: 0.0 for s in MOCK_SENSORS}


class MockDallasDriver(AbstractDallasDriver):
    async def scan(self) -> List[str]:
        await asyncio.sleep(0.05)
        return [s["rom_id"] for s in MOCK_SENSORS]

    async def read_temperature(self, rom_id: str) -> Optional[float]:
        await asyncio.sleep(0.03)
        sensor = next((s for s in MOCK_SENSORS if s["rom_id"] == rom_id), None)
        if not sensor:
            return None
        _ticks[rom_id] = _ticks.get(rom_id, 0.0) + 0.15
        t = _ticks[rom_id]
        drift = math.sin(t * 0.2) * sensor["noise"]
        noise = random.gauss(0, sensor["noise"] * 0.2)
        return round(sensor["base"] + drift + noise, 2)

    def get_mock_sensor_info(self, rom_id: str) -> dict:
        return next((s for s in MOCK_SENSORS if s["rom_id"] == rom_id), {})
