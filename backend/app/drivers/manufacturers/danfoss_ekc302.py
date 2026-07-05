import math
import random
from typing import Dict, List, Optional

from app.drivers.base import AbstractControllerDriver, RegisterMapEntry, ControllerModel, AlarmDescription
from app.drivers.registry import register_driver


@register_driver("Danfoss EKC 302")
class DanfossEkc302Driver(AbstractControllerDriver):
    """Representative profile for a Danfoss EKC 302 - an advanced
    multi-function controller (defrost control/status and evaporator fan,
    beyond the base AK-CC-series feature set). Register addresses are
    plausible demonstration values - verify against the specific model's
    official Modbus documentation before use against real hardware."""

    manufacturer = "Danfoss EKC 302"

    def default_register_map(self) -> List[RegisterMapEntry]:
        return [
            RegisterMapEntry(address=0, name="Temperatura komory", unit="°C", data_type="int16", scale_factor=0.1),
            RegisterMapEntry(address=1, name="Temperatura parownika", unit="°C", data_type="int16", scale_factor=0.1),
            RegisterMapEntry(address=2, name="Nastawa", unit="°C", data_type="int16", scale_factor=0.1, writable=True),
            RegisterMapEntry(address=3, name="Różnica załączania", unit="°C", data_type="int16", scale_factor=0.1, writable=True),
            RegisterMapEntry(address=4, name="Maks. czas odszraniania", unit="min", data_type="uint16", writable=True),
            RegisterMapEntry(address=10, name="Sprężarka", data_type="uint16"),
            RegisterMapEntry(address=11, name="Odszranianie", data_type="uint16"),
            RegisterMapEntry(address=12, name="Wentylator parownika", data_type="uint16"),
            RegisterMapEntry(address=13, name="Styk drzwiowy", data_type="uint16"),
            RegisterMapEntry(address=20, name="Kod alarmu", data_type="uint16", is_alarm_register=True),
        ]

    def identify(self, model_hint: Optional[str] = None) -> ControllerModel:
        return ControllerModel(model=model_hint or "EKC 302", description="Zaawansowany sterownik chłodniczy Danfoss EKC 302")

    def known_alarm_codes(self) -> List[AlarmDescription]:
        return [
            AlarmDescription(code=1, name="A1", description="Uszkodzenie czujnika komory", severity="critical"),
            AlarmDescription(code=2, name="A2", description="Uszkodzenie czujnika parownika", severity="critical"),
            AlarmDescription(code=3, name="A3", description="Zbyt wysoka temperatura komory", severity="warning"),
            AlarmDescription(code=4, name="A4", description="Przedłużone odszranianie", severity="warning"),
            AlarmDescription(code=5, name="A5", description="Drzwi otwarte zbyt długo", severity="info"),
            AlarmDescription(code=6, name="A6", description="Awaria wentylatora parownika", severity="warning"),
        ]

    def decode_alarm(self, code: int) -> AlarmDescription:
        for alarm in self.known_alarm_codes():
            if alarm.code == code:
                return alarm
        return AlarmDescription(code=code, name=f"A{code}", description="Nieznany kod alarmu", severity="info")

    def simulate_reading(self, tick: float) -> Dict[str, dict]:
        room = round(-20 + 2 * math.sin(tick * 0.05) + random.uniform(-0.3, 0.3), 1)
        evap = round(room - 7 + random.uniform(-0.5, 0.5), 1)
        return {
            "Temperatura komory": {"value": room, "unit": "°C"},
            "Temperatura parownika": {"value": evap, "unit": "°C"},
            "Nastawa": {"value": -20.0, "unit": "°C"},
            "Różnica załączania": {"value": 2.0, "unit": "°C"},
            "Maks. czas odszraniania": {"value": 30, "unit": "min"},
            "Sprężarka": {"value": 1 if room > -20 else 0, "unit": ""},
            "Odszranianie": {"value": 0, "unit": ""},
            "Wentylator parownika": {"value": 1, "unit": ""},
            "Styk drzwiowy": {"value": 0, "unit": ""},
            "Kod alarmu": {"value": 0, "unit": ""},
        }
