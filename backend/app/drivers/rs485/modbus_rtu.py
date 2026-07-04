import asyncio
import logging
from typing import Dict, List
from app.drivers.base import AbstractRS485Driver

logger = logging.getLogger(__name__)


class ModbusRTUDriver(AbstractRS485Driver):
    def __init__(self, port: str, baudrate: int, timeout: float):
        self._port = port
        self._baudrate = baudrate
        self._timeout = timeout
        self._client = None
        self._lock = asyncio.Lock()
        self._connect()

    def _connect(self):
        try:
            from pymodbus.client import AsyncModbusSerialClient
            self._client = AsyncModbusSerialClient(
                port=self._port,
                baudrate=self._baudrate,
                timeout=self._timeout,
                parity="N",
                stopbits=1,
                bytesize=8,
            )
        except ImportError:
            logger.warning("pymodbus not installed — RS485 unavailable")
            self._client = None

    async def ping(self, address: int) -> bool:
        if not self._client:
            return False
        async with self._lock:
            try:
                if not self._client.connected:
                    await self._client.connect()
                r = await self._client.read_holding_registers(0, 1, slave=address)
                return not r.isError()
            except Exception:
                return False

    async def read_parameters(self, device) -> Dict[str, dict]:
        result = {}
        if not self._client or not device.parameters:
            return result
        async with self._lock:
            for param in device.parameters:
                if not param.enabled:
                    continue
                try:
                    r = await self._client.read_holding_registers(
                        param.register_address, 1, slave=device.modbus_address
                    )
                    if not r.isError():
                        raw = r.registers[0]
                        value = (raw * param.scale_factor) + param.offset
                        result[param.name] = {"value": round(value, 3), "unit": param.unit or ""}
                except Exception as e:
                    logger.debug("Read error addr=%d param=%s: %s", device.modbus_address, param.name, e)
        return result

    async def scan_range(self, start: int, end: int, known_addresses: set) -> List[int]:
        found = []
        for addr in range(start, end + 1):
            if addr in known_addresses:
                continue
            if await self.ping(addr):
                found.append(addr)
        return found

    async def close(self):
        if self._client and self._client.connected:
            self._client.close()
