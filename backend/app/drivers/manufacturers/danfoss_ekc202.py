import math
import random
from typing import Dict, List, Optional

from app.drivers.base import AbstractControllerDriver, RegisterMapEntry, ControllerModel, AlarmDescription
from app.drivers.registry import register_driver


@register_driver("Danfoss EKC 202")
class DanfossEkc202Driver(AbstractControllerDriver):
    """Danfoss EKC 202D1 - a simpler case/thermostat controller than the
    EKC 302D. Rebuilt from a real, official Danfoss document found on the
    web ("Modbus parameters - EKC 202D1", 084B8554, ver. 1.5x).

    Genuinely surprising finding: EKC 202D1's PNU/register table is
    almost identical to EKC 302D's (same addresses for Cutout, temperature
    inputs, relay statuses, alarm destinations...) - Danfoss evidently
    shares this parameter architecture across the whole EKC 2xx/3xx
    family, with the model difference being about physical I/O capacity
    more than the Modbus interface itself. Kept the same curated register
    selection as EKC 302 for that reason, rather than inventing an
    artificial difference the source doesn't support - see that driver's
    docstring for the same caveat on Danfoss's "Float" type meaning a
    scaled 16-bit integer here, not a 32-bit IEEE float."""

    manufacturer = "Danfoss EKC 202"

    def default_register_map(self) -> List[RegisterMapEntry]:
        return [
            RegisterMapEntry(address=100, name="Nastawa (Cutout)", unit="°C", data_type="int16", scale_factor=0.1, writable=True),
            RegisterMapEntry(address=101, name="Różnica załączania (r01)", unit="°C", data_type="int16", scale_factor=0.1, writable=True),
            RegisterMapEntry(address=2530, name="Temperatura S3", unit="°C", data_type="int16", scale_factor=0.1),
            RegisterMapEntry(address=2531, name="Temperatura S4", unit="°C", data_type="int16", scale_factor=0.1),
            RegisterMapEntry(address=1011, name="Temperatura S5 (parownik)", unit="°C", data_type="int16", scale_factor=0.1),
            RegisterMapEntry(address=2002, name="Wejście cyfrowe DI1", data_type="uint16"),
            RegisterMapEntry(address=1036, name="Stan odszraniania", data_type="uint16"),
            RegisterMapEntry(address=2510, name="Sprężarka (Comp1/LLSV)", data_type="uint16"),
            RegisterMapEntry(address=2511, name="Wentylator parownika", data_type="uint16"),
            RegisterMapEntry(address=2512, name="Przekaźnik odszraniania", data_type="uint16"),
            RegisterMapEntry(address=20006, name="Alarm wysokiej temperatury", data_type="uint16"),
            RegisterMapEntry(address=20007, name="Alarm niskiej temperatury", data_type="uint16"),
            RegisterMapEntry(address=20010, name="Alarm drzwi", data_type="uint16"),
            RegisterMapEntry(address=2541, name="Błąd sterownika (EKC Error)", data_type="uint16", is_alarm_register=True),
        ]

    def identify(self, model_hint: Optional[str] = None) -> ControllerModel:
        return ControllerModel(model=model_hint or "EKC 202D1", description="Prosty sterownik termostatyczny Danfoss EKC 202D1")

    def known_alarm_codes(self) -> List[AlarmDescription]:
        return [
            AlarmDescription(code=1, name="EKC Error", description="Błąd wewnętrzny sterownika (np. EEPROM)", severity="critical"),
        ]

    def decode_alarm(self, code: int) -> AlarmDescription:
        for alarm in self.known_alarm_codes():
            if alarm.code == code:
                return alarm
        return AlarmDescription(code=code, name=f"A{code}", description="Nieznany kod alarmu", severity="info")

    def simulate_reading(self, tick: float) -> Dict[str, dict]:
        room = round(4 + 1.5 * math.sin(tick * 0.05) + random.uniform(-0.3, 0.3), 1)
        s4 = round(room - 5 + random.uniform(-0.5, 0.5), 1)
        s5 = round(room - 3 + random.uniform(-0.5, 0.5), 1)
        return {
            "Nastawa (Cutout)": {"value": 4.0, "unit": "°C"},
            "Różnica załączania (r01)": {"value": 2.0, "unit": "°C"},
            "Temperatura S3": {"value": room, "unit": "°C"},
            "Temperatura S4": {"value": s4, "unit": "°C"},
            "Temperatura S5 (parownik)": {"value": s5, "unit": "°C"},
            "Wejście cyfrowe DI1": {"value": 0, "unit": ""},
            "Stan odszraniania": {"value": 0, "unit": ""},
            "Sprężarka (Comp1/LLSV)": {"value": 1 if room > 4 else 0, "unit": ""},
            "Wentylator parownika": {"value": 1, "unit": ""},
            "Przekaźnik odszraniania": {"value": 0, "unit": ""},
            "Alarm wysokiej temperatury": {"value": 0, "unit": ""},
            "Alarm niskiej temperatury": {"value": 0, "unit": ""},
            "Alarm drzwi": {"value": 0, "unit": ""},
            "Błąd sterownika (EKC Error)": {"value": 0, "unit": ""},
        }
