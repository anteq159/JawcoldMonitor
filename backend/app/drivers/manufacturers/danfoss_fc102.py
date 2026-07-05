import math
import random
from typing import Dict, List, Optional

from app.drivers.base import AbstractControllerDriver, RegisterMapEntry, ControllerModel, AlarmDescription
from app.drivers.registry import register_driver


@register_driver("Danfoss FC102")
class DanfossFc102Driver(AbstractControllerDriver):
    """Danfoss VLT FC 102 - a variable frequency drive for compressor/fan
    motor speed control, not a refrigeration case controller like every
    other profile in this app. Included because the user provided real
    Danfoss documentation for it (DanfossFC102.xls, "FC102 Modbus Holding
    Registers" sheet) - a genuinely different device category worth
    representing accurately rather than skipping.

    Register addresses are real, taken directly from that sheet's "Modbus
    4x Holding Register (decimal)" column (all Holding Registers - FC102
    doesn't need the multi-object-type handling MPXone does). Scale
    factors are NOT from that sheet - its own scaling reference tab
    ("FC102 Parameter Details") was empty in the file provided. The
    0.1/0.01 factors used here follow Danfoss's well-documented FC-series
    process-data convention (reference/frequency values as raw x10,
    current as raw x100) but should be confirmed against the full FC-series
    Programming Guide's parameter list before real hardware use - same as
    every profile here, this is a best-effort starting point, not verified
    against the authoritative source. Alarm/Warning Word are real hex
    bitmask registers (several bits can be set at once) but the exact
    bit-to-fault-name mapping requires that same Programming Guide's fault
    table, which isn't in the provided files - decode_alarm() below is
    deliberately generic rather than guessing specific fault names."""

    manufacturer = "Danfoss FC102"

    def default_register_map(self) -> List[RegisterMapEntry]:
        return [
            RegisterMapEntry(address=16000, name="Słowo sterujące (Control Word)", data_type="uint16", writable=True),
            RegisterMapEntry(address=16010, name="Zadana częstotliwość (Reference)", unit="Hz", data_type="uint16", scale_factor=0.1, writable=True),
            RegisterMapEntry(address=16030, name="Słowo statusu (Status Word)", data_type="uint16"),
            RegisterMapEntry(address=16140, name="Prąd silnika", unit="A", data_type="uint16", scale_factor=0.01),
            RegisterMapEntry(address=1200, name="Moc silnika (znamionowa)", unit="kW", data_type="uint16", scale_factor=0.1),
            RegisterMapEntry(address=16920, name="Słowo ostrzeżeń (Warning Word)", data_type="uint16"),
            RegisterMapEntry(address=16900, name="Słowo alarmów (Alarm Word)", data_type="uint16", is_alarm_register=True),
        ]

    def identify(self, model_hint: Optional[str] = None) -> ControllerModel:
        return ControllerModel(model=model_hint or "VLT FC 102", description="Falownik Danfoss VLT FC 102 do sterowania silnikiem sprężarki/wentylatora")

    def known_alarm_codes(self) -> List[AlarmDescription]:
        # Alarm Word is a real hex bitmask register (several bits can be
        # active at once), but the bit-to-fault-name table isn't in the
        # documentation provided - see module docstring. One generic code
        # rather than guessing specific fault names.
        return [
            AlarmDescription(code=1, name="ALM", description="Aktywny alarm falownika (szczegóły w Alarm Word / panelu LCP)", severity="critical"),
        ]

    def decode_alarm(self, code: int) -> AlarmDescription:
        for alarm in self.known_alarm_codes():
            if alarm.code == code:
                return alarm
        return AlarmDescription(code=code, name=f"ALM{code}", description="Nieznany kod alarmu", severity="info")

    def simulate_reading(self, tick: float) -> Dict[str, dict]:
        freq = round(max(0, 35 + 8 * math.sin(tick * 0.05) + random.uniform(-1, 1)), 1)
        current = round(3.5 + (freq / 50) * 4 + random.uniform(-0.2, 0.2), 2)
        return {
            "Słowo sterujące (Control Word)": {"value": 1, "unit": ""},
            "Zadana częstotliwość (Reference)": {"value": freq, "unit": "Hz"},
            "Słowo statusu (Status Word)": {"value": 0x0F, "unit": ""},
            "Prąd silnika": {"value": current, "unit": "A"},
            "Moc silnika (znamionowa)": {"value": 22.0, "unit": "kW"},
            "Słowo ostrzeżeń (Warning Word)": {"value": 0, "unit": ""},
            "Słowo alarmów (Alarm Word)": {"value": 0, "unit": ""},
        }
