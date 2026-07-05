import math
import random
from typing import Dict, List, Optional

from app.drivers.base import AbstractControllerDriver, RegisterMapEntry, ControllerModel, AlarmDescription
from app.drivers.registry import register_driver


@register_driver("Danfoss")
class DanfossDriver(AbstractControllerDriver):
    """Danfoss AK-CC 210 refrigeration/case controller. Register
    addresses remain unconfirmed placeholders - the real, official
    Danfoss AK-CC 210 instructions manual (RI8MC65M, found on the web)
    confirms Modbus is a real communication option for this controller
    but is a keypad/parameter reference (codes like r01, A13, u09 as
    navigated via the physical buttons), not a Modbus register map, same
    situation as this project's Carel MPXPRO manual. What IS real and
    fixed here: the alarm/fault codes and the factory setpoint, both
    taken directly from that manual's alarm/fault/status code tables and
    settings table - the previous version of this driver had invented
    alarm codes that don't match (e.g. claimed A3 was a high-temperature
    alarm; the real A1 is high temperature and A3 doesn't exist at all).
    Also corrected the simulated setpoint from an invented -18°C freezer
    value to the manual's actual documented factory default (2.0°C) -
    AK-CC 210 is a general-purpose case/room controller, not specifically
    a freezer unit."""

    manufacturer = "Danfoss"

    def default_register_map(self) -> List[RegisterMapEntry]:
        return [
            RegisterMapEntry(address=0, name="Temperatura komory", unit="°C", data_type="int16", scale_factor=0.1),
            RegisterMapEntry(address=1, name="Temperatura parownika", unit="°C", data_type="int16", scale_factor=0.1),
            RegisterMapEntry(address=2, name="Nastawa (SP)", unit="°C", data_type="int16", scale_factor=0.1, writable=True),
            RegisterMapEntry(address=3, name="Różnica załączania (r01)", unit="°C", data_type="int16", scale_factor=0.1, writable=True),
            RegisterMapEntry(address=10, name="Sprężarka", data_type="uint16"),
            RegisterMapEntry(address=11, name="Odszranianie", data_type="uint16"),
            RegisterMapEntry(address=12, name="Wentylator parownika", data_type="uint16"),
            RegisterMapEntry(address=20, name="Kod alarmu", data_type="uint16", is_alarm_register=True),
        ]

    def identify(self, model_hint: Optional[str] = None) -> ControllerModel:
        return ControllerModel(model=model_hint or "AK-CC 210", description="Elektroniczny sterownik chłodniczy Danfoss AK-CC")

    def known_alarm_codes(self) -> List[AlarmDescription]:
        # Real codes from the manual's "Alarm code display" table. The
        # manual describes the physical display cycling through ONE
        # active alarm code at a time (sequential), not a combined
        # bitmask - codes intentionally kept non-power-of-two so
        # _is_bitmask_style() doesn't misclassify this as Carel-style.
        return [
            AlarmDescription(code=1, name="A1", description="Alarm wysokiej temperatury", severity="warning"),
            AlarmDescription(code=2, name="A2", description="Alarm niskiej temperatury", severity="warning"),
            AlarmDescription(code=3, name="A4", description="Alarm drzwi", severity="info"),
            AlarmDescription(code=5, name="A15", description="Alarm wejścia cyfrowego DI1", severity="warning"),
            AlarmDescription(code=6, name="A60", description="Alarm HACCP", severity="warning"),
        ]

    def decode_alarm(self, code: int) -> AlarmDescription:
        for alarm in self.known_alarm_codes():
            if alarm.code == code:
                return alarm
        return AlarmDescription(code=code, name=f"A{code}", description="Nieznany kod alarmu", severity="info")

    def simulate_reading(self, tick: float) -> Dict[str, dict]:
        room = round(2 + 1.5 * math.sin(tick * 0.05) + random.uniform(-0.3, 0.3), 1)
        evap = round(room - 6 + random.uniform(-0.5, 0.5), 1)
        return {
            "Temperatura komory": {"value": room, "unit": "°C"},
            "Temperatura parownika": {"value": evap, "unit": "°C"},
            "Nastawa (SP)": {"value": 2.0, "unit": "°C"},
            "Różnica załączania (r01)": {"value": 2.0, "unit": "°C"},
            "Sprężarka": {"value": 1 if room > 2 else 0, "unit": ""},
            "Odszranianie": {"value": 0, "unit": ""},
            "Wentylator parownika": {"value": 1, "unit": ""},
            # 0 = no active alarm. Was never simulated before, so the
            # register control panel always showed this as a dead "-" and
            # nothing existed to decode - real hardware alarm reading
            # (Etap 3.3) has this to actually exercise now.
            "Kod alarmu": {"value": 0, "unit": ""},
        }
