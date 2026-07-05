import math
import random
from typing import Dict, List, Optional

from app.drivers.base import AbstractControllerDriver, RegisterMapEntry, ControllerModel, AlarmDescription
from app.drivers.registry import register_driver


@register_driver("Carel MPX")
class CarelMPXDriver(AbstractControllerDriver):
    """Representative profile for a Carel MPXPRO-series controller with
    electronic expansion valve (EEV) control - distinct from the IR33 driver
    above by superheat/EEV registers and HACCP alarm logging, both
    characteristic MPXPRO features on real hardware. Demonstration register
    map for the Etap 1 simulation layer - verify against the specific
    model's official Modbus map before use against real hardware (Etap 3)."""

    manufacturer = "Carel MPX"

    def default_register_map(self) -> List[RegisterMapEntry]:
        return [
            RegisterMapEntry(address=100, name="Sonda B1 (regał)", unit="°C", data_type="int16", scale_factor=0.1),
            RegisterMapEntry(address=101, name="Sonda B2 (parownik)", unit="°C", data_type="int16", scale_factor=0.1),
            RegisterMapEntry(address=105, name="Przegrzanie", unit="K", data_type="int16", scale_factor=0.1),
            RegisterMapEntry(address=102, name="Nastawa", unit="°C", data_type="int16", scale_factor=0.1, writable=True),
            RegisterMapEntry(address=103, name="Różnica załączania", unit="°C", data_type="int16", scale_factor=0.1, writable=True),
            RegisterMapEntry(address=110, name="Otwarcie zaworu EEV", unit="%", data_type="uint16"),
            RegisterMapEntry(address=150, name="Wyjście sprężarki", data_type="uint16"),
            RegisterMapEntry(address=151, name="Wyjście odszraniania", data_type="uint16"),
            RegisterMapEntry(address=152, name="Wyjście wentylatora", data_type="uint16"),
            RegisterMapEntry(address=180, name="Licznik alarmów HACCP", data_type="uint16"),
            RegisterMapEntry(address=200, name="Rejestr alarmów", data_type="uint16", is_alarm_register=True),
        ]

    def identify(self, model_hint: Optional[str] = None) -> ControllerModel:
        return ControllerModel(model=model_hint or "MPXPRO", description="Sterownik chłodniczy Carel MPXPRO z zaworem EEV")

    def known_alarm_codes(self) -> List[AlarmDescription]:
        return [
            AlarmDescription(code=1, name="E1", description="Awaria sondy B1", severity="critical"),
            AlarmDescription(code=2, name="E2", description="Awaria sondy B2", severity="critical"),
            AlarmDescription(code=4, name="HA", description="Alarm wysokiej temperatury", severity="warning"),
            AlarmDescription(code=8, name="LA", description="Alarm niskiej temperatury", severity="warning"),
            AlarmDescription(code=16, name="dA", description="Alarm drzwi", severity="info"),
            AlarmDescription(code=32, name="EE", description="Awaria zaworu EEV", severity="critical"),
            AlarmDescription(code=64, name="HACCP1", description="Przekroczenie temperatury HACCP", severity="warning"),
        ]

    def decode_alarm(self, code: int) -> AlarmDescription:
        for alarm in self.known_alarm_codes():
            if alarm.code == code:
                return alarm
        return AlarmDescription(code=code, name=f"E{code}", description="Nieznany kod alarmu", severity="info")

    def simulate_reading(self, tick: float) -> Dict[str, dict]:
        room = round(1 + 1.3 * math.sin(tick * 0.065) + random.uniform(-0.2, 0.2), 1)
        evap = round(room - 6 + random.uniform(-0.4, 0.4), 1)
        superheat = round(6 + random.uniform(-0.8, 0.8), 1)
        eev_opening = round(max(0, min(100, 40 + 10 * math.sin(tick * 0.09) + random.uniform(-3, 3))), 0)
        return {
            "Sonda B1 (regał)": {"value": room, "unit": "°C"},
            "Sonda B2 (parownik)": {"value": evap, "unit": "°C"},
            "Przegrzanie": {"value": superheat, "unit": "K"},
            "Nastawa": {"value": 1.0, "unit": "°C"},
            "Różnica załączania": {"value": 2.0, "unit": "°C"},
            "Otwarcie zaworu EEV": {"value": eev_opening, "unit": "%"},
            "Wyjście sprężarki": {"value": 1 if room > 1 else 0, "unit": ""},
            "Wyjście odszraniania": {"value": 0, "unit": ""},
            "Wyjście wentylatora": {"value": 1, "unit": ""},
            "Licznik alarmów HACCP": {"value": 0, "unit": ""},
            # Bitmask register (codes are powers of two) - 0 = no active
            # alarm. Was never simulated before; see decode_active_alarms().
            "Rejestr alarmów": {"value": 0, "unit": ""},
        }
