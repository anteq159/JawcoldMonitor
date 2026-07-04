from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Dict, List, Optional


@dataclass
class RegisterMapEntry:
    """One row of a manufacturer's built-in, representative register map.
    Mirrors schemas.device_profile.RegisterDefinitionIn so it can be seeded
    straight into a DeviceProfile."""
    address: int
    name: str
    unit: Optional[str] = None
    description: Optional[str] = None
    data_type: str = "uint16"
    scale_factor: float = 1.0


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


class AbstractRS485Driver(ABC):
    @abstractmethod
    async def ping(self, address: int) -> bool: ...

    @abstractmethod
    async def read_parameters(self, device) -> Dict[str, dict]: ...

    @abstractmethod
    async def scan_range(self, start: int, end: int, known_addresses: set) -> List[int]: ...

    async def close(self) -> None:
        pass


class AbstractDallasDriver(ABC):
    @abstractmethod
    async def scan(self) -> List[str]: ...

    @abstractmethod
    async def read_temperature(self, rom_id: str) -> Optional[float]: ...
