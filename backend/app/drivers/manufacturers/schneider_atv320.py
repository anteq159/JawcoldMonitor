import math
import random
from typing import Dict, List, Optional

from app.drivers.base import AbstractControllerDriver, RegisterMapEntry, ControllerModel, AlarmDescription
from app.drivers.registry import register_driver


@register_driver("Schneider Electric ATV320")
class SchneiderAtv320Driver(AbstractControllerDriver):
    """Schneider Electric Altivar Machine ATV320 - a variable speed drive
    (compressor, condenser fan or pump motor), monitored over its embedded
    Modbus RTU port.

    Addresses are the drive's "logic addresses", used directly as the wire
    (PDU) address with function 3. Sources:
    - ATV320 Modbus manual NVE41308 (04/2016): serial settings - address
      1-247, 19.2 kbps, [Modbus format] tFO = 8O1/8E1/8N1/8N2 (factory 8E1);
      worked example W3104 HSP = 01F4 hex = 50 Hz (so 0.1 Hz units) and
      W9001 ACC = 000D hex = 1.3 s (0.1 s units); the CiA402 bit layout of
      the status word ETA (bit 3 = fault, bit 7 = warning).
    - ATV32 Modbus manual S1A28698 (same platform as the ATV320): LCR motor
      current = 3204, LFT last detected fault = 7121.
    - Altivar communication variables (shared across the family):
      ETA 3201, RFR 3202, FRH 3203, LCR 3204, OTR 3205, ULN 3207,
      THD 3209, OPR 3211, HSP 3104, LSP 3105.
    The full per-parameter table (ATV320_CommunicationParameters NVE41316,
    xlsx) is behind Schneider's download portal; anything not confirmed by
    the sources above (motor thermal state, run time, speed in rpm) is left
    out rather than guessed. ULN uses the family's 0.1 V resolution - if
    the panel shows ~40 V on a 400 V supply, set its scale to 1 in
    Konfiguracja.

    Monitoring only: starting/stopping and the speed reference go through
    the CiA402 control word CMD (8501) as a state-machine sequence, which a
    single "write a value" from the panel cannot do safely. HSP/LSP/ACC/DEC
    are shown as parameters; the write flag can be switched on per profile
    in Konfiguracja if the site wants to tune them from the panel.

    Bus format: the drive ships 8E1. To share a bus with Carel MPXPRO
    (fixed 19200 8N2) set tFO = 8N2 and tbr = 19.2 on the drive's keypad
    (CONF > FULL > COM > MODBUS NETWORK), plus a unique Add."""

    manufacturer = "Schneider Electric ATV320"

    def default_register_map(self) -> List[RegisterMapEntry]:
        return [
            RegisterMapEntry(address=3202, name="Częstotliwość wyjściowa (rFr)", unit="Hz", data_type="int16", scale_factor=0.1),
            RegisterMapEntry(address=3203, name="Częstotliwość zadana (FrH)", unit="Hz", data_type="int16", scale_factor=0.1),
            RegisterMapEntry(address=3204, name="Prąd silnika (LCr)", unit="A", data_type="uint16", scale_factor=0.1),
            RegisterMapEntry(address=3205, name="Moment silnika (Otr)", unit="%", data_type="int16"),
            RegisterMapEntry(address=3211, name="Moc silnika (Opr)", unit="%", data_type="int16"),
            RegisterMapEntry(address=3207, name="Napięcie sieci (ULn)", unit="V", data_type="uint16", scale_factor=0.1),
            RegisterMapEntry(address=3209, name="Stan termiczny napędu (tHd)", unit="%", data_type="uint16"),
            # Status word ETA (CiA402) - bit 2 operation enabled (running),
            # bit 3 fault, bit 7 warning.
            RegisterMapEntry(address=3201, name="Praca (napęd załączony)", data_type="uint16", bit=2, category="status"),
            RegisterMapEntry(address=3201, name="Błąd napędu", data_type="uint16", bit=3, category="alarm"),
            RegisterMapEntry(address=3201, name="Ostrzeżenie napędu", data_type="uint16", bit=7, category="alarm"),
            RegisterMapEntry(address=7121, name="Ostatni błąd (LFt, kod)", data_type="uint16", category="parameter",
                             description="Kod ostatniego wykrytego błędu wg instrukcji ATV320 (0 = brak)"),
            RegisterMapEntry(address=3104, name="Prędkość maksymalna (HSP)", unit="Hz", data_type="uint16", scale_factor=0.1, category="parameter"),
            RegisterMapEntry(address=3105, name="Prędkość minimalna (LSP)", unit="Hz", data_type="uint16", scale_factor=0.1, category="parameter"),
            RegisterMapEntry(address=9001, name="Czas przyspieszania (ACC)", unit="s", data_type="uint16", scale_factor=0.1, category="parameter"),
            RegisterMapEntry(address=9002, name="Czas hamowania (dEC)", unit="s", data_type="uint16", scale_factor=0.1, category="parameter"),
        ]

    def identify(self, model_hint: Optional[str] = None) -> ControllerModel:
        return ControllerModel(
            model=model_hint or "ATV320",
            description=(
                "Falownik Schneider Electric Altivar Machine ATV320 (sprężarka / wentylator / pompa) - "
                "odczyt pracy, prądu, częstotliwości i błędów. Na wspólnej magistrali z Carel MPXPRO "
                "ustaw w napędzie format 8N2 i 19,2 kb/s."
            ),
        )

    def known_alarm_codes(self) -> List[AlarmDescription]:
        # Faults are read as bits of the status word (alarm-category flags
        # above), not through a coded alarm register.
        return []

    def decode_alarm(self, code: int) -> AlarmDescription:
        return AlarmDescription(code=code, name=f"LFt{code}", description="Błąd napędu ATV320", severity="critical")

    def simulate_reading(self, tick: float) -> Dict[str, dict]:
        load = max(0.0, min(1.0, 0.7 + 0.2 * math.sin(tick * 0.04) + random.uniform(-0.03, 0.03)))
        freq = round(50 * load, 1)
        return {
            "Częstotliwość wyjściowa (rFr)": {"value": freq, "unit": "Hz"},
            "Częstotliwość zadana (FrH)": {"value": round(freq + random.uniform(-0.2, 0.2), 1), "unit": "Hz"},
            "Prąd silnika (LCr)": {"value": round(2.0 + 6.0 * load + random.uniform(-0.1, 0.1), 1), "unit": "A"},
            "Moment silnika (Otr)": {"value": round(35 + 50 * load), "unit": "%"},
            "Moc silnika (Opr)": {"value": round(30 + 55 * load), "unit": "%"},
            "Napięcie sieci (ULn)": {"value": round(400 + random.uniform(-4, 4), 1), "unit": "V"},
            "Stan termiczny napędu (tHd)": {"value": round(40 + 25 * load), "unit": "%"},
            "Praca (napęd załączony)": {"value": 1, "unit": ""},
            "Błąd napędu": {"value": 0, "unit": ""},
            "Ostrzeżenie napędu": {"value": 0, "unit": ""},
            "Ostatni błąd (LFt, kod)": {"value": 0, "unit": ""},
            "Prędkość maksymalna (HSP)": {"value": 50.0, "unit": "Hz"},
            "Prędkość minimalna (LSP)": {"value": 20.0, "unit": "Hz"},
            "Czas przyspieszania (ACC)": {"value": 3.0, "unit": "s"},
            "Czas hamowania (dEC)": {"value": 3.0, "unit": "s"},
        }
