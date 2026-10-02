import math
import random
from typing import Dict, List, Optional

from app.drivers.base import AbstractControllerDriver, RegisterMapEntry, ControllerModel, AlarmDescription
from app.drivers.registry import register_driver


def _analog(address: int, name: str, unit: str, **kw) -> RegisterMapEntry:
    # Carel analogue variables travel as signed tenths, as on the MPXPRO.
    return RegisterMapEntry(address=address, name=name, unit=unit, data_type="int16", scale_factor=0.1, **kw)


def _digital(address: int, name: str, category: str) -> RegisterMapEntry:
    return RegisterMapEntry(address=address, name=name, data_type="uint16", register_type="coil", category=category)


@register_driver("Carel EVD evolution")
class CarelEvdEvolutionDriver(AbstractControllerDriver):
    """Carel EVD evolution - driver of an electronic expansion valve
    (superheat control), RS485/Modbus models (EVD0000E20/E50...).

    Source: Carel user manual +0300005EN rel. 3.4, chapter 8.2 "Variables
    accessible via serial connection" (Tab. 8.b), whose "Modbus" column is
    used as the wire address: analogue variables in holding registers
    (Modbus address = SVP - 1), integer variables at 127 + SVP (e.g. valve
    position SVP 4 -> 131), digital variables as coils (SVP - 1). Same
    layout as the other Carel controllers. Which analogue values carry
    data depends on the main/auxiliary control setting (Tab. 8.c); the
    unused ones read 0.

    Bus: fixed 8N2 (manual 6.2: byte size, stop bits, parity cannot be
    set), 19200 bit/s by default - fits a bus shared with Carel MPXPRO."""

    manufacturer = "Carel EVD evolution"

    def default_register_map(self) -> List[RegisterMapEntry]:
        return [
            _analog(9, "Przegrzanie", "K"),
            _analog(16, "Otwarcie zaworu", "%"),
            _analog(5, "Temperatura parowania", "°C"),
            _analog(6, "Ciśnienie parowania", "bar"),
            _analog(4, "Temperatura ssania", "°C"),
            _analog(11, "Temperatura skraplania", "°C"),
            _analog(10, "Ciśnienie skraplania", "bar"),
            _analog(0, "Sonda S1", "bar", category="parameter"),
            _analog(1, "Sonda S2", "°C", category="parameter"),
            _analog(2, "Sonda S3", "bar", category="parameter"),
            _analog(3, "Sonda S4", "°C", category="parameter"),
            _analog(20, "Nastawa regulacji", "K", category="parameter",
                    description="Wartość zadana bieżącego trybu regulacji (dla przegrzania w K)"),
            _analog(24, "Wersja oprogramowania", "", category="parameter"),
            RegisterMapEntry(address=131, name="Pozycja zaworu", unit="krok", data_type="uint16", category="parameter"),
            RegisterMapEntry(address=134, name="Wydajność chłodnicza", unit="%", data_type="uint16", category="parameter"),
            _digital(8, "Przekaźnik", "status"),
            _digital(13, "Wejście cyfrowe DI1", "status"),
            _digital(14, "Wejście cyfrowe DI2", "status"),
            _digital(49, "Ochrona LOP aktywna", "status"),
            _digital(50, "Ochrona MOP aktywna", "status"),
            _digital(51, "Ochrona LowSH aktywna", "status"),
            _digital(52, "Ochrona HiTcond aktywna", "status"),
            _digital(0, "Niska temperatura ssania", "alarm"),
            _digital(1, "Błąd sieci LAN", "alarm"),
            _digital(2, "Uszkodzona pamięć EEPROM", "alarm"),
            _digital(3, "Błąd sondy S1", "alarm"),
            _digital(4, "Błąd sondy S2", "alarm"),
            _digital(5, "Błąd sondy S3", "alarm"),
            _digital(6, "Błąd sondy S4", "alarm"),
            _digital(7, "Błąd silnika zaworu", "alarm"),
            _digital(9, "Alarm LOP (niska temp. parowania)", "alarm"),
            _digital(10, "Alarm MOP (wysoka temp. parowania)", "alarm"),
            _digital(11, "Alarm LowSH (niskie przegrzanie)", "alarm"),
            _digital(12, "Alarm wysokiej temp. skraplania", "alarm"),
            _digital(39, "Nieskuteczna regulacja adaptacyjna", "alarm"),
            _digital(44, "Zanik zasilania", "alarm"),
        ]

    def identify(self, model_hint: Optional[str] = None) -> ControllerModel:
        return ControllerModel(
            model=model_hint or "EVD evolution",
            description="Sterownik zaworu rozprężnego Carel EVD evolution (przegrzanie, otwarcie zaworu, ochrony LOP/MOP/LowSH)",
        )

    def known_alarm_codes(self) -> List[AlarmDescription]:
        # Alarms are individual coils (alarm-category flags above).
        return []

    def decode_alarm(self, code: int) -> AlarmDescription:
        return AlarmDescription(code=code, name=f"ALM{code}", description="Alarm sterownika EVD evolution", severity="warning")

    def simulate_reading(self, tick: float) -> Dict[str, dict]:
        values = {reg.name: {"value": 0, "unit": reg.unit or ""} for reg in self.default_register_map()}
        superheat = round(7 + 2 * math.sin(tick * 0.09) + random.uniform(-0.4, 0.4), 1)
        te = round(-8 + 1.5 * math.sin(tick * 0.03) + random.uniform(-0.2, 0.2), 1)
        tc = round(38 + 3 * math.sin(tick * 0.02) + random.uniform(-0.3, 0.3), 1)
        opening = round(max(5.0, min(100.0, 45 + 15 * math.sin(tick * 0.09 + 1) + random.uniform(-2, 2))), 1)
        values.update({
            "Przegrzanie": {"value": superheat, "unit": "K"},
            "Otwarcie zaworu": {"value": opening, "unit": "%"},
            "Temperatura parowania": {"value": te, "unit": "°C"},
            "Ciśnienie parowania": {"value": round(2.4 + 0.12 * (te + 8), 1), "unit": "bar"},
            "Temperatura ssania": {"value": round(te + superheat, 1), "unit": "°C"},
            "Temperatura skraplania": {"value": tc, "unit": "°C"},
            "Ciśnienie skraplania": {"value": round(15.5 + 0.35 * (tc - 38), 1), "unit": "bar"},
            "Sonda S1": {"value": round(2.4 + 0.12 * (te + 8), 1), "unit": "bar"},
            "Sonda S2": {"value": round(te + superheat, 1), "unit": "°C"},
            "Nastawa regulacji": {"value": 7.0, "unit": "K"},
            "Wersja oprogramowania": {"value": 5.6, "unit": ""},
            "Pozycja zaworu": {"value": round(opening * 4.8), "unit": "krok"},
            "Wydajność chłodnicza": {"value": 100, "unit": "%"},
            "Przekaźnik": {"value": 1, "unit": ""},
        })
        return values
