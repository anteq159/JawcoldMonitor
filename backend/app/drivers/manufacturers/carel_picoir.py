import math
import random
from typing import Dict, List, Optional

from app.drivers.base import AbstractControllerDriver, RegisterMapEntry, ControllerModel, AlarmDescription
from app.drivers.registry import register_driver


@register_driver("Carel PicoIR")
class CarelPicoIrDriver(AbstractControllerDriver):
    """Representative profile for a Carel PicoIR - a compact, entry-level
    single-relay thermostat controller (no evaporator probe or defrost
    management, unlike the IR33-series profile). Register addresses are
    plausible demonstration values - verify against the specific model's
    official Modbus documentation before use against real hardware."""

    manufacturer = "Carel PicoIR"

    def default_register_map(self) -> List[RegisterMapEntry]:
        return [
            RegisterMapEntry(address=100, name="Sonda B1 (komora)", unit="°C", data_type="int16", scale_factor=0.1),
            RegisterMapEntry(address=102, name="Nastawa", unit="°C", data_type="int16", scale_factor=0.1, writable=True),
            RegisterMapEntry(address=150, name="Wyjście sprężarki", data_type="uint16"),
            RegisterMapEntry(address=200, name="Rejestr alarmów", data_type="uint16", is_alarm_register=True),
        ]

    def identify(self, model_hint: Optional[str] = None) -> ControllerModel:
        return ControllerModel(model=model_hint or "PicoIR", description="Kompaktowy termostat Carel PicoIR")

    def known_alarm_codes(self) -> List[AlarmDescription]:
        return [
            AlarmDescription(code=1, name="E1", description="Awaria sondy B1", severity="critical"),
            AlarmDescription(code=4, name="HA", description="Alarm wysokiej temperatury", severity="warning"),
        ]

    def decode_alarm(self, code: int) -> AlarmDescription:
        for alarm in self.known_alarm_codes():
            if alarm.code == code:
                return alarm
        return AlarmDescription(code=code, name=f"E{code}", description="Nieznany kod alarmu", severity="info")

    def simulate_reading(self, tick: float) -> Dict[str, dict]:
        room = round(5 + 1.2 * math.sin(tick * 0.07) + random.uniform(-0.2, 0.2), 1)
        return {
            "Sonda B1 (komora)": {"value": room, "unit": "°C"},
            "Nastawa": {"value": 5.0, "unit": "°C"},
            "Wyjście sprężarki": {"value": 1 if room > 5 else 0, "unit": ""},
            # Bitmask register (codes are powers of two) - 0 = no active alarm.
            "Rejestr alarmów": {"value": 0, "unit": ""},
        }
