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
    characteristic MPXPRO features on real hardware.

    Parameter codes (St, rd, P3, AL, AH...) and alarm codes/meanings below
    are real, taken from Carel's own MPXPRO Polish instruction manual
    (+0300055PL, "Tabela parametrów" and "Alarmy i sygnały" chapters) - not
    invented. This caught a real mistake in the previous version of this
    driver: it used "EE" to mean an EEV valve fault and "HA" to mean a
    high-temperature alarm, reusing real Carel abbreviations with the
    wrong meanings - the manual's actual alarm table says EE is a flash
    memory fault and HA is a HACCP-type alarm. What's still NOT confirmed:
    the manual documents alarm codes as shown on the controller's own
    keypad display, not their Modbus register/bit mapping - there's no
    Modbus integration guide in what was provided for this model, so the
    combined "Rejestr alarmów" address and its bit-per-code assignment
    below are still a plausible placeholder like the rest of this driver,
    only the code names/meanings are sourced."""

    manufacturer = "Carel MPX"

    def default_register_map(self) -> List[RegisterMapEntry]:
        return [
            RegisterMapEntry(address=100, name="Sonda B1 (regał)", unit="°C", data_type="int16", scale_factor=0.1),
            RegisterMapEntry(address=101, name="Sonda B2 (parownik)", unit="°C", data_type="int16", scale_factor=0.1),
            RegisterMapEntry(address=105, name="Przegrzanie (SH)", unit="K", data_type="int16", scale_factor=0.1),
            RegisterMapEntry(address=102, name="Nastawa (St)", unit="°C", data_type="int16", scale_factor=0.1, writable=True),
            RegisterMapEntry(address=103, name="Różnica załączania (rd)", unit="°C", data_type="int16", scale_factor=0.1, writable=True),
            RegisterMapEntry(address=106, name="Nastawa przegrzania (P3)", unit="K", data_type="int16", scale_factor=0.1, writable=True),
            RegisterMapEntry(address=110, name="Otwarcie zaworu EEV (PPU)", unit="%", data_type="uint16"),
            RegisterMapEntry(address=150, name="Wyjście sprężarki", data_type="uint16"),
            RegisterMapEntry(address=151, name="Wyjście odszraniania", data_type="uint16"),
            RegisterMapEntry(address=152, name="Wyjście wentylatora", data_type="uint16"),
            RegisterMapEntry(address=180, name="Licznik alarmów HACCP", data_type="uint16"),
            RegisterMapEntry(address=200, name="Rejestr alarmów", data_type="uint16", is_alarm_register=True),
        ]

    def identify(self, model_hint: Optional[str] = None) -> ControllerModel:
        return ControllerModel(model=model_hint or "MPXPRO", description="Sterownik chłodniczy Carel MPXPRO z zaworem EEV")

    def known_alarm_codes(self) -> List[AlarmDescription]:
        # Real codes/meanings from the manual's Tab. 9.b - a representative
        # subset of the full ~30-code table, kept to the most operationally
        # relevant ones (sensor fault, temperature, door, and the two
        # EEV-specific alarms that distinguish MPXPRO from a plain
        # thermostat controller).
        return [
            AlarmDescription(code=1, name="E1", description="Błąd czujnika S1", severity="critical"),
            AlarmDescription(code=2, name="HI", description="Alarm wysokiej temperatury", severity="warning"),
            AlarmDescription(code=4, name="LO", description="Alarm niskiej temperatury", severity="warning"),
            AlarmDescription(code=8, name="dor", description="Alarm zbyt długo otwartych drzwi", severity="info"),
            AlarmDescription(code=16, name="LSH", description="Alarm niskiej wartości przegrzania", severity="warning"),
            AlarmDescription(code=32, name="bLo", description="Alarm zablokowanego zaworu EEV", severity="critical"),
            AlarmDescription(code=64, name="HA", description="Alarm HACCP (wysoka temperatura podczas pracy)", severity="warning"),
        ]

    def decode_alarm(self, code: int) -> AlarmDescription:
        for alarm in self.known_alarm_codes():
            if alarm.code == code:
                return alarm
        return AlarmDescription(code=code, name=f"ALM{code}", description="Nieznany kod alarmu", severity="info")

    def simulate_reading(self, tick: float) -> Dict[str, dict]:
        room = round(1 + 1.3 * math.sin(tick * 0.065) + random.uniform(-0.2, 0.2), 1)
        evap = round(room - 6 + random.uniform(-0.4, 0.4), 1)
        superheat = round(6 + random.uniform(-0.8, 0.8), 1)
        eev_opening = round(max(0, min(100, 40 + 10 * math.sin(tick * 0.09) + random.uniform(-3, 3))), 0)
        return {
            "Sonda B1 (regał)": {"value": room, "unit": "°C"},
            "Sonda B2 (parownik)": {"value": evap, "unit": "°C"},
            "Przegrzanie (SH)": {"value": superheat, "unit": "K"},
            "Nastawa (St)": {"value": 1.0, "unit": "°C"},
            "Różnica załączania (rd)": {"value": 2.0, "unit": "°C"},
            "Nastawa przegrzania (P3)": {"value": 10.0, "unit": "K"},
            "Otwarcie zaworu EEV (PPU)": {"value": eev_opening, "unit": "%"},
            "Wyjście sprężarki": {"value": 1 if room > 1 else 0, "unit": ""},
            "Wyjście odszraniania": {"value": 0, "unit": ""},
            "Wyjście wentylatora": {"value": 1, "unit": ""},
            "Licznik alarmów HACCP": {"value": 0, "unit": ""},
            # Bitmask register (codes are powers of two) - 0 = no active
            # alarm. Was never simulated before; see decode_active_alarms().
            "Rejestr alarmów": {"value": 0, "unit": ""},
        }
