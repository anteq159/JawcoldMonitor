import math
import random
from typing import Dict, List, Optional

from app.drivers.base import AbstractControllerDriver, RegisterMapEntry, ControllerModel, AlarmDescription
from app.drivers.registry import register_driver


@register_driver("Eliwell IDNext")
class EliwellIdNextDriver(AbstractControllerDriver):
    """Eliwell IDNext -HC - the newer-generation successor to the ID Plus
    series. Rebuilt from a real, official Eliwell user manual found on
    the web (IDNext -HC, IDNXP-00EN, 2020, "Modbus MSK 750 functions and
    resources" chapter - Table of Modbus Parameters and Table of Modbus
    Resources) - not invented.

    Same limitation as this project's IDPlus 974 driver and for the same
    reason: most digital status (compressor, defrost, fans, light...) is
    packed as individual bits within shared registers (e.g. register 4115
    alone packs CP1, CP2, DEF1, DEF2, FAN, FAN_C, LIGHT, AUX, STD-BY,
    ENS, ECO, DEEP and DO as different bits of the same word), which this
    app's one-register-per-named-parameter model can't cleanly pull
    apart. Register 4121 is the exception kept here: every bit in it is
    genuinely an alarm-type condition (probe faults, door open, external
    alarm, threshold exceeded, RTC error, overtemperature, low
    refrigerant, pressure switch, critical pressure - 13 real conditions,
    each with its own documented bit value), which lines up exactly with
    this app's existing bitmask-alarm decoding, unlike register 4115's
    mix of alarm and ordinary operating status."""

    manufacturer = "Eliwell IDNext"

    def default_register_map(self) -> List[RegisterMapEntry]:
        return [
            RegisterMapEntry(address=4109, name="Sonda AI1 (regulacja)", unit="°C", data_type="int16", scale_factor=0.1),
            RegisterMapEntry(address=4110, name="Sonda AI2 (odszranianie)", unit="°C", data_type="int16", scale_factor=0.1),
            RegisterMapEntry(address=32769, name="Nastawa (SEt)", unit="°C", data_type="int16", scale_factor=0.1, writable=True),
            RegisterMapEntry(address=32770, name="Różnica załączania (diF)", unit="°C", data_type="int16", scale_factor=0.1, writable=True),
            RegisterMapEntry(address=4121, name="Rejestr alarmów", data_type="uint16", is_alarm_register=True),
        ]

    def identify(self, model_hint: Optional[str] = None) -> ControllerModel:
        return ControllerModel(model=model_hint or "IDNext -HC", description="Zaawansowany sterownik chłodniczy Eliwell IDNext")

    def known_alarm_codes(self) -> List[AlarmDescription]:
        # Real bits of register 4121 from the manual's Table of Modbus
        # Resources (each resource's own documented Filter/bit value).
        return [
            AlarmDescription(code=1, name="E1", description="Awaria wejścia analogowego 1", severity="critical"),
            AlarmDescription(code=2, name="E2", description="Awaria wejścia analogowego 2", severity="critical"),
            AlarmDescription(code=4, name="E3", description="Awaria wejścia analogowego 3", severity="critical"),
            AlarmDescription(code=8, name="Opd", description="Drzwi otwarte", severity="info"),
            AlarmDescription(code=16, name="EA", description="Alarm zewnętrzny", severity="warning"),
            AlarmDescription(code=32, name="AL1", description="Przekroczony dolny próg wejścia 1", severity="warning"),
            AlarmDescription(code=64, name="AH1", description="Przekroczony górny próg wejścia 1", severity="warning"),
            AlarmDescription(code=512, name="COH", description="Alarm przegrzania", severity="critical"),
            AlarmDescription(code=1024, name="rCA", description="Niski poziom czynnika chłodniczego", severity="warning"),
            AlarmDescription(code=4096, name="PA", description="Krytyczne ciśnienie", severity="critical"),
        ]

    def decode_alarm(self, code: int) -> AlarmDescription:
        for alarm in self.known_alarm_codes():
            if alarm.code == code:
                return alarm
        return AlarmDescription(code=code, name=f"ALM{code}", description="Nieznany kod alarmu", severity="info")

    def simulate_reading(self, tick: float) -> Dict[str, dict]:
        room = round(1 + 1.3 * math.sin(tick * 0.06) + random.uniform(-0.25, 0.25), 1)
        evap = round(room - 5 + random.uniform(-0.4, 0.4), 1)
        return {
            "Sonda AI1 (regulacja)": {"value": room, "unit": "°C"},
            "Sonda AI2 (odszranianie)": {"value": evap, "unit": "°C"},
            "Nastawa (SEt)": {"value": 1.0, "unit": "°C"},
            "Różnica załączania (diF)": {"value": 1.5, "unit": "°C"},
            "Rejestr alarmów": {"value": 0, "unit": ""},
        }
