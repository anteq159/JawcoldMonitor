import math
import random
from typing import Dict, List, Optional

from app.drivers.base import AbstractControllerDriver, RegisterMapEntry, ControllerModel, AlarmDescription
from app.drivers.registry import register_driver


@register_driver("Carel")
class CarelDriver(AbstractControllerDriver):
    """Carel ir33 family chilled display case controller. Rebuilt from a
    real, official Carel manual found on the web (ir33plus +03Z0028EN,
    "7. Parameter table" and "7.14 Variables only accessible via serial
    connection") - not invented. Note this specific document is for the
    "ir33plus" variant of the ir33 family; the app's own model label below
    stays "IR33 Universal" since that's the specific product this profile
    was originally meant to represent, and Carel's addressing may vary
    somewhat between ir33 family variants - treat this as the closest
    real reference found rather than a confirmed match to that exact
    model.

    This document confirms ir33 genuinely splits Digital-type variables
    (compressor/defrost/fan relay status, alarms) into their own address
    space, separate from Analogue/Integer-type variables (probes,
    setpoint) - the same multi-object-type pattern this app's MPXone
    drivers found, e.g. "Fan relay status" and "Virtual probe" are both
    numbered address 3 in the source table but are unrelated addresses in
    different Modbus object types (register_type=coil vs holding here).

    This also caught the same kind of mistake found and fixed in the
    MPXPRO driver: the previous version of this driver used "HA" to mean
    a high-temperature alarm and invented "LA" for low temperature - the
    real ir33 alarm table has no "LA" at all; the real codes are HI (high
    temp), LO (low temp), and HA is actually a HACCP-type alarm, not
    temperature-related."""

    manufacturer = "Carel"

    def default_register_map(self) -> List[RegisterMapEntry]:
        return [
            RegisterMapEntry(address=16, name="Nastawa (St)", unit="°C", data_type="int16", scale_factor=0.1, writable=True, register_type="holding"),
            RegisterMapEntry(address=17, name="Różnica załączania (rd)", unit="°C", data_type="int16", scale_factor=0.1, writable=True, register_type="holding"),
            RegisterMapEntry(address=4, name="Sonda 1", unit="°C", data_type="int16", scale_factor=0.1, register_type="holding"),
            RegisterMapEntry(address=5, name="Sonda 2", unit="°C", data_type="int16", scale_factor=0.1, register_type="holding"),
            RegisterMapEntry(address=1, name="Sprężarka", data_type="uint16", register_type="discrete_input"),
            RegisterMapEntry(address=2, name="Odszranianie", data_type="uint16", register_type="discrete_input"),
            RegisterMapEntry(address=3, name="Wentylator", data_type="uint16", register_type="discrete_input"),
            RegisterMapEntry(address=6, name="Wejście cyfrowe DI1", data_type="uint16", register_type="discrete_input"),
            RegisterMapEntry(address=37, name="Stan drzwi", data_type="uint16", register_type="discrete_input"),
            RegisterMapEntry(address=15, name="Alarm niskiej temperatury (LO)", data_type="uint16", register_type="discrete_input"),
            RegisterMapEntry(address=16, name="Alarm wysokiej temperatury (HI)", data_type="uint16", register_type="discrete_input"),
            RegisterMapEntry(address=25, name="Alarm drzwi (dor)", data_type="uint16", register_type="discrete_input"),
            RegisterMapEntry(address=10, name="Awaria sondy (E0)", data_type="uint16", is_alarm_register=True, register_type="discrete_input"),
        ]

    def identify(self, model_hint: Optional[str] = None) -> ControllerModel:
        return ControllerModel(model=model_hint or "IR33 Universal", description="Sterownik chłodniczy Carel IR33")

    def known_alarm_codes(self) -> List[AlarmDescription]:
        # Real codes/meanings from the manual's chapter 8 alarm table -
        # see module docstring for the HA/LA correction this caught.
        return [
            AlarmDescription(code=1, name="E0", description="Awaria sondy S1", severity="critical"),
            AlarmDescription(code=2, name="HI", description="Alarm wysokiej temperatury", severity="warning"),
            AlarmDescription(code=4, name="LO", description="Alarm niskiej temperatury", severity="warning"),
            AlarmDescription(code=8, name="dor", description="Alarm zbyt długo otwartych drzwi", severity="info"),
            AlarmDescription(code=16, name="HA", description="Alarm HACCP (wysoka temperatura podczas pracy)", severity="warning"),
            AlarmDescription(code=32, name="EE", description="Błąd pamięci EEPROM", severity="critical"),
        ]

    def decode_alarm(self, code: int) -> AlarmDescription:
        for alarm in self.known_alarm_codes():
            if alarm.code == code:
                return alarm
        return AlarmDescription(code=code, name=f"ALM{code}", description="Nieznany kod alarmu", severity="info")

    def simulate_reading(self, tick: float) -> Dict[str, dict]:
        room = round(4 + 1.5 * math.sin(tick * 0.07) + random.uniform(-0.2, 0.2), 1)
        evap = round(room - 5 + random.uniform(-0.4, 0.4), 1)
        return {
            "Nastawa (St)": {"value": 4.0, "unit": "°C"},
            "Różnica załączania (rd)": {"value": 2.0, "unit": "°C"},
            "Sonda 1": {"value": room, "unit": "°C"},
            "Sonda 2": {"value": evap, "unit": "°C"},
            "Sprężarka": {"value": 1 if room > 4 else 0, "unit": ""},
            "Odszranianie": {"value": 0, "unit": ""},
            "Wentylator": {"value": 1, "unit": ""},
            "Wejście cyfrowe DI1": {"value": 0, "unit": ""},
            "Stan drzwi": {"value": 0, "unit": ""},
            "Alarm niskiej temperatury (LO)": {"value": 0, "unit": ""},
            "Alarm wysokiej temperatury (HI)": {"value": 0, "unit": ""},
            "Alarm drzwi (dor)": {"value": 0, "unit": ""},
            "Awaria sondy (E0)": {"value": 0, "unit": ""},
        }
