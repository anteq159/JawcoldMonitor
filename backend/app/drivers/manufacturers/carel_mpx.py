import math
import random
from typing import Dict, List, Optional

from app.drivers.base import AbstractControllerDriver, RegisterMapEntry, ControllerModel, AlarmDescription
from app.drivers.registry import register_driver


@register_driver("Carel MPX")
class CarelMPXDriver(AbstractControllerDriver):
    """Carel MPXPRO-series controller.

    Register addresses were reverse-engineered by live Modbus scan against
    a real MPXPRO on site (2026-07-09), cross-referenced against Carel's
    own MPXPRO supervisor device model (cfvarmdl/cfdescvar_PL). The key
    finding: Carel's documented "Analogue/Digital variable index" is
    1-based (matches what a technician sees on the controller/HMI, e.g.
    "register 8"), while pymodbus's read_holding_registers()/read_coils()
    address parameter is the 0-based wire address - so the real Modbus
    address is (Carel variable index - 1), not the index itself. This one
    off-by-one was the entire bug in the two previous driver revisions:
    it produced physically impossible readings (-204.8°C, -806.4 K) and,
    for the alarm relay specifically, read the wrong coil entirely -
    address 115 is "s_ReleInvertedAlarm" (active when there is NO alarm),
    one past the real summary alarm coil "s_ReleAlarm" at 114 - which is
    exactly why 1.16.0/1.16.1 logged a false hardware alarm right after
    startup.

    Every register below was confirmed live. "St" (39) and "Sonda 1/2/3"
    (7/8/9) were confirmed by changing the value on the controller's own
    keypad and watching it update on the panel. "rd" (41) and "P3" (61)
    were confirmed the same way 2026-07-09 (set to 2.0°C / 7.0K on the
    keypad, matched exactly on re-scan). Sd, SH and the EEV registers
    (Po2 returns a Modbus exception) read back as "not installed" on real
    hardware, so they're left out rather than shown as fake sensors."""

    manufacturer = "Carel MPX"

    def default_register_map(self) -> List[RegisterMapEntry]:
        return [
            RegisterMapEntry(address=7, name="Sonda 1", unit="°C", data_type="int16", scale_factor=0.1, register_type="holding"),
            RegisterMapEntry(address=8, name="Sonda 2", unit="°C", data_type="int16", scale_factor=0.1, register_type="holding"),
            RegisterMapEntry(address=9, name="Sonda 3", unit="°C", data_type="int16", scale_factor=0.1, register_type="holding"),
            RegisterMapEntry(address=10, name="Sonda 4", unit="°C", data_type="int16", scale_factor=0.1, register_type="holding"),
            RegisterMapEntry(address=11, name="Sonda 5", unit="°C", data_type="int16", scale_factor=0.1, register_type="holding"),
            RegisterMapEntry(address=39, name="Nastawa (St)", unit="°C", data_type="int16", scale_factor=0.1, writable=True, register_type="holding"),
            RegisterMapEntry(address=41, name="Różnica załączania (rd)", unit="°C", data_type="int16", scale_factor=0.1, writable=True, register_type="holding"),
            RegisterMapEntry(address=61, name="Nastawa przegrzania (P3)", unit="K", data_type="int16", scale_factor=0.1, writable=True, register_type="holding"),
            RegisterMapEntry(address=12, name="Błąd czujnika S1 (rE1)", data_type="uint16", register_type="coil"),
            RegisterMapEntry(address=13, name="Błąd czujnika S2", data_type="uint16", register_type="coil"),
            RegisterMapEntry(address=14, name="Błąd czujnika S3", data_type="uint16", register_type="coil"),
            RegisterMapEntry(address=15, name="Błąd czujnika S4", data_type="uint16", register_type="coil"),
            RegisterMapEntry(address=16, name="Błąd czujnika S5", data_type="uint16", register_type="coil"),
            RegisterMapEntry(address=23, name="Alarm niskiej temperatury (LO)", data_type="uint16", register_type="coil"),
            RegisterMapEntry(address=24, name="Alarm wysokiej temperatury (HI)", data_type="uint16", register_type="coil"),
            RegisterMapEntry(address=114, name="Przekaźnik alarmowy (zbiorczy)", data_type="uint16", is_alarm_register=True, register_type="coil"),
        ]

    def identify(self, model_hint: Optional[str] = None) -> ControllerModel:
        return ControllerModel(model=model_hint or "MPXPRO", description="Sterownik Carel MPXPRO (Sonda 1, nastawy, alarmy - zweryfikowane na sprzęcie)")

    def known_alarm_codes(self) -> List[AlarmDescription]:
        return [
            AlarmDescription(code=1, name="ALM", description="Aktywny przekaźnik alarmowy (szczegóły w rejestrach LO/HI/rE1)", severity="warning"),
        ]

    def decode_alarm(self, code: int) -> AlarmDescription:
        for alarm in self.known_alarm_codes():
            if alarm.code == code:
                return alarm
        return AlarmDescription(code=code, name=f"ALM{code}", description="Nieznany kod alarmu", severity="info")

    def simulate_reading(self, tick: float) -> Dict[str, dict]:
        room = round(1 + 1.3 * math.sin(tick * 0.065) + random.uniform(-0.2, 0.2), 1)
        return {
            "Sonda 1": {"value": room, "unit": "°C"},
            "Sonda 2": {"value": round(room + 3 + random.uniform(-0.3, 0.3), 1), "unit": "°C"},
            "Sonda 3": {"value": round(room + 3.1 + random.uniform(-0.3, 0.3), 1), "unit": "°C"},
            "Sonda 4": {"value": round(room + 3.15 + random.uniform(-0.3, 0.3), 1), "unit": "°C"},
            "Sonda 5": {"value": round(room + 3.2 + random.uniform(-0.3, 0.3), 1), "unit": "°C"},
            "Nastawa (St)": {"value": 1.0, "unit": "°C"},
            "Różnica załączania (rd)": {"value": 2.0, "unit": "°C"},
            "Nastawa przegrzania (P3)": {"value": 7.0, "unit": "K"},
            "Błąd czujnika S1 (rE1)": {"value": 0, "unit": ""},
            "Błąd czujnika S2": {"value": 0, "unit": ""},
            "Błąd czujnika S3": {"value": 0, "unit": ""},
            "Błąd czujnika S4": {"value": 0, "unit": ""},
            "Błąd czujnika S5": {"value": 0, "unit": ""},
            "Alarm niskiej temperatury (LO)": {"value": 1 if room < 1 else 0, "unit": ""},
            "Alarm wysokiej temperatury (HI)": {"value": 0, "unit": ""},
            "Przekaźnik alarmowy (zbiorczy)": {"value": 0, "unit": ""},
        }
