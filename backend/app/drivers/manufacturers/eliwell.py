import math
import random
from typing import Dict, List, Optional

from app.drivers.base import AbstractControllerDriver, RegisterMapEntry, ControllerModel, AlarmDescription
from app.drivers.registry import register_driver


@register_driver("Eliwell")
class EliwellDriver(AbstractControllerDriver):
    """Eliwell IDPlus 974 commercial refrigeration cabinet controller.
    Rebuilt from a real, official Eliwell document found on the web
    ("IDPlus Family" manual, 9MA10053, "Modbus functions and resources"
    chapter - parameter table and client table) - not invented.

    Deliberately smaller than this app's other rebuilt profiles: IDPlus
    974 packs most digital status (compressor, defrost, fans, door...)
    as individual BITS within shared 16-bit registers (e.g. "Compressor"
    is bit 3 of register 32886, "Defrost" is bit 5 of that SAME
    register) - this app's register model reads a whole register per
    named parameter, so it can't cleanly pull out one bit as its own
    named status without misrepresenting the other bits packed
    alongside it. Register 32876 is the one exception kept here: it
    bundles multiple alarm-type conditions (probe faults, pressure,
    thresholds, door-open-during-alarm) as its own set of bits, which is
    exactly what this app's existing bitmask-alarm decoding
    (is_alarm_register + known_alarm_codes) is built to read from a
    single register - so that one is used as the alarm register, while
    a plain "Compressor status" parameter is left out rather than
    guessed."""

    manufacturer = "Eliwell"

    def default_register_map(self) -> List[RegisterMapEntry]:
        return [
            RegisterMapEntry(address=295, name="Sonda AI1 (kabina)", unit="°C", data_type="int16", scale_factor=0.1),
            RegisterMapEntry(address=297, name="Sonda AI2 (parownik)", unit="°C", data_type="int16", scale_factor=0.1),
            RegisterMapEntry(address=16416, name="Nastawa (Set)", unit="°C", data_type="int16", scale_factor=0.1, writable=True),
            RegisterMapEntry(address=16386, name="Różnica załączania (diF)", unit="°C", data_type="int16", scale_factor=0.1, writable=True),
            RegisterMapEntry(address=32876, name="Rejestr alarmów", data_type="uint16", is_alarm_register=True),
        ]

    def identify(self, model_hint: Optional[str] = None) -> ControllerModel:
        return ControllerModel(model=model_hint or "IDPlus 974", description="Sterownik chłodniczy Eliwell IDPlus 974")

    def known_alarm_codes(self) -> List[AlarmDescription]:
        # Real bits of register 32876 from the manual's Client Table
        # (bit N -> value 2^N, per the manual's own bit-numbering key).
        return [
            AlarmDescription(code=2, name="E1", description="Awaria sondy AI1", severity="critical"),
            AlarmDescription(code=4, name="E2", description="Awaria sondy AI2", severity="critical"),
            AlarmDescription(code=8, name="PA", description="Alarm krytycznego ciśnienia", severity="critical"),
            AlarmDescription(code=16, name="EA", description="Alarm zewnętrzny", severity="warning"),
            AlarmDescription(code=32, name="AH1", description="Przekroczony górny próg AI1", severity="warning"),
            AlarmDescription(code=64, name="AL1", description="Przekroczony dolny próg AI1", severity="warning"),
            AlarmDescription(code=128, name="OPd", description="Drzwi otwarte", severity="info"),
        ]

    def decode_alarm(self, code: int) -> AlarmDescription:
        for alarm in self.known_alarm_codes():
            if alarm.code == code:
                return alarm
        return AlarmDescription(code=code, name=f"ALM{code}", description="Nieznany kod alarmu", severity="info")

    def simulate_reading(self, tick: float) -> Dict[str, dict]:
        room = round(2 + 1.2 * math.sin(tick * 0.06) + random.uniform(-0.25, 0.25), 1)
        evap = round(room - 4 + random.uniform(-0.4, 0.4), 1)
        return {
            "Sonda AI1 (kabina)": {"value": room, "unit": "°C"},
            "Sonda AI2 (parownik)": {"value": evap, "unit": "°C"},
            "Nastawa (Set)": {"value": 2.0, "unit": "°C"},
            "Różnica załączania (diF)": {"value": 1.5, "unit": "°C"},
            "Rejestr alarmów": {"value": 0, "unit": ""},
        }
