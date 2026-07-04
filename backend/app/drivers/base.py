from abc import ABC, abstractmethod
from typing import Dict, List, Optional


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
