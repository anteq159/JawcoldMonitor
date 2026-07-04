import math
import random
from typing import Dict, List, Optional

from app.drivers.base import AbstractControllerDriver, RegisterMapEntry, ControllerModel, AlarmDescription
from app.drivers.registry import register_driver


@register_driver("Carel")
class CarelDriver(AbstractControllerDriver):
    """Representative profile for a Carel IR33/pCO-series chilled display
    case controller. Demonstration register map for the Etap 1 simulation
    layer - verify against the specific model's official Modbus map before
    use against real hardware."""

    manufacturer = "Carel"

    def default_register_map(self) -> List[RegisterMapEntry]:
        return [
            RegisterMapEntry(address=100, name="Sonda B1 (komora)", unit="°C", data_type="int16", scale_factor=0.1),
            RegisterMapEntry(address=101, name="Sonda B2 (parownik)", unit="°C", data_type="int16", scale_factor=0.1),
            RegisterMapEntry(address=102, name="Nastawa", unit="°C", data_type="int16", scale_factor=0.1),
            RegisterMapEntry(address=103, name="Różnica załączania", unit="°C", data_type="int16", scale_factor=0.1),
            RegisterMapEntry(address=150, name="Wyjście sprężarki", data_type="uint16"),
            RegisterMapEntry(address=151, name="Wyjście odszraniania", data_type="uint16"),
            RegisterMapEntry(address=152, name="Wyjście wentylatora", data_type="uint16"),
            RegisterMapEntry(address=200, name="Rejestr alarmów", data_type="uint16"),
        ]

    def identify(self, model_hint: Optional[str] = None) -> ControllerModel:
        return ControllerModel(model=model_hint or "IR33 Universal", description="Sterownik chłodniczy Carel IR33")

    def known_alarm_codes(self) -> List[AlarmDescription]:
        return [
            AlarmDescription(code=1, name="E1", description="Awaria sondy B1", severity="critical"),
            AlarmDescription(code=2, name="E2", description="Awaria sondy B2", severity="critical"),
            AlarmDescription(code=4, name="HA", description="Alarm wysokiej temperatury", severity="warning"),
            AlarmDescription(code=8, name="LA", description="Alarm niskiej temperatury", severity="warning"),
            AlarmDescription(code=16, name="dA", description="Alarm drzwi", severity="info"),
        ]

    def decode_alarm(self, code: int) -> AlarmDescription:
        for alarm in self.known_alarm_codes():
            if alarm.code == code:
                return alarm
        return AlarmDescription(code=code, name=f"E{code}", description="Nieznany kod alarmu", severity="info")

    def simulate_reading(self, tick: float) -> Dict[str, dict]:
        room = round(4 + 1.5 * math.sin(tick * 0.07) + random.uniform(-0.2, 0.2), 1)
        evap = round(room - 5 + random.uniform(-0.4, 0.4), 1)
        return {
            "Sonda B1 (komora)": {"value": room, "unit": "°C"},
            "Sonda B2 (parownik)": {"value": evap, "unit": "°C"},
            "Nastawa": {"value": 4.0, "unit": "°C"},
            "Różnica załączania": {"value": 2.0, "unit": "°C"},
            "Wyjście sprężarki": {"value": 1 if room > 4 else 0, "unit": ""},
            "Wyjście odszraniania": {"value": 0, "unit": ""},
            "Wyjście wentylatora": {"value": 1, "unit": ""},
        }
