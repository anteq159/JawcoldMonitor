import asyncio
import logging
import struct
from typing import Dict, List
from app.core.config import settings
from app.drivers.base import AbstractRS485Driver

logger = logging.getLogger(__name__)

# Word order for 32-bit register pairs (uint32/int32/float32): high word
# first. Modbus itself does not standardize this - some devices send the
# low word first instead - so this is a real thing to verify per controller
# before trusting a 32-bit register. All four manufacturer register maps
# today only declare 16-bit types, so this path is genuinely untested even
# once real hardware is connected; it's here for correctness/completeness.
WORD_ORDER_HIGH_FIRST = True


def _register_count(data_type: str) -> int:
    return 2 if data_type in ("uint32", "int32", "float32") else 1


def _decode(registers: List[int], data_type: str) -> float:
    if data_type == "uint16":
        return float(registers[0])
    if data_type == "int16":
        raw = registers[0]
        return float(raw - 65536 if raw >= 32768 else raw)
    if data_type in ("uint32", "int32", "float32"):
        hi, lo = registers if WORD_ORDER_HIGH_FIRST else (registers[1], registers[0])
        combined = (hi << 16) | lo
        if data_type == "uint32":
            return float(combined)
        if data_type == "int32":
            return float(combined - 4294967296 if combined >= 2147483648 else combined)
        return struct.unpack(">f", struct.pack(">I", combined))[0]
    raise ValueError(f"Nieobsługiwany typ danych: {data_type}")


def _encode(value: float, data_type: str) -> List[int]:
    """Inverse of _decode - raw register word(s) to write for a given
    engineering value (already divided by scale_factor by the caller)."""
    if data_type in ("uint16", "int16"):
        return [int(round(value)) & 0xFFFF]
    if data_type in ("uint32", "int32"):
        raw = int(round(value)) & 0xFFFFFFFF
        hi, lo = (raw >> 16) & 0xFFFF, raw & 0xFFFF
        return [hi, lo] if WORD_ORDER_HIGH_FIRST else [lo, hi]
    if data_type == "float32":
        packed = struct.unpack(">I", struct.pack(">f", value))[0]
        hi, lo = (packed >> 16) & 0xFFFF, packed & 0xFFFF
        return [hi, lo] if WORD_ORDER_HIGH_FIRST else [lo, hi]
    raise ValueError(f"Nieobsługiwany typ danych: {data_type}")


def _is_bit_type(reg_type: str) -> bool:
    return reg_type in ("coil", "discrete_input")


def _span(batch: list, reg_type: str) -> tuple:
    """(start, count) covering a contiguous batch, in that type's units
    (bits for coil/discrete_input, 16-bit words otherwise)."""
    first, last = batch[0], batch[-1]
    last_width = 1 if _is_bit_type(reg_type) else _register_count(last.data_type)
    return first.address, last.address + last_width - first.address


def _plan_reads(registers, max_gap: int) -> List[dict]:
    """Turn a register map into as few Modbus requests as possible.

    Two levels of grouping, never mixing register_type (each type is a
    separate Modbus function code / address space - e.g. holding register
    1 and input register 1 are unrelated addresses that happen to share a
    number, not neighbors):

    1. Strictly contiguous registers form sub-batches (as before).
    2. Sub-batches of the same type separated by at most `max_gap` unused
       addresses are merged into one request - the words in the gap are
       read and thrown away. On real RS485 every request is a full round
       trip (~50-150ms with timeouts and turnaround), so one 26-word read
       beats six 2-4-word reads by a wide margin.

    Each plan entry keeps its `subbatches` so the caller can fall back to
    per-contiguous-block reads when a controller rejects a merged span
    (some devices answer IllegalDataAddress if any address in the span is
    unmapped)."""
    by_type: Dict[str, list] = {}
    for reg in registers:
        by_type.setdefault(reg.register_type, []).append(reg)

    plan: List[dict] = []
    for reg_type, group in by_type.items():
        is_bit = _is_bit_type(reg_type)
        # Stay well under protocol frame limits (125 words / 2000 bits).
        span_cap = 256 if is_bit else 100
        ordered = sorted(group, key=lambda r: r.address)

        subbatches: List[list] = []
        current: list = []
        next_expected = None
        for reg in ordered:
            width = 1 if is_bit else _register_count(reg.data_type)
            if current and reg.address == next_expected:
                current.append(reg)
            else:
                if current:
                    subbatches.append(current)
                current = [reg]
            next_expected = reg.address + width
        if current:
            subbatches.append(current)

        merged: List[List[list]] = []
        for batch in subbatches:
            b_start, b_count = _span(batch, reg_type)
            if merged and max_gap > 0:
                group_start = merged[-1][0][0].address
                last_start, last_count = _span(merged[-1][-1], reg_type)
                gap = b_start - (last_start + last_count)
                if 0 <= gap <= max_gap and (b_start + b_count - group_start) <= span_cap:
                    merged[-1].append(batch)
                    continue
            merged.append([batch])

        for grp in merged:
            start = grp[0][0].address
            last_start, last_count = _span(grp[-1], reg_type)
            plan.append({
                "type": reg_type,
                "start": start,
                "count": last_start + last_count - start,
                "regs": [r for b in grp for r in b],
                "subbatches": grp,
            })
    return plan


# pymodbus method name + response attribute per register_type. Coils and
# discrete inputs are always exactly 1 bit each - no data_type/word-count
# concept applies to them the way it does for registers.
_READ_METHOD = {
    "holding": "read_holding_registers",
    "input": "read_input_registers",
    "coil": "read_coils",
    "discrete_input": "read_discrete_inputs",
}


class ModbusRTUDriver(AbstractRS485Driver):
    def __init__(self, port: str, baudrate: int, timeout: float, stopbits: int = 1):
        self._port = port
        self._baudrate = baudrate
        self._timeout = timeout
        self._stopbits = stopbits
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
                stopbits=self._stopbits,
                bytesize=8,
            )
        except ImportError:
            logger.warning("pymodbus not installed — RS485 unavailable")
            self._client = None

    async def _ensure_connected(self) -> bool:
        # Must be called while holding self._lock: two coroutines (scanner
        # loop + /devices/discover endpoint) racing into connect() open the
        # serial port twice - the second open fails with "Could not
        # exclusively lock port" and the reconnect kills the request in
        # flight on the first.
        if not self._client:
            return False
        if not self._client.connected:
            await self._client.connect()
        return self._client.connected

    async def ping(self, address: int) -> bool:
        async with self._lock:
            if not await self._ensure_connected():
                return False
            try:
                r = await self._client.read_holding_registers(0, count=1, device_id=address)
                return not r.isError()
            except Exception:
                return False

    async def _read_span(self, unit: int, reg_type: str, start: int, count: int, regs: list, result: Dict[str, dict]) -> bool:
        """One Modbus request covering [start, start+count); decodes every
        register in `regs` by its address offset from `start` (gaps in a
        merged span simply aren't decoded). Returns False on any transport
        or protocol error so the caller can fall back to smaller reads.
        Must be called while holding self._lock."""
        is_bit = _is_bit_type(reg_type)
        method = getattr(self._client, _READ_METHOD[reg_type])
        try:
            r = await method(start, count=count, device_id=unit)
        except Exception as e:
            logger.debug("Read error addr=%d start=%d type=%s: %s", unit, start, reg_type, e)
            return False
        if r.isError():
            logger.debug("Read error addr=%d start=%d type=%s: %s", unit, start, reg_type, r)
            return False
        for reg in regs:
            offset = reg.address - start
            try:
                if is_bit:
                    result[reg.name] = {"value": 1.0 if r.bits[offset] else 0.0, "unit": reg.unit or ""}
                else:
                    width = _register_count(reg.data_type)
                    value = _decode(r.registers[offset:offset + width], reg.data_type) * reg.scale_factor
                    result[reg.name] = {"value": round(value, 3), "unit": reg.unit or ""}
            except (ValueError, IndexError) as e:
                logger.debug("Decode error addr=%d register=%s: %s", unit, reg.name, e)
        return True

    async def read_parameters(self, device) -> Dict[str, dict]:
        result: Dict[str, dict] = {}
        profile = getattr(device, "profile", None)
        if not profile or not profile.registers:
            return result

        # Read live so the Ustawienia edit applies on the next scan cycle.
        max_gap = max(0, int(getattr(settings, "MODBUS_BATCH_MAX_GAP", 8)))

        async with self._lock:
            if not await self._ensure_connected():
                return result
            for group in _plan_reads(profile.registers, max_gap):
                ok = await self._read_span(
                    device.modbus_address, group["type"], group["start"], group["count"], group["regs"], result,
                )
                if not ok and len(group["subbatches"]) > 1:
                    # The controller may reject a span crossing unmapped
                    # addresses - retry as the strictly contiguous blocks.
                    for sub in group["subbatches"]:
                        start, count = _span(sub, group["type"])
                        await self._read_span(device.modbus_address, group["type"], start, count, sub, result)
        return result

    async def scan_range(self, start: int, end: int, known_addresses: set) -> List[int]:
        found = []
        for addr in range(start, end + 1):
            if addr in known_addresses:
                continue
            if await self.ping(addr):
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
        if register_type != "holding":
            # No current profile has a writable coil/input register - real
            # MPXone data does have some (e.g. PMP, manual valve
            # positioning), but writing to the wrong Modbus object type
            # silently would be worse than refusing outright.
            raise NotImplementedError(
                f"Zapis do rejestru typu '{register_type}' nie jest jeszcze obsługiwany"
            )
        raw_value = value / scale_factor if scale_factor else value
        try:
            words = _encode(raw_value, data_type)
        except ValueError:
            raise
        except OverflowError as e:
            raise ValueError(f"Wartość {value} nie mieści się w rejestrze typu {data_type}") from e

        async with self._lock:
            if not await self._ensure_connected():
                raise ConnectionError(f"Brak połączenia z portem {self._port}")
            try:
                if len(words) == 1:
                    r = await self._client.write_register(register_address, words[0], device_id=modbus_address)
                else:
                    r = await self._client.write_registers(register_address, words, device_id=modbus_address)
            except Exception as e:
                raise ConnectionError(f"Błąd komunikacji przy zapisie rejestru {register_address}: {e}") from e

            if r.isError():
                raise ValueError(f"Sterownik odrzucił zapis rejestru {register_address}: {r}")

            # Write-verify: read the register straight back rather than
            # trusting a real controller silently applied the value. This is
            # real refrigeration equipment, not the mock driver's in-memory
            # override - a rejected or partially-applied write should be
            # loud, not a false "success" toast in the UI.
            try:
                verify = await self._client.read_holding_registers(
                    register_address, count=_register_count(data_type), device_id=modbus_address
                )
            except Exception:
                logger.warning(
                    "Zapis rejestru %d (urządzenie %d) wysłany, ale odczyt weryfikujący nie powiódł się",
                    register_address, modbus_address,
                )
                return

            if verify.isError():
                logger.warning(
                    "Zapis rejestru %d (urządzenie %d) wysłany, ale odczyt weryfikujący zwrócił błąd",
                    register_address, modbus_address,
                )
                return

            actual = _decode(verify.registers, data_type) * scale_factor
            tolerance = abs(scale_factor) if scale_factor else 0.5
            if abs(actual - value) > tolerance:
                raise ValueError(
                    f"Zapis nie został potwierdzony: ustawiono {value}, sterownik zwraca {round(actual, 3)}"
                )

    async def close(self):
        if self._client and self._client.connected:
            self._client.close()
