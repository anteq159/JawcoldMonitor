from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Dict, List, Optional


@dataclass
class RegisterMapEntry:
    """One row of a manufacturer's built-in, representative register map.
    Mirrors schemas.device_profile.RegisterDefinitionIn so it can be seeded
    straight into a DeviceProfile.

    register_type: which of the 4 distinct Modbus object types this
    address lives in - "holding" (function 3/6/16), "input" (function 4,
    read-only), "coil" (function 1/5/15, single bit), "discrete_input"
    (function 2, read-only single bit). Added when real Carel MPXone
    documentation showed this matters in practice - e.g. temperature
    readings there are Input Registers, not Holding Registers, and every
    manufacturer driver before that had implicitly assumed "holding" for
    everything. Writing to non-holding types isn't implemented yet (see
    modbus_rtu.py) since no current profile needs it."""
    address: int
    name: str
    unit: Optional[str] = None
    description: Optional[str] = None
    data_type: str = "uint16"
    scale_factor: float = 1.0
    writable: bool = False
    is_alarm_register: bool = False
    register_type: str = "holding"


@dataclass
class ControllerModel:
    model: str
    description: str = ""


@dataclass
class AlarmDescription:
    code: int
    name: str
    description: str
    severity: str = "warning"  # info | warning | critical


class AbstractControllerDriver(ABC):
    """Manufacturer-specific layer sitting above the transport (RS485/Modbus RTU
    today, Modbus TCP later). Each manufacturer implements this once; the
    DriverRegistry lets new manufacturers be added without touching core
    scanning/discovery code. Stage 1 is simulation-only per the project brief -
    identify()/simulate_reading() stand in for what would be real register
    reads once Stage 3 wires up actual hardware communication."""

    manufacturer: str = "Generic"

    @abstractmethod
    def default_register_map(self) -> List[RegisterMapEntry]:
        """Built-in, representative register map for this manufacturer's
        typical refrigeration controller. Demonstration data - a real
        deployment should verify against the manufacturer's own documentation
        before relying on these addresses against physical hardware."""
        ...

    @abstractmethod
    def identify(self, model_hint: Optional[str] = None) -> ControllerModel:
        """Representative model identification. In Stage 3 this becomes a
        real handshake/register read; for now it returns a plausible default."""
        ...

    @abstractmethod
    def decode_alarm(self, code: int) -> AlarmDescription:
        """Translate a manufacturer-specific alarm code into a description."""
        ...

    @abstractmethod
    def known_alarm_codes(self) -> List[AlarmDescription]:
        """Full reference table of alarm codes this driver knows how to decode."""
        ...

    @abstractmethod
    def simulate_reading(self, tick: float) -> Dict[str, dict]:
        """Plausible simulated parameter values (name -> {value, unit}) for
        demo/preview mode, keyed to the same names as default_register_map()."""
        ...


def _is_bitmask_style(codes: List[AlarmDescription]) -> bool:
    """True if every declared code is a power of two - i.e. the register is
    a bitmask where several alarms can be active at once (Carel/Carel MPX:
    1, 2, 4, 8, 16...), as opposed to a single small integer status code
    (Danfoss/Eliwell: 1, 2, 3, 4, 5...) where only one applies at a time."""
    return all(c.code > 0 and (c.code & (c.code - 1)) == 0 for c in codes)


def decode_active_alarms(driver: "AbstractControllerDriver", raw_value: int) -> List[AlarmDescription]:
    """Decode a controller's raw alarm/status register into whichever
    known alarms are actually active. Handles both conventions used across
    the four manufacturer drivers rather than assuming one: a bitmask
    register can have several simultaneous alarms (a plain equality check
    against known_alarm_codes() would report an unknown code the moment
    two bits are set together), a sequential-code register has at most
    one. Zero always means no active alarm."""
    if raw_value == 0:
        return []
    codes = driver.known_alarm_codes()
    if _is_bitmask_style(codes):
        matches = [c for c in codes if (c.code & raw_value) == c.code]
        if matches:
            return matches
    return [driver.decode_alarm(raw_value)]


class AbstractRS485Driver(ABC):
    @abstractmethod
    async def ping(self, address: int) -> bool: ...

    @abstractmethod
    async def read_parameters(self, device) -> Dict[str, dict]: ...

    @abstractmethod
    async def scan_range(self, start: int, end: int, known_addresses: set) -> List[int]: ...

    @abstractmethod
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
        """Write a new value to a writable register (e.g. a setpoint).
        register_address/data_type/scale_factor/register_type are the
        register's own metadata (from its DeviceProfile entry) - a real
        driver needs them to encode the value correctly; the mock driver
        ignores them and keys purely off register_name. Raise on failure -
        callers treat a normal return as success. A real driver should
        raise NotImplementedError for register_type != "holding" until
        coil/input writes are actually implemented, rather than silently
        writing to the wrong address space."""
        ...

    async def close(self) -> None:
        pass


class AbstractDallasDriver(ABC):
    @abstractmethod
    async def scan(self) -> List[str]: ...

    @abstractmethod
    async def read_temperature(self, rom_id: str) -> Optional[float]: ...
