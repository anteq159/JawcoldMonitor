import math
import random
from typing import Dict, List, Optional

from app.drivers.base import AbstractControllerDriver, RegisterMapEntry, ControllerModel, AlarmDescription
from app.drivers.registry import register_driver


@register_driver("Carel PJEZ")
class CarelPjezDriver(AbstractControllerDriver):
    """Representative profile for a Carel PJEZ - a dedicated electronic
    expansion valve (EEV) driver, typically paired with a separate cell
    controller rather than acting as a standalone case controller (unlike
    MPXPRO, which integrates both). Register map focuses on valve control
    only - no room temperature/compressor output here, that's the paired
    controller's job. Register addresses are plausible demonstration
    values - verify against the specific model's official Modbus
    documentation before use against real hardware."""

    manufacturer = "Carel PJEZ"

    def default_register_map(self) -> List[RegisterMapEntry]:
        return [
            RegisterMapEntry(address=300, name="Sonda ssania (temperatura)", unit="°C", data_type="int16", scale_factor=0.1),
            RegisterMapEntry(address=301, name="Ciśnienie ssania", unit="bar", data_type="int16", scale_factor=0.01),
            RegisterMapEntry(address=302, name="Przegrzanie", unit="K", data_type="int16", scale_factor=0.1),
            RegisterMapEntry(address=303, name="Nastawa przegrzania", unit="K", data_type="int16", scale_factor=0.1, writable=True),
            RegisterMapEntry(address=310, name="Otwarcie zaworu EEV", unit="%", data_type="uint16"),
            RegisterMapEntry(address=400, name="Rejestr alarmów", data_type="uint16", is_alarm_register=True),
        ]

    def identify(self, model_hint: Optional[str] = None) -> ControllerModel:
        return ControllerModel(model=model_hint or "PJEZ", description="Sterownik zaworu rozprężnego EEV Carel PJEZ")

    def known_alarm_codes(self) -> List[AlarmDescription]:
        return [
            AlarmDescription(code=1, name="E1", description="Awaria sondy ssania", severity="critical"),
            AlarmDescription(code=2, name="E2", description="Awaria silnika zaworu", severity="critical"),
            AlarmDescription(code=4, name="LO", description="Niskie przegrzanie - ryzyko zalania cieczą", severity="warning"),
        ]

    def decode_alarm(self, code: int) -> AlarmDescription:
        for alarm in self.known_alarm_codes():
            if alarm.code == code:
                return alarm
        return AlarmDescription(code=code, name=f"E{code}", description="Nieznany kod alarmu", severity="info")

    def simulate_reading(self, tick: float) -> Dict[str, dict]:
        suction_temp = round(-8 + 1.5 * math.sin(tick * 0.08) + random.uniform(-0.3, 0.3), 1)
        superheat = round(6 + random.uniform(-0.8, 0.8), 1)
        eev_opening = round(max(0, min(100, 35 + 10 * math.sin(tick * 0.09) + random.uniform(-3, 3))), 0)
        return {
            "Sonda ssania (temperatura)": {"value": suction_temp, "unit": "°C"},
            "Ciśnienie ssania": {"value": round(2.1 + random.uniform(-0.1, 0.1), 2), "unit": "bar"},
            "Przegrzanie": {"value": superheat, "unit": "K"},
            "Nastawa przegrzania": {"value": 6.0, "unit": "K"},
            "Otwarcie zaworu EEV": {"value": eev_opening, "unit": "%"},
            # Bitmask register (codes are powers of two) - 0 = no active alarm.
            "Rejestr alarmów": {"value": 0, "unit": ""},
        }
