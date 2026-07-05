import math
import random
from typing import Dict, List, Optional

from app.drivers.base import AbstractControllerDriver, RegisterMapEntry, ControllerModel, AlarmDescription
from app.drivers.registry import register_driver


@register_driver("Eliwell IDNext")
class EliwellIdNextDriver(AbstractControllerDriver):
    """Representative profile for an Eliwell IDNext - the newer-generation
    successor to the ID Plus series, with richer defrost/fan control and
    HACCP-style alarm event counting on top of the base ID961/IDPlus-series
    profile's feature set. Register addresses are plausible demonstration
    values - verify against the specific model's official Modbus
    documentation before use against real hardware."""

    manufacturer = "Eliwell IDNext"

    def default_register_map(self) -> List[RegisterMapEntry]:
        return [
            RegisterMapEntry(address=0, name="Temperatura kabiny", unit="°C", data_type="int16", scale_factor=0.1),
            RegisterMapEntry(address=1, name="Temperatura parownika", unit="°C", data_type="int16", scale_factor=0.1),
            RegisterMapEntry(address=2, name="Nastawa", unit="°C", data_type="int16", scale_factor=0.1, writable=True),
            RegisterMapEntry(address=3, name="Histereza", unit="°C", data_type="int16", scale_factor=0.1, writable=True),
            RegisterMapEntry(address=30, name="Sprężarka", data_type="uint16"),
            RegisterMapEntry(address=31, name="Odszranianie", data_type="uint16"),
            RegisterMapEntry(address=32, name="Wentylator", data_type="uint16"),
            RegisterMapEntry(address=33, name="Alarm drzwi", data_type="uint16"),
            RegisterMapEntry(address=50, name="Licznik alarmów HACCP", data_type="uint16"),
            RegisterMapEntry(address=40, name="Kod alarmu", data_type="uint16", is_alarm_register=True),
        ]

    def identify(self, model_hint: Optional[str] = None) -> ControllerModel:
        return ControllerModel(model=model_hint or "IDNext", description="Zaawansowany sterownik chłodniczy Eliwell IDNext z rejestracją HACCP")

    def known_alarm_codes(self) -> List[AlarmDescription]:
        return [
            AlarmDescription(code=1, name="P1", description="Awaria sondy kabiny", severity="critical"),
            AlarmDescription(code=2, name="P2", description="Awaria sondy parownika", severity="critical"),
            AlarmDescription(code=3, name="AH", description="Alarm wysokiej temperatury", severity="warning"),
            AlarmDescription(code=4, name="AL", description="Alarm niskiej temperatury", severity="warning"),
            AlarmDescription(code=5, name="dor", description="Drzwi otwarte", severity="info"),
            AlarmDescription(code=6, name="HA", description="Zdarzenie HACCP zarejestrowane", severity="warning"),
        ]

    def decode_alarm(self, code: int) -> AlarmDescription:
        for alarm in self.known_alarm_codes():
            if alarm.code == code:
                return alarm
        return AlarmDescription(code=code, name=f"P{code}", description="Nieznany kod alarmu", severity="info")

    def simulate_reading(self, tick: float) -> Dict[str, dict]:
        room = round(1 + 1.3 * math.sin(tick * 0.06) + random.uniform(-0.25, 0.25), 1)
        evap = round(room - 5 + random.uniform(-0.4, 0.4), 1)
        return {
            "Temperatura kabiny": {"value": room, "unit": "°C"},
            "Temperatura parownika": {"value": evap, "unit": "°C"},
            "Nastawa": {"value": 1.0, "unit": "°C"},
            "Histereza": {"value": 1.5, "unit": "°C"},
            "Sprężarka": {"value": 1 if room > 1 else 0, "unit": ""},
            "Odszranianie": {"value": 0, "unit": ""},
            "Wentylator": {"value": 1, "unit": ""},
            "Alarm drzwi": {"value": 0, "unit": ""},
            "Licznik alarmów HACCP": {"value": 0, "unit": ""},
            "Kod alarmu": {"value": 0, "unit": ""},
        }
