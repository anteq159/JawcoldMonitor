import math
import random
from typing import Dict, List, Optional

from app.drivers.base import AbstractControllerDriver, RegisterMapEntry, ControllerModel, AlarmDescription
from app.drivers.registry import register_driver


@register_driver("Eliwell EWPC 021")
class EliwellEwpc021Driver(AbstractControllerDriver):
    """Representative profile for an Eliwell EWPC 021 - a simple,
    entry-level single-stage cabinet controller (no evaporator probe,
    defrost, or fan output, unlike the ID961/IDPlus-series profile).
    Register addresses are plausible demonstration values - verify against
    the specific model's official Modbus documentation before use against
    real hardware."""

    manufacturer = "Eliwell EWPC 021"

    def default_register_map(self) -> List[RegisterMapEntry]:
        return [
            RegisterMapEntry(address=0, name="Temperatura kabiny", unit="°C", data_type="int16", scale_factor=0.1),
            RegisterMapEntry(address=2, name="Nastawa", unit="°C", data_type="int16", scale_factor=0.1, writable=True),
            RegisterMapEntry(address=3, name="Histereza", unit="°C", data_type="int16", scale_factor=0.1, writable=True),
            RegisterMapEntry(address=30, name="Sprężarka", data_type="uint16"),
            RegisterMapEntry(address=40, name="Kod alarmu", data_type="uint16", is_alarm_register=True),
        ]

    def identify(self, model_hint: Optional[str] = None) -> ControllerModel:
        return ControllerModel(model=model_hint or "EWPC 021", description="Prosty sterownik chłodniczy Eliwell EWPC 021")

    def known_alarm_codes(self) -> List[AlarmDescription]:
        return [
            AlarmDescription(code=1, name="P1", description="Awaria sondy kabiny", severity="critical"),
            AlarmDescription(code=3, name="AH", description="Alarm wysokiej temperatury", severity="warning"),
        ]

    def decode_alarm(self, code: int) -> AlarmDescription:
        for alarm in self.known_alarm_codes():
            if alarm.code == code:
                return alarm
        return AlarmDescription(code=code, name=f"P{code}", description="Nieznany kod alarmu", severity="info")

    def simulate_reading(self, tick: float) -> Dict[str, dict]:
        room = round(3 + 1.2 * math.sin(tick * 0.06) + random.uniform(-0.25, 0.25), 1)
        return {
            "Temperatura kabiny": {"value": room, "unit": "°C"},
            "Nastawa": {"value": 3.0, "unit": "°C"},
            "Histereza": {"value": 1.5, "unit": "°C"},
            "Sprężarka": {"value": 1 if room > 3 else 0, "unit": ""},
            "Kod alarmu": {"value": 0, "unit": ""},
        }
