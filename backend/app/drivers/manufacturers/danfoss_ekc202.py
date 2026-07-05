import math
import random
from typing import Dict, List, Optional

from app.drivers.base import AbstractControllerDriver, RegisterMapEntry, ControllerModel, AlarmDescription
from app.drivers.registry import register_driver


@register_driver("Danfoss EKC 202")
class DanfossEkc202Driver(AbstractControllerDriver):
    """Representative profile for a Danfoss EKC 202 - a simple, entry-level
    single-stage thermostat controller (no defrost/fan outputs, unlike the
    AK-CC-series profile). Register addresses are plausible demonstration
    values - verify against the specific model's official Modbus
    documentation before use against real hardware."""

    manufacturer = "Danfoss EKC 202"

    def default_register_map(self) -> List[RegisterMapEntry]:
        return [
            RegisterMapEntry(address=0, name="Temperatura komory", unit="°C", data_type="int16", scale_factor=0.1),
            RegisterMapEntry(address=2, name="Nastawa", unit="°C", data_type="int16", scale_factor=0.1, writable=True),
            RegisterMapEntry(address=3, name="Różnica załączania", unit="°C", data_type="int16", scale_factor=0.1, writable=True),
            RegisterMapEntry(address=10, name="Sprężarka", data_type="uint16"),
            RegisterMapEntry(address=20, name="Kod alarmu", data_type="uint16", is_alarm_register=True),
        ]

    def identify(self, model_hint: Optional[str] = None) -> ControllerModel:
        return ControllerModel(model=model_hint or "EKC 202", description="Prosty sterownik termostatyczny Danfoss EKC 202")

    def known_alarm_codes(self) -> List[AlarmDescription]:
        # Codes deliberately not {1, 2} - both are powers of two, which
        # would make _is_bitmask_style() misclassify this as a Carel-style
        # bitmask register with only two codes to go on. A3 makes the
        # sequential (Danfoss-style) convention unambiguous.
        return [
            AlarmDescription(code=1, name="A1", description="Uszkodzenie czujnika komory", severity="critical"),
            AlarmDescription(code=3, name="A3", description="Zbyt wysoka temperatura komory", severity="warning"),
        ]

    def decode_alarm(self, code: int) -> AlarmDescription:
        for alarm in self.known_alarm_codes():
            if alarm.code == code:
                return alarm
        return AlarmDescription(code=code, name=f"A{code}", description="Nieznany kod alarmu", severity="info")

    def simulate_reading(self, tick: float) -> Dict[str, dict]:
        room = round(4 + 1.5 * math.sin(tick * 0.05) + random.uniform(-0.3, 0.3), 1)
        return {
            "Temperatura komory": {"value": room, "unit": "°C"},
            "Nastawa": {"value": 4.0, "unit": "°C"},
            "Różnica załączania": {"value": 2.0, "unit": "°C"},
            "Sprężarka": {"value": 1 if room > 4 else 0, "unit": ""},
            "Kod alarmu": {"value": 0, "unit": ""},
        }
