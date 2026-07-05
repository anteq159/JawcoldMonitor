import asyncio
import os
from typing import List, Optional
from app.drivers.base import AbstractDallasDriver


class W1DallasDriver(AbstractDallasDriver):
    W1_BASE = "/sys/bus/w1/devices"

    async def scan(self) -> List[str]:
        return await asyncio.get_event_loop().run_in_executor(None, self._scan_sync)

    def _scan_sync(self) -> List[str]:
        try:
            entries = os.listdir(self.W1_BASE)
            return [e for e in entries if e.startswith("28-")]
        except FileNotFoundError:
            return []

    async def read_temperature(self, rom_id: str) -> Optional[float]:
        return await asyncio.get_event_loop().run_in_executor(None, self._read_sync, rom_id)

    def _read_sync(self, rom_id: str) -> Optional[float]:
        try:
            path = os.path.join(self.W1_BASE, rom_id, "w1_slave")
            with open(path) as f:
                content = f.read()
            if "YES" not in content:
                return None
            idx = content.index("t=")
            raw = int(content[idx + 2:].strip())
            return round(raw / 1000.0, 2)
        except Exception:
            return None
