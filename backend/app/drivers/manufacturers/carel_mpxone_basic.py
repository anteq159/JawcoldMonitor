import math
import random
from typing import Dict, List, Optional

from app.drivers.base import AbstractControllerDriver, RegisterMapEntry, ControllerModel, AlarmDescription
from app.drivers.registry import register_driver


@register_driver("Carel MPXone Basic")
class CarelMpxOneBasicDriver(AbstractControllerDriver):
    """Carel MPXone, Basic configuration tier. Unlike every other profile
    in this app, these register addresses and Modbus object types are
    taken directly from Carel's own "MPXone MODBUS Variable List.xlsx"
    (not invented) - source column names kept in each register's
    description for traceability. Confirms MPXone genuinely uses multiple
    Modbus object types (Input Registers for the two temperature probes,
    Discrete Inputs for output/alarm status, Holding Registers for
    setpoints), not just holding registers like the app's earlier driver
    scaffolding assumed. Data types/scale factors follow this project's
    existing conventions (int16 x0.1 for decimal temperatures) since the
    source spreadsheet's own type/signedness columns didn't map cleanly
    onto a single obvious convention - verify against the full Carel
    variable definition doc before real hardware use, same caveat as
    every profile here, just with real addresses underneath it this time."""

    manufacturer = "Carel MPXone Basic"

    def default_register_map(self) -> List[RegisterMapEntry]:
        return [
            RegisterMapEntry(address=1, name="Sonda Sm (nawiew)", unit="°C", data_type="int16", scale_factor=0.1, register_type="input"),
            RegisterMapEntry(address=3, name="Sonda Sr (powrót)", unit="°C", data_type="int16", scale_factor=0.1, register_type="input"),
            RegisterMapEntry(address=56, name="Nastawa (St)", unit="°C", data_type="int16", scale_factor=0.1, writable=True, register_type="holding"),
            RegisterMapEntry(address=58, name="Różnica załączania (rd)", unit="°C", data_type="int16", scale_factor=0.1, writable=True, register_type="holding"),
            RegisterMapEntry(address=54, name="Zawór elektromagnetyczny (DO_sol)", data_type="uint16", register_type="discrete_input"),
            RegisterMapEntry(address=60, name="Odszranianie (DO_def)", data_type="uint16", register_type="discrete_input"),
            RegisterMapEntry(address=62, name="Wentylator (DO_Fan)", data_type="uint16", register_type="discrete_input"),
            RegisterMapEntry(address=14, name="Alarm drzwi (dor)", data_type="uint16", register_type="discrete_input"),
            RegisterMapEntry(address=55, name="Rejestr alarmów (OrAlrm)", data_type="uint16", is_alarm_register=True, register_type="discrete_input"),
        ]

    def identify(self, model_hint: Optional[str] = None) -> ControllerModel:
        return ControllerModel(model=model_hint or "MPXone Basic", description="Carel MPXone (konfiguracja Basic) - sterownik chłodniczy multiplex")

    def known_alarm_codes(self) -> List[AlarmDescription]:
        # OrAlrm is a single "some alarm is active" status bit in the real
        # variable list, not a multi-bit code register like MPXPRO's - see
        # module docstring. One generic code, matching what the register
        # actually communicates rather than inventing specific fault types
        # it can't distinguish.
        return [
            AlarmDescription(code=1, name="ALM", description="Aktywny alarm sterownika (szczegóły w rejestrach DO_*)", severity="warning"),
        ]

    def decode_alarm(self, code: int) -> AlarmDescription:
        for alarm in self.known_alarm_codes():
            if alarm.code == code:
                return alarm
        return AlarmDescription(code=code, name=f"ALM{code}", description="Nieznany kod alarmu", severity="info")

    def simulate_reading(self, tick: float) -> Dict[str, dict]:
        supply = round(2 + 1.3 * math.sin(tick * 0.06) + random.uniform(-0.2, 0.2), 1)
        return_air = round(supply + 3 + random.uniform(-0.3, 0.3), 1)
        return {
            "Sonda Sm (nawiew)": {"value": supply, "unit": "°C"},
            "Sonda Sr (powrót)": {"value": return_air, "unit": "°C"},
            "Nastawa (St)": {"value": 2.0, "unit": "°C"},
            "Różnica załączania (rd)": {"value": 2.0, "unit": "°C"},
            "Zawór elektromagnetyczny (DO_sol)": {"value": 1 if supply > 2 else 0, "unit": ""},
            "Odszranianie (DO_def)": {"value": 0, "unit": ""},
            "Wentylator (DO_Fan)": {"value": 1, "unit": ""},
            "Alarm drzwi (dor)": {"value": 0, "unit": ""},
            "Rejestr alarmów (OrAlrm)": {"value": 0, "unit": ""},
        }
