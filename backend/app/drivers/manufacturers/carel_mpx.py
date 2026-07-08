import math
import random
from typing import Dict, List, Optional

from app.drivers.base import AbstractControllerDriver, RegisterMapEntry, ControllerModel, AlarmDescription
from app.drivers.registry import register_driver


@register_driver("Carel MPX")
class CarelMPXDriver(AbstractControllerDriver):
    """Carel MPXPRO-series controller with electronic expansion valve (EEV)
    control.

    STATUS (2026-07-08): a fuller register map derived from Carel's MPXPRO
    supervisor device model (cfvarmdl/cfdescvar_PL) plus the documented
    Carel-Modbus threshold-128 mapping rule was deployed and tested against
    a real unit on site. Only address 7 (holding, "Sonda 1") checked out -
    confirmed independently against the real controller and returning a
    plausible room temperature. Every other derived address (S2, Sd, SH,
    setpoints, EEV, alarm coils) returned physically impossible values
    (-204.8°C, -806.4 K) and the alarm coil produced a false hardware-alarm
    log entry - so the cfvarmdl column read as "supervisor analogue index"
    does not reliably correspond to the real Modbus holding register on
    this hardware, and the full mapping is wrong, not just imprecise.

    Deliberately pared back to the one confirmed register rather than
    left in place returning garbage. Restoring EEV/alarm/setpoint
    monitoring needs each additional address confirmed on-site (e.g. one
    register at a time in ModScan32 against the real controller, or the
    site's actual Carel supervisor configuration export) before being
    added back - guessing again risks another false alarm on a live
    monitored system."""

    manufacturer = "Carel MPX"

    def default_register_map(self) -> List[RegisterMapEntry]:
        return [
            RegisterMapEntry(address=7, name="Sonda 1", unit="°C", data_type="int16", scale_factor=0.1, register_type="holding"),
        ]

    def identify(self, model_hint: Optional[str] = None) -> ControllerModel:
        return ControllerModel(model=model_hint or "MPXPRO", description="Sterownik chłodniczy Carel MPXPRO (mapa rejestrów w trakcie weryfikacji na miejscu)")

    def known_alarm_codes(self) -> List[AlarmDescription]:
        # No alarm register confirmed yet - see class docstring. Left
        # empty rather than guessed, since a wrong coil address already
        # produced one false hardware-alarm log entry on the real unit.
        return []

    def decode_alarm(self, code: int) -> AlarmDescription:
        return AlarmDescription(code=code, name=f"ALM{code}", description="Nieznany kod alarmu", severity="info")

    def simulate_reading(self, tick: float) -> Dict[str, dict]:
        room = round(1 + 1.3 * math.sin(tick * 0.065) + random.uniform(-0.2, 0.2), 1)
        return {
            "Sonda 1": {"value": room, "unit": "°C"},
        }
