import math
import random
from typing import Dict, List, Optional

from app.drivers.base import AbstractControllerDriver, RegisterMapEntry, ControllerModel, AlarmDescription
from app.drivers.registry import register_driver


@register_driver("Carel MPXone Medium")
class CarelMpxOneMediumDriver(AbstractControllerDriver):
    """Carel MPXone, Medium configuration tier - adds EEV superheat control
    and condenser fan/HACCP monitoring on top of the Basic tier. Register
    addresses/types are real, taken from Carel's own "MPXone MODBUS
    Variable List.xlsx" (MPXone_MEDIUM sheet) - see the Basic tier's
    docstring for the full caveat on data type/scale factor inference,
    including the note on "FOk"'s real name/numbering."""

    manufacturer = "Carel MPXone Medium"

    def default_register_map(self) -> List[RegisterMapEntry]:
        return [
            RegisterMapEntry(address=1, name="Sonda Sm (nawiew)", unit="°C", data_type="int16", scale_factor=0.1, register_type="input"),
            RegisterMapEntry(address=3, name="Sonda Sr (powrót)", unit="°C", data_type="int16", scale_factor=0.1, register_type="input"),
            RegisterMapEntry(address=56, name="Nastawa (St)", unit="°C", data_type="int16", scale_factor=0.1, writable=True, register_type="holding"),
            RegisterMapEntry(address=58, name="Różnica załączania (rd)", unit="°C", data_type="int16", scale_factor=0.1, writable=True, register_type="holding"),
            RegisterMapEntry(address=134, name="Nastawa przegrzania (P3)", unit="K", data_type="int16", scale_factor=0.1, writable=True, register_type="holding"),
            RegisterMapEntry(address=16, name="Wyjście analogowe wentylatora skraplacza (FAE)", unit="%", data_type="int16", scale_factor=0.1, register_type="input"),
            RegisterMapEntry(address=52, name="Wyjście analogowe sprężarki (FAG)", unit="%", data_type="int16", scale_factor=0.1, register_type="input"),
            RegisterMapEntry(address=20, name="Licznik alarmów HACCP HA (Han)", data_type="uint16", register_type="input"),
            RegisterMapEntry(address=21, name="Licznik alarmów HACCP HF (HFn)", data_type="uint16", register_type="input"),
            RegisterMapEntry(address=54, name="Zawór elektromagnetyczny (DO_sol)", data_type="uint16", register_type="discrete_input"),
            RegisterMapEntry(address=60, name="Odszranianie (DO_def)", data_type="uint16", register_type="discrete_input"),
            RegisterMapEntry(address=62, name="Wentylator (DO_Fan)", data_type="uint16", register_type="discrete_input"),
            RegisterMapEntry(address=98, name="Sprężarka 2 (FOk)", data_type="uint16", register_type="discrete_input"),
            RegisterMapEntry(address=14, name="Alarm drzwi (dor)", data_type="uint16", register_type="discrete_input"),
            RegisterMapEntry(address=55, name="Rejestr alarmów (OrAlrm)", data_type="uint16", is_alarm_register=True, register_type="discrete_input"),
        ]

    def identify(self, model_hint: Optional[str] = None) -> ControllerModel:
        return ControllerModel(model=model_hint or "MPXone Medium", description="Carel MPXone (konfiguracja Medium) z regulacją EEV i licznikami HACCP")

    def known_alarm_codes(self) -> List[AlarmDescription]:
        return [
            AlarmDescription(code=1, name="ALM", description="Aktywny alarm sterownika (szczegóły w rejestrach DO_*)", severity="warning"),
        ]

    def decode_alarm(self, code: int) -> AlarmDescription:
        for alarm in self.known_alarm_codes():
            if alarm.code == code:
                return alarm
        return AlarmDescription(code=code, name=f"ALM{code}", description="Nieznany kod alarmu", severity="info")

    def simulate_reading(self, tick: float) -> Dict[str, dict]:
        supply = round(1 + 1.2 * math.sin(tick * 0.06) + random.uniform(-0.2, 0.2), 1)
        return_air = round(supply + 3.5 + random.uniform(-0.3, 0.3), 1)
        fan_pct = round(max(0, min(100, 60 + 15 * math.sin(tick * 0.08) + random.uniform(-4, 4))), 0)
        return {
            "Sonda Sm (nawiew)": {"value": supply, "unit": "°C"},
            "Sonda Sr (powrót)": {"value": return_air, "unit": "°C"},
            "Nastawa (St)": {"value": 1.0, "unit": "°C"},
            "Różnica załączania (rd)": {"value": 2.0, "unit": "°C"},
            "Nastawa przegrzania (P3)": {"value": 6.0, "unit": "K"},
            "Wyjście analogowe wentylatora skraplacza (FAE)": {"value": fan_pct, "unit": "%"},
            "Wyjście analogowe sprężarki (FAG)": {"value": round(max(0, min(100, 55 + 10 * math.sin(tick * 0.07) + random.uniform(-3, 3))), 0), "unit": "%"},
            "Licznik alarmów HACCP HA (Han)": {"value": 0, "unit": ""},
            "Licznik alarmów HACCP HF (HFn)": {"value": 0, "unit": ""},
            "Zawór elektromagnetyczny (DO_sol)": {"value": 1 if supply > 1 else 0, "unit": ""},
            "Odszranianie (DO_def)": {"value": 0, "unit": ""},
            "Wentylator (DO_Fan)": {"value": 1, "unit": ""},
            "Sprężarka 2 (FOk)": {"value": 1 if supply > 1 else 0, "unit": ""},
            "Alarm drzwi (dor)": {"value": 0, "unit": ""},
            "Rejestr alarmów (OrAlrm)": {"value": 0, "unit": ""},
        }
