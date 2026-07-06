import math
import random
from typing import Dict, List, Optional

from app.drivers.base import AbstractControllerDriver, RegisterMapEntry, ControllerModel, AlarmDescription
from app.drivers.registry import register_driver


@register_driver("Danfoss")
class DanfossDriver(AbstractControllerDriver):
    """Danfoss AK-CC 2xx case/room controller. Rebuilt from a real,
    official Danfoss document found on the web: "Parameter identification
    (modbus) AK-CC 250" (RZ8CZ102, 084B8524, SW 2.21) - the closest AK-CC
    family member with a public Modbus PNU table (the AK-CC 210's own
    published manual is keypad-only, so the model hint below now says
    AK-CC 250, the device this data is actually confirmed for).

    The table confirms the AK-CC 2xx family shares Danfoss's EKC 2xx/3xx
    PNU architecture (same addresses for temperatures, relays, DI status)
    BUT with its own alarm-destination bit numbering: here Door alarm is
    PNU 20008 and HACCP is 20007, unlike EKC 302D (Door 20007) and EKC
    202D1 (Door 20010) - reading a sibling model's map would silently
    swap alarm meanings, which is exactly why each driver carries its own
    numbers. One inference, flagged honestly: the AK-CC 250 sheet lists
    Max/Min cutout at PNU 102/103 but omits the setpoint row itself;
    PNU 100 (Cutout) is taken from the confirmed EKC 202D1/302D tables
    where 102/103 carry the same meaning - verify on real hardware before
    relying on setpoint WRITES. Danfoss "Float" here means a scaled
    16-bit integer (Scale column 01 = x0.1), not IEEE-754."""

    manufacturer = "Danfoss"

    def default_register_map(self) -> List[RegisterMapEntry]:
        return [
            RegisterMapEntry(address=100, name="Nastawa (Cutout)", unit="°C", data_type="int16", scale_factor=0.1, writable=True),
            RegisterMapEntry(address=101, name="Różnica załączania (r01)", unit="°C", data_type="int16", scale_factor=0.1, writable=True),
            RegisterMapEntry(address=2546, name="Temperatura odniesienia (u28)", unit="°C", data_type="int16", scale_factor=0.1),
            RegisterMapEntry(address=2530, name="Temperatura S3", unit="°C", data_type="int16", scale_factor=0.1),
            RegisterMapEntry(address=2531, name="Temperatura S4", unit="°C", data_type="int16", scale_factor=0.1),
            RegisterMapEntry(address=1011, name="Temperatura S5 (parownik)", unit="°C", data_type="int16", scale_factor=0.1),
            RegisterMapEntry(address=2002, name="Wejście cyfrowe DI1", data_type="uint16"),
            RegisterMapEntry(address=1036, name="Stan odszraniania", data_type="uint16"),
            RegisterMapEntry(address=2510, name="Sprężarka (Comp1/LLSV)", data_type="uint16"),
            RegisterMapEntry(address=2511, name="Wentylator parownika", data_type="uint16"),
            RegisterMapEntry(address=2512, name="Przekaźnik odszraniania", data_type="uint16"),
            RegisterMapEntry(address=20005, name="Alarm wysokiej temperatury", data_type="uint16"),
            RegisterMapEntry(address=20006, name="Alarm niskiej temperatury", data_type="uint16"),
            RegisterMapEntry(address=20008, name="Alarm drzwi", data_type="uint16"),
            RegisterMapEntry(address=2541, name="Błąd sterownika (EKC Error)", data_type="uint16", is_alarm_register=True),
        ]

    def identify(self, model_hint: Optional[str] = None) -> ControllerModel:
        return ControllerModel(model=model_hint or "AK-CC 250", description="Elektroniczny sterownik chłodniczy Danfoss AK-CC 250")

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
        room = round(2 + 1.5 * math.sin(tick * 0.05) + random.uniform(-0.3, 0.3), 1)
        s4 = round(room - 5 + random.uniform(-0.5, 0.5), 1)
        s5 = round(room - 6 + random.uniform(-0.5, 0.5), 1)
        return {
            "Nastawa (Cutout)": {"value": 2.0, "unit": "°C"},
            "Różnica załączania (r01)": {"value": 2.0, "unit": "°C"},
            "Temperatura odniesienia (u28)": {"value": 2.0, "unit": "°C"},
            "Temperatura S3": {"value": room, "unit": "°C"},
            "Temperatura S4": {"value": s4, "unit": "°C"},
            "Temperatura S5 (parownik)": {"value": s5, "unit": "°C"},
            "Wejście cyfrowe DI1": {"value": 0, "unit": ""},
            "Stan odszraniania": {"value": 0, "unit": ""},
            "Sprężarka (Comp1/LLSV)": {"value": 1 if room > 2 else 0, "unit": ""},
            "Wentylator parownika": {"value": 1, "unit": ""},
            "Przekaźnik odszraniania": {"value": 0, "unit": ""},
            "Alarm wysokiej temperatury": {"value": 0, "unit": ""},
            "Alarm niskiej temperatury": {"value": 0, "unit": ""},
            "Alarm drzwi": {"value": 0, "unit": ""},
            "Błąd sterownika (EKC Error)": {"value": 0, "unit": ""},
        }
