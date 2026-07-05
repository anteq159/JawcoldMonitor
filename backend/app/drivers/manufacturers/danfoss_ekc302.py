import math
import random
from typing import Dict, List, Optional

from app.drivers.base import AbstractControllerDriver, RegisterMapEntry, ControllerModel, AlarmDescription
from app.drivers.registry import register_driver


@register_driver("Danfoss EKC 302")
class DanfossEkc302Driver(AbstractControllerDriver):
    """Danfoss EKC 302D - an advanced multi-function case controller
    (defrost control/status and evaporator fan, beyond the base AK-CC-
    series feature set). Rebuilt from a real, official Danfoss document
    found on the web ("Modbus Parameters EKC 302D", 084B4164, SW 1.2x) -
    every PNU/address, type, scale and R/W flag below is taken directly
    from that table, not invented.

    Danfoss's own "Float" type here (used with the Scale column, e.g.
    0.1) is a scaled 16-bit integer, not a 32-bit IEEE float - matches
    this app's existing int16+scale_factor convention directly, so no
    new data type was needed.

    Alarms are individually-exposed booleans in the real register list
    (High t.alarm, Low t.alarm, Door alarm...), not one combined code
    register - same architecture as this project's MPXone drivers. Used
    "EKC Error" (PNU 2541) as the single is_alarm_register flag since
    it's the general controller-level status bit in the source, though
    the document doesn't explicitly confirm it goes high for every
    individual alarm below it (vs. specifically internal/EEPROM-type
    faults) - exposed the temperature/door alarms individually too so
    that distinction doesn't hide anything."""

    manufacturer = "Danfoss EKC 302"

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
            RegisterMapEntry(address=20005, name="Alarm wysokiej temperatury", data_type="uint16"),
            RegisterMapEntry(address=20006, name="Alarm niskiej temperatury", data_type="uint16"),
            RegisterMapEntry(address=20007, name="Alarm drzwi", data_type="uint16"),
            RegisterMapEntry(address=2541, name="Błąd sterownika (EKC Error)", data_type="uint16", is_alarm_register=True),
        ]

    def identify(self, model_hint: Optional[str] = None) -> ControllerModel:
        return ControllerModel(model=model_hint or "EKC 302D", description="Zaawansowany sterownik chłodniczy Danfoss EKC 302D")

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
        room = round(-20 + 2 * math.sin(tick * 0.05) + random.uniform(-0.3, 0.3), 1)
        s4 = round(room - 7 + random.uniform(-0.5, 0.5), 1)
        s5 = round(room - 5 + random.uniform(-0.5, 0.5), 1)
        return {
            "Nastawa (Cutout)": {"value": -20.0, "unit": "°C"},
            "Różnica załączania (r01)": {"value": 2.0, "unit": "°C"},
            "Temperatura S3": {"value": room, "unit": "°C"},
            "Temperatura S4": {"value": s4, "unit": "°C"},
            "Temperatura S5 (parownik)": {"value": s5, "unit": "°C"},
            "Wejście cyfrowe DI1": {"value": 0, "unit": ""},
            "Stan odszraniania": {"value": 0, "unit": ""},
            "Sprężarka (Comp1/LLSV)": {"value": 1 if room > -20 else 0, "unit": ""},
            "Wentylator parownika": {"value": 1, "unit": ""},
            "Przekaźnik odszraniania": {"value": 0, "unit": ""},
            "Alarm wysokiej temperatury": {"value": 0, "unit": ""},
            "Alarm niskiej temperatury": {"value": 0, "unit": ""},
            "Alarm drzwi": {"value": 0, "unit": ""},
            "Błąd sterownika (EKC Error)": {"value": 0, "unit": ""},
        }
