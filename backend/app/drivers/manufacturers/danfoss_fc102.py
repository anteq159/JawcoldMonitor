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
    Danfoss documentation for it - a genuinely different device category
    worth representing accurately rather than skipping.

    Rebuilt from a second, more authoritative source (gwtdanfossfc102.pdf,
    a dedicated "Danfoss FC-102 Modbus" register table published by Xylem/
    Goulds for their OEM'd drives) after it turned up two real problems
    with the first version, which had been built from a spreadsheet
    export (DanfossFC102.xls) with no scaling reference:
    1. Every address here was off by exactly one from the earlier source
       (e.g. Alarm Word at 16899, not 16900) - the two documents evidently
       express the same registers in different conventions (1-based
       parameter-derived numbering vs. the 0-based wire address pymodbus
       actually needs). This PDF's "ModBus Address" column is used
       directly as the wire address.
    2. This PDF has a "Conversion Index" column the old source lacked.
       Danfoss's convention maps small negative indices to simple decimal
       scaling (-1=x0.1, -2=x0.01, -3=x0.001), which is well documented
       and used below - but it also uses special non-decimal indices
       (67, 74, 75, 100...) for things like RPM/hour/temperature
       registers, which need the FC-series Programming Guide's full
       conversion-index table to interpret correctly. That table isn't
       in what was provided, so registers using those special indices
       (motor power, heatsink temp, speed in RPM...) are deliberately
       left out rather than guessed. What's kept below only uses the
       indices confirmed by the well-known simple convention.

    Nothing here is writable. Real speed/start-stop control over Modbus
    requires sending a correctly sequenced Control Word (specific bit
    combinations, not just "write a number") per the FC-series fieldbus
    profile - not something this app's simple single-register write
    matches safely, so this driver is monitoring-only.

    Cross-checked the addressing correction above against a second copy
    of this same register list living inside the original DanfossFC102.xls
    (a "Data readout" sheet, separate from the "FC102 Modbus Holding
    Registers" sheet used originally) which also has its own
    "Conversion index" column - its index-to-factor table confirms simple
    negative indices really do mean x10^index (e.g. -2 -> x0.01) with no
    directional ambiguity, and independently reproduces the same +1 offset
    on every overlapping register (its "Alarm Word" is listed as 16900,
    Control Word as 16000 - both exactly 1 above this driver's addresses),
    reinforcing that the correction was right rather than undermining it.
    That sheet also has three more registers using confirmed-simple
    indices that the curated PDF didn't happen to include, added below
    (Frequency, Motor Thermal, Torque %)."""

    manufacturer = "Danfoss FC102"

    def default_register_map(self) -> List[RegisterMapEntry]:
        return [
            RegisterMapEntry(address=16029, name="Słowo statusu (16-03 Status Word)", data_type="uint16"),
            RegisterMapEntry(address=16009, name="Wartość zadana (16-01 Reference)", data_type="int32", scale_factor=0.001),
            RegisterMapEntry(address=16019, name="Wartość zadana % (16-02 Reference %)", unit="%", data_type="int16", scale_factor=0.1),
            RegisterMapEntry(address=16129, name="Częstotliwość wyjściowa (16-13 Frequency)", unit="Hz", data_type="uint16", scale_factor=0.1),
            RegisterMapEntry(address=16139, name="Prąd silnika (16-14 Motor Current)", unit="A", data_type="int32", scale_factor=0.01),
            RegisterMapEntry(address=16179, name="Obciążenie termiczne silnika (16-18 Motor Thermal)", unit="%", data_type="uint16"),
            RegisterMapEntry(address=16219, name="Moment obrotowy (16-22 Torque)", unit="%", data_type="int16"),
            RegisterMapEntry(address=16299, name="Napięcie obwodu DC (16-30 DC Link Voltage)", unit="V", data_type="uint16"),
            RegisterMapEntry(address=16919, name="Słowo ostrzeżeń (16-92 Warning Word)", data_type="uint32"),
            RegisterMapEntry(address=16899, name="Słowo alarmów (16-90 Alarm Word)", data_type="uint32", is_alarm_register=True),
        ]

    def identify(self, model_hint: Optional[str] = None) -> ControllerModel:
        return ControllerModel(model=model_hint or "VLT FC 102", description="Falownik Danfoss VLT FC 102 do sterowania silnikiem sprężarki/wentylatora (tylko odczyt)")

    def known_alarm_codes(self) -> List[AlarmDescription]:
        # Alarm Word is a real 32-bit bitmask register (several bits can
        # be active at once), but the bit-to-fault-name table requires the
        # Programming Guide's fault list, not in what was provided - one
        # generic code rather than guessing specific fault names.
        return [
            AlarmDescription(code=1, name="ALM", description="Aktywny alarm falownika (szczegóły w Alarm Word / panelu LCP)", severity="critical"),
        ]

    def decode_alarm(self, code: int) -> AlarmDescription:
        for alarm in self.known_alarm_codes():
            if alarm.code == code:
                return alarm
        return AlarmDescription(code=code, name=f"ALM{code}", description="Nieznany kod alarmu", severity="info")

    def simulate_reading(self, tick: float) -> Dict[str, dict]:
        ref_pct = round(max(0, 70 + 15 * math.sin(tick * 0.05) + random.uniform(-2, 2)), 1)
        current = round(3.5 + (ref_pct / 100) * 4 + random.uniform(-0.2, 0.2), 2)
        freq = round((ref_pct / 100) * 50, 1)
        return {
            "Słowo statusu (16-03 Status Word)": {"value": 0x0F, "unit": ""},
            "Wartość zadana (16-01 Reference)": {"value": ref_pct, "unit": ""},
            "Wartość zadana % (16-02 Reference %)": {"value": ref_pct, "unit": "%"},
            "Częstotliwość wyjściowa (16-13 Frequency)": {"value": freq, "unit": "Hz"},
            "Prąd silnika (16-14 Motor Current)": {"value": current, "unit": "A"},
            "Obciążenie termiczne silnika (16-18 Motor Thermal)": {"value": round(30 + (ref_pct / 100) * 25, 0), "unit": "%"},
            "Moment obrotowy (16-22 Torque)": {"value": round(40 + (ref_pct / 100) * 30 + random.uniform(-2, 2), 0), "unit": "%"},
            "Napięcie obwodu DC (16-30 DC Link Voltage)": {"value": 565, "unit": "V"},
            "Słowo ostrzeżeń (16-92 Warning Word)": {"value": 0, "unit": ""},
            "Słowo alarmów (16-90 Alarm Word)": {"value": 0, "unit": ""},
        }
