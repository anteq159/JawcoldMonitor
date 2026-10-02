import math
import random
from typing import Dict, List, Optional

from app.drivers.base import AbstractControllerDriver, RegisterMapEntry, ControllerModel, AlarmDescription
from app.drivers.registry import register_driver


@register_driver("Eliwell")
class EliwellDriver(AbstractControllerDriver):
    """Eliwell IDPlus 974 commercial refrigeration cabinet controller.
    Built from Eliwell's "IDPlus Family" manual (9MA10053), chapter
    "Modbus functions and resources": parameters table and client table.

    The client table gives status as "register.bit" (bit 0 = least
    significant, per the manual's own example 8806.14), e.g. compressor
    32886.3 and defrost 32886.5 - read here as bit flags. Alarms are the
    individual bits of 32876-32878 rather than one decoded alarm code, so
    each shows and raises as its own flag.

    The controller accepts frames of at most 30 bytes (manual, "Maximum
    length in bytes of messages received by the device"), i.e. 12
    registers per read reply - hence max_read_words. Address = FAA x 16 +
    dEA; parity/stop bits via Pty/StP (8N2 to share a bus with Carel
    MPXPRO)."""

    manufacturer = "Eliwell"
    max_read_words = 12

    def default_register_map(self) -> List[RegisterMapEntry]:
        def flag(address, bit, name, category):
            return RegisterMapEntry(address=address, name=name, data_type="uint16", bit=bit, category=category)

        return [
            RegisterMapEntry(address=295, name="Sonda AI1 (kabina)", unit="°C", data_type="int16", scale_factor=0.1),
            RegisterMapEntry(address=297, name="Sonda AI2 (parownik)", unit="°C", data_type="int16", scale_factor=0.1),
            RegisterMapEntry(address=299, name="Sonda AI3", unit="°C", data_type="int16", scale_factor=0.1),
            RegisterMapEntry(address=16416, name="Nastawa (Set)", unit="°C", data_type="int16", scale_factor=0.1, writable=True),
            RegisterMapEntry(address=16386, name="Różnica załączania (diF)", unit="°C", data_type="int16", scale_factor=0.1, writable=True),
            flag(32886, 3, "Sprężarka", "status"),
            flag(32886, 5, "Odszranianie", "status"),
            flag(32888, 7, "Wentylatory parownika", "status"),
            flag(32896, 3, "Drzwi", "status"),
            flag(32882, 0, "Nastawa ekonomiczna", "status"),
            flag(32882, 4, "Wyjście AUX", "status"),
            flag(32882, 1, "Czuwanie (stand-by)", "status"),
            flag(33056, 7, "Wejście cyfrowe DI1", "status"),
            flag(33056, 2, "Wejście cyfrowe DI2", "status"),
            flag(32876, 1, "Awaria sondy AI1 (E1)", "alarm"),
            flag(32876, 2, "Awaria sondy AI2 (E2)", "alarm"),
            flag(32877, 0, "Awaria sondy AI3 (E3)", "alarm"),
            flag(32876, 5, "Wysoka temperatura AI1 (AH1)", "alarm"),
            flag(32876, 6, "Niska temperatura AI1 (AL1)", "alarm"),
            flag(32876, 0, "Alarm przegrzania", "alarm"),
            flag(32876, 7, "Drzwi otwarte (OPd)", "alarm"),
            flag(32876, 4, "Alarm zewnętrzny (EA)", "alarm"),
            flag(32876, 3, "Krytyczne ciśnienie (PA)", "alarm"),
            flag(32878, 5, "Presostat (nPA)", "alarm"),
            flag(32877, 1, "Alarm HACCP", "alarm"),
            flag(32878, 0, "Odszranianie zakończone czasem", "alarm"),
        ]

    def identify(self, model_hint: Optional[str] = None) -> ControllerModel:
        return ControllerModel(model=model_hint or "IDPlus 974", description="Sterownik chłodniczy Eliwell IDPlus 974")

    def known_alarm_codes(self) -> List[AlarmDescription]:
        # Alarms are read as bit flags (alarm category above).
        return []

    def decode_alarm(self, code: int) -> AlarmDescription:
        for alarm in self.known_alarm_codes():
            if alarm.code == code:
                return alarm
        return AlarmDescription(code=code, name=f"ALM{code}", description="Nieznany kod alarmu", severity="info")

    def simulate_reading(self, tick: float) -> Dict[str, dict]:
        room = round(2 + 1.2 * math.sin(tick * 0.06) + random.uniform(-0.25, 0.25), 1)
        evap = round(room - 4 + random.uniform(-0.4, 0.4), 1)
        values = {reg.name: {"value": 0, "unit": reg.unit or ""} for reg in self.default_register_map()}
        values.update({
            "Sonda AI1 (kabina)": {"value": room, "unit": "°C"},
            "Sonda AI2 (parownik)": {"value": evap, "unit": "°C"},
            "Sonda AI3": {"value": round(room + 0.6, 1), "unit": "°C"},
            "Nastawa (Set)": {"value": 2.0, "unit": "°C"},
            "Różnica załączania (diF)": {"value": 1.5, "unit": "°C"},
            "Sprężarka": {"value": 1 if room > 2 else 0, "unit": ""},
            "Wentylatory parownika": {"value": 1, "unit": ""},
        })
        return values
