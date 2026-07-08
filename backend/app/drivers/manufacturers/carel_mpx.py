import math
import random
from typing import Dict, List, Optional

from app.drivers.base import AbstractControllerDriver, RegisterMapEntry, ControllerModel, AlarmDescription
from app.drivers.registry import register_driver


@register_driver("Carel MPX")
class CarelMPXDriver(AbstractControllerDriver):
    """Carel MPXPRO-series controller with electronic expansion valve (EEV)
    control - distinct from the IR33 driver by superheat/EEV registers and
    HACCP alarm logging.

    Addresses are real, taken from Carel's own MPXPRO supervisor device
    model (cfvarmdl + cfdescvar_PL, 494 variables) supplied for this
    project. Those files use Carel supervisory addressing (separate
    analogue/integer/digital spaces); the Modbus mapping applied here is
    Carel's documented standard rule with threshold 128 ("A step into
    Connectivity", Carel - MODbus correspondence): analogue variable N ->
    holding register N, integer variable N -> holding register 127+N,
    digital and alarm variables -> coil at their digital address. Analogue
    values are transmitted x10 (one decimal), hence scale 0.1; integer and
    digital values are raw. MPXPRO auto-detects Carel vs Modbus protocol
    on its RS485 supervisor port (manual +0300055PL, ch. 5).

    Alarms: unlike a bitmask register, MPXPRO exposes each alarm as its
    own digital variable. The summary "alarm relay status" (s_ReleAlarm,
    coil 115) is used as the alarm register (1 = any active alarm), and
    the operationally important individual alarms (HI/LO/dor/LSH/rE1)
    are mapped as separate 0/1 coil entries so they can be seen and
    thresholded directly. The one thing not verifiable without hardware
    is the threshold variant itself (128 vs 208/extended) - if registers
    >=128 read wrong on site, the integer entries need offset 208."""

    manufacturer = "Carel MPX"

    def default_register_map(self) -> List[RegisterMapEntry]:
        return [
            # Analogowe (holding, wartości x10)
            RegisterMapEntry(address=8, name="Czujnik S1 (komora)", unit="°C", data_type="int16", scale_factor=0.1, register_type="holding"),
            RegisterMapEntry(address=9, name="Czujnik S2 (parownik)", unit="°C", data_type="int16", scale_factor=0.1, register_type="holding"),
            RegisterMapEntry(address=7, name="Temperatura regulacji (reg)", unit="°C", data_type="int16", scale_factor=0.1, register_type="holding"),
            RegisterMapEntry(address=1, name="Temperatura odszraniania (Sd)", unit="°C", data_type="int16", scale_factor=0.1, register_type="holding"),
            RegisterMapEntry(address=3, name="Przegrzanie (SH)", unit="K", data_type="int16", scale_factor=0.1, register_type="holding"),
            RegisterMapEntry(address=40, name="Nastawa (St)", unit="°C", data_type="int16", scale_factor=0.1, writable=True, register_type="holding"),
            RegisterMapEntry(address=42, name="Różnica załączania (rd)", unit="°C", data_type="int16", scale_factor=0.1, writable=True, register_type="holding"),
            RegisterMapEntry(address=62, name="Nastawa przegrzania (P3)", unit="K", data_type="int16", scale_factor=0.1, writable=True, register_type="holding"),
            # Całkowite (holding = 127 + adres Carel)
            RegisterMapEntry(address=128, name="Otwarcie zaworu EEV (Po2)", unit="%", data_type="uint16", register_type="holding"),
            RegisterMapEntry(address=136, name="Pozycja zaworu EEV (PF)", unit="kroki", data_type="uint16", register_type="holding"),
            # Cyfrowe (coils)
            RegisterMapEntry(address=1, name="Przekaźnik zaworu/sprężarki (rl1)", data_type="uint16", register_type="coil"),
            RegisterMapEntry(address=2, name="Przekaźnik odszraniania (rl2)", data_type="uint16", register_type="coil"),
            RegisterMapEntry(address=65, name="Status odszraniania (dEF)", data_type="uint16", register_type="coil"),
            # Alarmy - pojedyncze zmienne cyfrowe, nie bitmaska
            RegisterMapEntry(address=25, name="Alarm wysokiej temperatury (HI)", data_type="uint16", register_type="coil"),
            RegisterMapEntry(address=24, name="Alarm niskiej temperatury (LO)", data_type="uint16", register_type="coil"),
            RegisterMapEntry(address=57, name="Alarm otwartych drzwi (dor)", data_type="uint16", register_type="coil"),
            RegisterMapEntry(address=32, name="Alarm niskiego przegrzania (LSH)", data_type="uint16", register_type="coil"),
            RegisterMapEntry(address=13, name="Błąd czujnika S1 (rE1)", data_type="uint16", register_type="coil"),
            RegisterMapEntry(address=115, name="Przekaźnik alarmowy (zbiorczy)", data_type="uint16", is_alarm_register=True, register_type="coil"),
        ]

    def identify(self, model_hint: Optional[str] = None) -> ControllerModel:
        return ControllerModel(model=model_hint or "MPXPRO", description="Sterownik chłodniczy Carel MPXPRO z zaworem EEV")

    def known_alarm_codes(self) -> List[AlarmDescription]:
        # The alarm register is the summary alarm relay coil (0/1) -
        # individual causes are visible in the dedicated alarm entries
        # above and in the controller's own display codes.
        return [
            AlarmDescription(code=1, name="ALM", description="Aktywny przekaźnik alarmowy (szczegóły w rejestrach alarmów HI/LO/dor/LSH/rE1)", severity="warning"),
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
            "Czujnik S1 (komora)": {"value": room, "unit": "°C"},
            "Czujnik S2 (parownik)": {"value": evap, "unit": "°C"},
            "Temperatura regulacji (reg)": {"value": room, "unit": "°C"},
            "Temperatura odszraniania (Sd)": {"value": evap, "unit": "°C"},
            "Przegrzanie (SH)": {"value": superheat, "unit": "K"},
            "Nastawa (St)": {"value": 1.0, "unit": "°C"},
            "Różnica załączania (rd)": {"value": 2.0, "unit": "°C"},
            "Nastawa przegrzania (P3)": {"value": 10.0, "unit": "K"},
            "Otwarcie zaworu EEV (Po2)": {"value": eev_opening, "unit": "%"},
            "Pozycja zaworu EEV (PF)": {"value": round(eev_opening * 4.8), "unit": "kroki"},
            "Przekaźnik zaworu/sprężarki (rl1)": {"value": 1 if room > 1 else 0, "unit": ""},
            "Przekaźnik odszraniania (rl2)": {"value": 0, "unit": ""},
            "Status odszraniania (dEF)": {"value": 0, "unit": ""},
            "Alarm wysokiej temperatury (HI)": {"value": 0, "unit": ""},
            "Alarm niskiej temperatury (LO)": {"value": 0, "unit": ""},
            "Alarm otwartych drzwi (dor)": {"value": 0, "unit": ""},
            "Alarm niskiego przegrzania (LSH)": {"value": 0, "unit": ""},
            "Błąd czujnika S1 (rE1)": {"value": 0, "unit": ""},
            "Przekaźnik alarmowy (zbiorczy)": {"value": 0, "unit": ""},
        }
