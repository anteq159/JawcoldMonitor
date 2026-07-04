from typing import Dict, List, Optional, Type
from app.drivers.base import AbstractControllerDriver

_registry: Dict[str, Type[AbstractControllerDriver]] = {}


def register_driver(manufacturer: str):
    """Class decorator - adding a new manufacturer is a new module + this
    decorator, no changes to core scanning/discovery code."""
    def decorator(cls: Type[AbstractControllerDriver]):
        _registry[manufacturer] = cls
        return cls
    return decorator


def get_driver(manufacturer: str) -> Optional[Type[AbstractControllerDriver]]:
    return _registry.get(manufacturer)


def all_drivers() -> Dict[str, Type[AbstractControllerDriver]]:
    return dict(_registry)


def list_manufacturers() -> List[str]:
    return list(_registry.keys())
