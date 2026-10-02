import math
import random
from typing import Dict, List, Optional

from app.drivers.base import AbstractControllerDriver, RegisterMapEntry, ControllerModel, AlarmDescription, ChartThreshold
from app.drivers.registry import register_driver


def pnu(number: int) -> int:
    """Danfoss lists every variable by PNU, "equivalent to the modbus
    register no. (modbus address + 1)" (EKD 316C parameter identification,
    AN220086430005en) - the wire address is one less."""
    return number - 1


def _temp(number: int, name: str, **kw) -> RegisterMapEntry:
    # Danfoss "Float" with Scale 0.1 is a signed 16-bit integer in tenths.
    return RegisterMapEntry(address=pnu(number), name=name, unit="°C", data_type="int16", scale_factor=0.1, **kw)


def _flag(number: int, name: str, category: str) -> RegisterMapEntry:
    # Danfoss "Boolean" is a whole holding register holding 0/1; read as
    # bit 0 so it is handled as an on/off flag (badge, alarm event).
    return RegisterMapEntry(address=pnu(number), name=name, data_type="uint16", bit=0, category=category)


_STATE_HELP = (
    "Kod stanu S0-S50 wg instrukcji AK-CC55: 0 normalna regulacja, 1 postój po odszranianiu, "
    "10 wyłącznik główny OFF, 11 termostat wyłączony, 14 odszranianie, 17 drzwi otwarte, 25 ręczne"
)


def _readouts(extra: List[RegisterMapEntry]) -> List[RegisterMapEntry]:
    return [
        _temp(2532, "Temperatura termostatu (u17)"),
        _temp(2530, "Temperatura S3 - powietrze na wlocie (u12)"),
        _temp(2531, "Temperatura S4 - powietrze na wylocie (u16)"),
        _temp(2544, "Temperatura parowania Te (u26)"),
        _temp(2537, "Temperatura S2 - wylot parownika (u20)"),
        _temp(1011, "Temperatura S5 - parownik (u09)"),
        _temp(2702, "Temperatura produktu (U72)"),
        _temp(2578, "Temperatura alarmowa (u57)"),
        RegisterMapEntry(address=pnu(2536), name="Przegrzanie (u21)", unit="K", data_type="int16", scale_factor=0.1),
        *extra,
        RegisterMapEntry(address=pnu(2535), name="Przegrzanie zadane (u22)", unit="K", data_type="int16", scale_factor=0.1, category="parameter"),
        _temp(2612, "Temperatura załączenia (u90)", category="parameter"),
        _temp(2513, "Temperatura wyłączenia (u91)", category="parameter"),
        _temp(2703, "Temperatura końca odszraniania (U73)", category="parameter"),
        RegisterMapEntry(address=pnu(2007), name="Stan regulacji (u00)", data_type="uint16", category="parameter", description=_STATE_HELP),
        _flag(2533, "Tryb nocny (u13)", "status"),
        _flag(2541, "Alarm zbiorczy", "alarm"),
    ]


_SETTINGS = [
    _temp(100, "Nastawa - temperatura wyłączenia (r00)", writable=True),
    RegisterMapEntry(address=pnu(101), name="Różnica załączania (r01)", unit="K", data_type="int16", scale_factor=0.1, writable=True),
    _temp(10019, "Górny limit alarmu (A13)", writable=True),
    _temp(10020, "Dolny limit alarmu (A14)", writable=True),
    _temp(1001, "Temperatura końca odszraniania (d02)", category="parameter"),
    RegisterMapEntry(address=pnu(10002), name="Opóźnienie alarmu temperatury (A03)", unit="min", data_type="uint16", category="parameter"),
    RegisterMapEntry(address=pnu(117), name="Wyłącznik główny (r12)", data_type="int16", category="parameter",
                     description="-1 = sterowanie ręczne (serwis), 0 = stop, 1 = regulacja"),
]


class _DanfossAkCc55Base(AbstractControllerDriver):
    """Danfoss AK-CC55 case/room controller with electronic expansion valve
    (AKV pulse valve or stepper EEV). Built from Danfoss's own "Programming
    Guide - Basic Modbus parameter list" for each variant; only the
    variables listed there are used. Two variants exist because their alarm
    PNUs differ from 20007 on (the Single Coil has S6 and a second
    thermostat band in between), so reading one variant's alarms with the
    other's map would mislabel them.

    Bus: Modbus RTU, default 8E1 with automatic baud-rate detection; address
    and format are set with the AK-UI55 display or the AK-CC55 Connect app.
    On a bus shared with Carel MPXPRO (fixed 8N2) switch the AK-CC55 to 8N2.

    Readouts marked "not present in all App modes" in the guide (S5, AKV/EEV
    opening, superheat...) are kept: a register the controller refuses is
    skipped automatically by the RS485 driver and re-tried later."""

    alarm_pnus: List[tuple] = []
    extra_readouts: List[RegisterMapEntry] = []
    model = ""

    def default_register_map(self) -> List[RegisterMapEntry]:
        alarms = [_flag(number, name, "alarm") for number, name in self.alarm_pnus]
        return _readouts(self.extra_readouts) + _SETTINGS + alarms

    threshold_registers = {
        "cutout": ("holding", pnu(100)),
        "high": ("holding", pnu(10019)),
        "low": ("holding", pnu(10020)),
    }

    def chart_thresholds(self, values: Dict[str, float]) -> List[ChartThreshold]:
        lines: List[ChartThreshold] = []
        if values.get("cutout") is not None:
            lines.append(ChartThreshold("cutout", "Nastawa r00", values["cutout"], "setpoint", "°C"))
        if values.get("low") is not None:
            lines.append(ChartThreshold("low", "Alarm niskiej temp. (A14)", values["low"], "alarm_low", "°C"))
        if values.get("high") is not None:
            lines.append(ChartThreshold("high", "Alarm wysokiej temp. (A13)", values["high"], "alarm_high", "°C"))
        return lines

    def identify(self, model_hint: Optional[str] = None) -> ControllerModel:
        return ControllerModel(
            model=model_hint or self.model,
            description=(
                f"Sterownik regału/komory Danfoss {self.model} z zaworem elektronicznym. "
                "Fabrycznie 8E1 z autodetekcją prędkości - na wspólnej magistrali z Carel MPXPRO ustaw 8N2."
            ),
        )

    def known_alarm_codes(self) -> List[AlarmDescription]:
        # Every alarm is its own 0/1 register (alarm-category flags above).
        return []

    def decode_alarm(self, code: int) -> AlarmDescription:
        return AlarmDescription(code=code, name=f"ALM{code}", description="Alarm sterownika AK-CC55", severity="warning")

    def simulate_reading(self, tick: float) -> Dict[str, dict]:
        air = round(3 + 1.0 * math.sin(tick * 0.05) + random.uniform(-0.2, 0.2), 1)
        te = round(air - 8 + random.uniform(-0.5, 0.5), 1)
        superheat = round(6 + 1.5 * math.sin(tick * 0.11) + random.uniform(-0.3, 0.3), 1)
        values = {reg.name: {"value": 0, "unit": reg.unit or ""} for reg in self.default_register_map()}
        values.update({
            "Temperatura termostatu (u17)": {"value": air, "unit": "°C"},
            "Temperatura S3 - powietrze na wlocie (u12)": {"value": round(air + 1.2, 1), "unit": "°C"},
            "Temperatura S4 - powietrze na wylocie (u16)": {"value": round(air - 1.5, 1), "unit": "°C"},
            "Temperatura parowania Te (u26)": {"value": te, "unit": "°C"},
            "Temperatura S2 - wylot parownika (u20)": {"value": round(te + superheat, 1), "unit": "°C"},
            "Temperatura S5 - parownik (u09)": {"value": round(te + 1, 1), "unit": "°C"},
            "Temperatura produktu (U72)": {"value": round(air + 0.5, 1), "unit": "°C"},
            "Temperatura alarmowa (u57)": {"value": air, "unit": "°C"},
            "Przegrzanie (u21)": {"value": superheat, "unit": "K"},
            "Przegrzanie zadane (u22)": {"value": 6.0, "unit": "K"},
            "Temperatura załączenia (u90)": {"value": 4.0, "unit": "°C"},
            "Temperatura wyłączenia (u91)": {"value": 2.0, "unit": "°C"},
            "Temperatura końca odszraniania (U73)": {"value": 6.0, "unit": "°C"},
            "Nastawa - temperatura wyłączenia (r00)": {"value": 2.0, "unit": "°C"},
            "Różnica załączania (r01)": {"value": 2.0, "unit": "K"},
            "Górny limit alarmu (A13)": {"value": 8.0, "unit": "°C"},
            "Dolny limit alarmu (A14)": {"value": -30.0, "unit": "°C"},
            "Temperatura końca odszraniania (d02)": {"value": 6.0, "unit": "°C"},
            "Opóźnienie alarmu temperatury (A03)": {"value": 30, "unit": "min"},
            "Wyłącznik główny (r12)": {"value": 1, "unit": ""},
        })
        for reg in self.extra_readouts:
            values[reg.name] = {"value": round(35 + 20 * math.sin(tick * 0.07)) if reg.unit == "%" else round(air + 0.4, 1), "unit": reg.unit or ""}
        return values


@register_driver("Danfoss AK-CC55 Compact")
class DanfossAkCc55CompactDriver(_DanfossAkCc55Base):
    """AK-CC55 Compact (084B4081). Source: Danfoss Programming Guide "Basic
    Modbus parameter list AK-CC55 Compact", SW 1.9x, AU356930362198en-000101."""

    manufacturer = "Danfoss AK-CC55 Compact"
    model = "AK-CC55 Compact"
    extra_readouts = [
        RegisterMapEntry(address=pnu(2528), name="Otwarcie zaworu AKV (u23)", unit="%", data_type="uint16"),
        RegisterMapEntry(address=pnu(2633), name="Wysterowanie PWM (U02)", unit="%", data_type="uint16"),
    ]
    alarm_pnus = [
        (20000, "Błąd sterownika"),
        (20001, "Błąd zegara RTC"),
        (20002, "Błąd czujnika ciśnienia Pe"),
        (20003, "Błąd czujnika S2"),
        (20004, "Błąd czujnika S3"),
        (20005, "Błąd czujnika S4"),
        (20006, "Błąd czujnika S5"),
        (20007, "Alarm wysokiej temperatury"),
        (20008, "Alarm niskiej temperatury"),
        (20009, "Alarm drzwi"),
        (20010, "Przekroczony maks. czas wstrzymania"),
        (20011, "Nie wybrano czynnika"),
        (20012, "Alarm wejścia DI1"),
        (20013, "Alarm wejścia DI2"),
        (20014, "Tryb czuwania (standby)"),
        (20015, "Mycie regału"),
        (20016, "Alarm CO2"),
        (20017, "Wyciek czynnika"),
        (20018, "Błędna konfiguracja we/wy"),
        (20019, "Przekroczony maks. czas odszraniania"),
    ]


@register_driver("Danfoss AK-CC55 Single Coil")
class DanfossAkCc55SingleCoilDriver(_DanfossAkCc55Base):
    """AK-CC55 Single Coil (084B4082, 084B4083). Source: Danfoss Programming
    Guide "Basic Modbus parameter list AK-CC55 Single Coil", SW 1.7x,
    AU356841594174en-000301."""

    manufacturer = "Danfoss AK-CC55 Single Coil"
    model = "AK-CC55 Single Coil"
    extra_readouts = [
        RegisterMapEntry(address=pnu(2528), name="Otwarcie zaworu EEV (u23)", unit="%", data_type="uint16"),
        _temp(2555, "Temperatura S6 - produkt (u36)"),
    ]
    alarm_pnus = [
        (20000, "Błąd sterownika"),
        (20001, "Błąd zegara RTC"),
        (20002, "Błąd czujnika ciśnienia Pe"),
        (20003, "Błąd czujnika S2"),
        (20004, "Błąd czujnika S3"),
        (20005, "Błąd czujnika S4"),
        (20006, "Błąd czujnika S5"),
        (20007, "Błąd czujnika S6"),
        (20008, "Błąd czujnika S3 B"),
        (20009, "Błąd czujnika S5 B"),
        (20010, "Błąd wejścia wilgotności"),
        (20011, "Alarm wysokiej temperatury"),
        (20012, "Alarm niskiej temperatury"),
        (20013, "Alarm drzwi"),
        (20014, "Przekroczony maks. czas wstrzymania"),
        (20015, "Nie wybrano czynnika"),
        (20016, "Wysoka temperatura S6"),
        (20017, "Niska temperatura S6"),
        (20018, "Alarm wejścia DI1"),
        (20019, "Alarm wejścia DI2"),
        (20020, "Tryb czuwania (standby)"),
        (20021, "Mycie regału"),
        (20022, "Alarm wysokiej temperatury B"),
        (20023, "Alarm niskiej temperatury B"),
        (20024, "Alarm CO2"),
        (20025, "Wyciek czynnika"),
        (20026, "Wysoka wilgotność"),
        (20027, "Niska wilgotność"),
        (20028, "Błędna konfiguracja we/wy"),
        (20029, "Oblodzony parownik"),
        (20030, "Flash gas"),
        (20031, "Przekroczony maks. czas odszraniania"),
        (20032, "Zabezpieczenie wentylatora"),
        (20033, "Alarm sterownika zaworu"),
    ]
