import math
import random
from typing import Dict, List, Optional

from app.drivers.base import AbstractControllerDriver, RegisterMapEntry, ControllerModel, AlarmDescription, ChartThreshold
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
    hardware, so they're left out rather than shown as fake sensors.

    Sensor fault coils: only S1-S3's (12/13/14) were confirmed by an
    actual connect/disconnect transition (1 -> 0). S6/S7's guessed fault
    coils (17/18) were tested the same way on 2026-07-09 and failed -
    they stayed 0 after S6/S7 were physically disconnected - so they were
    removed rather than left showing a false "OK". S4/S5's fault coils
    (15/16) were only ever observed at 0 while connected, never through a
    real disconnect - unconfirmed, kept for now but don't fully trust
    them. The sensor VALUE registers themselves (holding, not the fault
    coils) reliably show the physically-impossible "-204.8°C" pattern
    when a probe isn't wired, regardless of whether the fault coil works,
    so that's the more dependable disconnect signal.

    2026-07-09 second batch: dt1/A0/AL/AH/F1/Frd/F5/P3/P7 and coil A1 were
    confirmed by reading 15 values directly off the controller's own
    keypad and matching every single one exactly on a live re-scan (e.g.
    F5 independently reproduced the 50.0 already seen at that address in
    an earlier blind scan). "Sd1" was reported as 25.8°C and matched
    closely (25.6°C) at the "Sd" address - close enough (live drift) to
    accept now that a probe is evidently wired there (it read the
    "not installed" -812.8 pattern before). Deliberately NOT added despite
    being asked for: "dP1" (176), "AA" (187) and "Ad" (188) - none matched
    the reported value at their cfvarmdl-derived address, so the address
    is wrong and needs a real disconnect/keypad-change test like the
    others got, not a guess. "SH" matches the known not-installed pattern
    (-806.4) rather than a real reading. "PPU" has no corresponding
    variable in the supplied Carel model files at all.
    2026-10-02 - the map was completed from a full scan of the same live
    controller (holding 0-99 answer as analogue variables x0.1, 128-333 as
    integer variables, coils 0-151) matched against the MPXPRO manual
    (+0300055EN rel. 1.5, "Table of parameters"):
    - analogue block: from St (39) on, the decimal parameters sit in exactly
      the manual's table order and every value equals its factory default
      or a plausible site setting (St2=50, rd2=0, r1=-50, r2=50 ... P4=15,
      P6=5, P8=15, P11=-45, P13=10, P15=-15, OSH=0, PM1=50, PM2=10,
      PL1=-50, PL2=0, /cE=0; HSS=1.1 = "set 1, modified").
    - integer block: Carel integer variable N = address 127+N, anchored by
      the manual's "integer variable 11 = firmware" (138) and by H0 = 198 at
      217, which is this controller's own network address. The runs
      /t1,/t2=12,12 - /P1../P5 - /FA,/Fb,/Fc=1,2,3, cc=1,c6=60, dI,dP1,dP2 =
      8,45,45 and H1,H2,H3=8,1,0 all match the defaults in table order;
      /P3=/P4=4 (0-5 V ratiometric) and /FE=6 match the pressure probes
      wired to S6/S7 on site.
    - correction: the registers formerly listed as c1/c2/c3 at 168-170 are
      c0/c1/c2 - c1 is 169 (cc and c6 pin the block's position).
    Left out on purpose: the read-only status block 1-38/75-89 and the
    coils other than the ones confirmed below - they need a state change
    on the controller (defrost, door, output) to be named reliably.
    """

    manufacturer = "Carel MPX"
    bus_requirements = {
        "baudrates": [19200], "parities": ["N"], "stopbits": [2],
        "factory": "19200 8N2",
        "note": "MPXPRO komunikuje się z ramką 19200 8N2 (sprawdzone na sterowniku). Adres ustawia parametr H0.",
    }
    # Reads of more than 16 registers are refused with exception 3 (probed
    # on the live controller 2026-10-02).
    max_read_words = 16

    # Read-only on purpose although they sit among the parameters: the
    # firmware version is a readout, and H0 is the controller's own bus
    # address - changing it from the panel would cut the panel off.
    READ_ONLY_PARAMETERS = {138, 217}

    def default_register_map(self) -> List[RegisterMapEntry]:
        """Every parameter and setpoint of the manual's table is settable
        (from the keypad and over Modbus), so all of them are writable here;
        the controller itself rejects values outside its range (e.g. St below
        r1) and the panel reads the value back after each write."""
        registers = self._register_map()
        for reg in registers:
            if reg.address in self.READ_ONLY_PARAMETERS and reg.register_type == "holding":
                reg.writable = False
            elif reg.register_type == "holding" and reg.category in ("parameter", "setpoint"):
                reg.writable = True
            elif reg.register_type == "coil" and reg.address == 93:  # A1, on/off parameter
                reg.writable = True
        return registers

    def _register_map(self) -> List[RegisterMapEntry]:
        return [
            # --- measurements (analogue, x0.1) - confirmed live 2026-07-09 ---
            RegisterMapEntry(address=7, name="Sonda 1", unit="°C", data_type="int16", scale_factor=0.1, register_type="holding"),
            RegisterMapEntry(address=8, name="Sonda 2", unit="°C", data_type="int16", scale_factor=0.1, register_type="holding"),
            RegisterMapEntry(address=9, name="Sonda 3", unit="°C", data_type="int16", scale_factor=0.1, register_type="holding"),
            RegisterMapEntry(address=10, name="Sonda 4", unit="°C", data_type="int16", scale_factor=0.1, register_type="holding"),
            RegisterMapEntry(address=11, name="Sonda 5", unit="°C", data_type="int16", scale_factor=0.1, register_type="holding"),
            RegisterMapEntry(address=12, name="Sonda 6", unit="°C", data_type="int16", scale_factor=0.1, register_type="holding"),
            RegisterMapEntry(address=13, name="Sonda 7", unit="°C", data_type="int16", scale_factor=0.1, register_type="holding"),
            RegisterMapEntry(address=0, name="Sd1", unit="°C", data_type="int16", scale_factor=0.1, register_type="holding"),
            # --- setpoints and analogue parameters (x0.1), in the order of
            # the manual's table of parameters; see the class docstring ---
            RegisterMapEntry(address=39, name="Nastawa (St)", unit="°C", data_type="int16", scale_factor=0.1, writable=True, register_type="holding"),
            RegisterMapEntry(address=40, name="Nastawa 2 – podwójny termostat (St2)", unit="°C", data_type="int16", scale_factor=0.1, writable=True, register_type="holding", category="setpoint"),
            RegisterMapEntry(address=41, name="Różnica załączania (rd)", unit="°C", data_type="int16", scale_factor=0.1, writable=True, register_type="holding"),
            RegisterMapEntry(address=42, name="Różnica załączania St2 (rd2)", unit="°C", data_type="int16", scale_factor=0.1, writable=True, register_type="holding", category="setpoint"),
            RegisterMapEntry(address=43, name="Minimalna nastawa (r1)", unit="°C", data_type="int16", scale_factor=0.1, register_type="holding", category="parameter"),
            RegisterMapEntry(address=44, name="Maksymalna nastawa (r2)", unit="°C", data_type="int16", scale_factor=0.1, register_type="holding", category="parameter"),
            RegisterMapEntry(address=45, name="Nocna zmiana nastawy (r4)", unit="°C", data_type="int16", scale_factor=0.1, writable=True, register_type="holding", category="setpoint"),
            RegisterMapEntry(address=46, name="Przesunięcie regulacji przy błędzie sondy (ro)", unit="°C", data_type="int16", scale_factor=0.1, register_type="holding", category="parameter"),
            RegisterMapEntry(address=49, name="Próg końca odszraniania (dt1)", unit="°C", data_type="int16", scale_factor=0.1, writable=True, register_type="holding"),
            RegisterMapEntry(address=50, name="Próg końca odszraniania 2 (dt2)", unit="°C", data_type="int16", scale_factor=0.1, writable=True, register_type="holding", category="setpoint"),
            RegisterMapEntry(address=51, name="Próg odszraniania w trybie czasu pracy (d11)", unit="°C", data_type="int16", scale_factor=0.1, register_type="holding", category="parameter"),
            RegisterMapEntry(address=52, name="Dodatkowa delta końca odszraniania – Power defrost (ddt)", unit="°C", data_type="int16", scale_factor=0.1, register_type="holding", category="parameter"),
            RegisterMapEntry(address=53, name="Dyferencjał resetu alarmu temp. (A0)", unit="°C", data_type="int16", scale_factor=0.1, writable=True, register_type="holding"),
            RegisterMapEntry(address=54, name="Próg alarmu niskiej temp. (AL)", unit="°C", data_type="int16", scale_factor=0.1, writable=True, register_type="holding"),
            RegisterMapEntry(address=55, name="Próg alarmu wysokiej temp. (AH)", unit="°C", data_type="int16", scale_factor=0.1, writable=True, register_type="holding"),
            RegisterMapEntry(address=56, name="Próg alarmu niskiej temp. 2 (AL2)", unit="°C", data_type="int16", scale_factor=0.1, writable=True, register_type="holding", category="setpoint"),
            RegisterMapEntry(address=57, name="Próg alarmu wysokiej temp. 2 (AH2)", unit="°C", data_type="int16", scale_factor=0.1, writable=True, register_type="holding", category="setpoint"),
            RegisterMapEntry(address=58, name="Próg załączenia wentylatora (F1)", unit="°C", data_type="int16", scale_factor=0.1, writable=True, register_type="holding"),
            RegisterMapEntry(address=59, name="Dyferencjał wentylatora (Frd)", unit="°C", data_type="int16", scale_factor=0.1, writable=True, register_type="holding"),
            RegisterMapEntry(address=60, name="Próg wyłączenia wentylatora (F5)", unit="°C", data_type="int16", scale_factor=0.1, writable=True, register_type="holding"),
            RegisterMapEntry(address=61, name="Nastawa przegrzania (P3)", unit="K", data_type="int16", scale_factor=0.1, writable=True, register_type="holding"),
            RegisterMapEntry(address=62, name="Zawór – wzmocnienie proporcjonalne (P4)", data_type="int16", scale_factor=0.1, register_type="holding", category="parameter"),
            RegisterMapEntry(address=63, name="Zawór – czas różniczkowania (P6)", unit="s", data_type="int16", scale_factor=0.1, register_type="holding", category="parameter"),
            RegisterMapEntry(address=64, name="Próg niskiego przegrzania (P7)", unit="K", data_type="int16", scale_factor=0.1, writable=True, register_type="holding"),
            RegisterMapEntry(address=65, name="LowSH – czas całkowania (P8)", unit="s", data_type="int16", scale_factor=0.1, register_type="holding", category="parameter"),
            RegisterMapEntry(address=66, name="LSA – próg niskiej temp. ssania (P11)", unit="°C", data_type="int16", scale_factor=0.1, register_type="holding", category="parameter"),
            RegisterMapEntry(address=67, name="LSA – różnica alarmu (P13)", unit="°C", data_type="int16", scale_factor=0.1, register_type="holding", category="parameter"),
            RegisterMapEntry(address=68, name="Temp. nasycenia zastępcza przy błędzie sondy ciśn. (P15)", unit="°C", data_type="int16", scale_factor=0.1, register_type="holding", category="parameter"),
            RegisterMapEntry(address=69, name="Offset przegrzania – termostat modulacyjny (OSH)", unit="K", data_type="int16", scale_factor=0.1, register_type="holding", category="parameter"),
            RegisterMapEntry(address=70, name="MOP – maks. temp. parowania (PM1)", unit="°C", data_type="int16", scale_factor=0.1, register_type="holding", category="parameter"),
            RegisterMapEntry(address=71, name="MOP – czas całkowania (PM2)", unit="s", data_type="int16", scale_factor=0.1, register_type="holding", category="parameter"),
            RegisterMapEntry(address=72, name="LOP – min. temp. parowania (PL1)", unit="°C", data_type="int16", scale_factor=0.1, register_type="holding", category="parameter"),
            RegisterMapEntry(address=73, name="LOP – czas całkowania (PL2)", unit="s", data_type="int16", scale_factor=0.1, register_type="holding", category="parameter"),
            RegisterMapEntry(address=74, name="Kalibracja temp. nasycenia parowania (/cE)", unit="°C", data_type="int16", scale_factor=0.1, register_type="holding", category="parameter"),
            RegisterMapEntry(address=90, name="Smooth Lines – offset zatrzymania poniżej nastawy (PLt)", unit="°C", data_type="int16", scale_factor=0.1, register_type="holding", category="parameter"),
            RegisterMapEntry(address=91, name="Smooth Lines – maks. offset przegrzania (PHS)", unit="K", data_type="int16", scale_factor=0.1, register_type="holding", category="parameter"),
            RegisterMapEntry(address=97, name="Aktywny zestaw parametrów (HSS)", data_type="int16", scale_factor=0.1, register_type="holding", category="parameter"),
            # --- integer parameters (x1): Carel integer variable N = address
            # 127 + N (variable 11 = firmware is documented in the manual) ---
            RegisterMapEntry(address=138, name="Wersja oprogramowania", data_type="uint16", register_type="holding", category="parameter", description="Zmienna całkowita 11 wg instrukcji MPXPRO"),
            RegisterMapEntry(address=149, name="Stabilność pomiaru sond (/2)", data_type="uint16", register_type="holding", category="parameter"),
            RegisterMapEntry(address=150, name="Udział sondy wlotowej w sondzie wirtualnej (/4)", unit="%", data_type="uint16", register_type="holding", category="parameter"),
            RegisterMapEntry(address=151, name="Wyświetlanie na terminalu (/t1)", data_type="uint16", register_type="holding", category="parameter"),
            RegisterMapEntry(address=152, name="Wyświetlanie na wyświetlaczu zdalnym (/t2)", data_type="uint16", register_type="holding", category="parameter"),
            RegisterMapEntry(address=153, name="Typ sond S1–S3 (/P1)", data_type="uint16", register_type="holding", category="parameter"),
            RegisterMapEntry(address=154, name="Typ sond S4–S5 (/P2)", data_type="uint16", register_type="holding", category="parameter"),
            RegisterMapEntry(address=155, name="Typ sondy S6 (/P3)", data_type="uint16", register_type="holding", category="parameter"),
            RegisterMapEntry(address=156, name="Typ sondy S7 (/P4)", data_type="uint16", register_type="holding", category="parameter"),
            RegisterMapEntry(address=157, name="Typ sond szeregowych S8–S11 (/P5)", data_type="uint16", register_type="holding", category="parameter"),
            RegisterMapEntry(address=158, name="Sonda wylotu powietrza Sm (/FA)", data_type="uint16", register_type="holding", category="parameter"),
            RegisterMapEntry(address=159, name="Sonda odszraniania Sd (/Fb)", data_type="uint16", register_type="holding", category="parameter"),
            RegisterMapEntry(address=160, name="Sonda wlotu powietrza Sr (/Fc)", data_type="uint16", register_type="holding", category="parameter"),
            RegisterMapEntry(address=161, name="Sonda temp. gazu przegrzanego tGS (/Fd)", data_type="uint16", register_type="holding", category="parameter"),
            RegisterMapEntry(address=162, name="Sonda ciśnienia/temp. parowania PEu (/FE)", data_type="uint16", register_type="holding", category="parameter"),
            RegisterMapEntry(address=168, name="Opóźnienie sprężarki i wentylatorów po zasileniu (c0)", unit="min", data_type="uint16", register_type="holding", category="parameter"),
            RegisterMapEntry(address=169, name="Min. czas między załączeniami (c1)", unit="min", data_type="uint16", register_type="holding", category="parameter"),
            RegisterMapEntry(address=170, name="Min. czas postoju (c2)", unit="min", data_type="uint16", register_type="holding", category="parameter"),
            RegisterMapEntry(address=171, name="Min. czas pracy (c3)", unit="min", data_type="uint16", register_type="holding", category="parameter"),
            RegisterMapEntry(address=172, name="Czas pracy w trybie awaryjnym (c4)", unit="min", data_type="uint16", register_type="holding", category="parameter"),
            RegisterMapEntry(address=173, name="Czas cyklu ciągłego (cc)", unit="h", data_type="uint16", register_type="holding", category="parameter"),
            RegisterMapEntry(address=174, name="Blokada alarmu niskiej temp. po cyklu ciągłym (c6)", unit="min", data_type="uint16", register_type="holding", category="parameter"),
            RegisterMapEntry(address=175, name="Typ odszraniania (d0)", data_type="uint16", register_type="holding", category="parameter"),
            RegisterMapEntry(address=176, name="Maks. odstęp między odszranianiami (dI)", unit="h", data_type="uint16", register_type="holding", category="parameter"),
            RegisterMapEntry(address=177, name="Maks. czas odszraniania (dP1)", unit="min", data_type="uint16", register_type="holding", category="parameter"),
            RegisterMapEntry(address=178, name="Maks. czas odszraniania parownika 2 (dP2)", unit="min", data_type="uint16", register_type="holding", category="parameter"),
            RegisterMapEntry(address=179, name="Opóźnienie odszraniania po zasileniu (d5)", unit="min", data_type="uint16", register_type="holding", category="parameter"),
            RegisterMapEntry(address=180, name="Wyświetlanie podczas odszraniania (d6)", data_type="uint16", register_type="holding", category="parameter"),
            RegisterMapEntry(address=181, name="Czas ociekania (dd)", unit="min", data_type="uint16", register_type="holding", category="parameter"),
            RegisterMapEntry(address=182, name="Blokada alarmu wysokiej temp. po odszranianiu (d8)", unit="min", data_type="uint16", register_type="holding", category="parameter"),
            RegisterMapEntry(address=204, name="Typ zaworu elektronicznego (P1)", data_type="uint16", register_type="holding", category="parameter"),
            RegisterMapEntry(address=205, name="Zawór – czas całkowania (P5)", unit="s", data_type="uint16", register_type="holding", category="parameter"),
            RegisterMapEntry(address=206, name="LowSH – opóźnienie alarmu (P9)", unit="s", data_type="uint16", register_type="holding", category="parameter"),
            RegisterMapEntry(address=207, name="LSA – opóźnienie alarmu (P12)", unit="s", data_type="uint16", register_type="holding", category="parameter"),
            RegisterMapEntry(address=208, name="Typ czynnika chłodniczego (PH)", data_type="uint16", register_type="holding", category="parameter"),
            RegisterMapEntry(address=209, name="MOP – opóźnienie alarmu (PM3)", unit="s", data_type="uint16", register_type="holding", category="parameter"),
            RegisterMapEntry(address=210, name="MOP – opóźnienie po starcie (PM4)", unit="s", data_type="uint16", register_type="holding", category="parameter"),
            RegisterMapEntry(address=211, name="LOP – opóźnienie alarmu (PL3)", unit="s", data_type="uint16", register_type="holding", category="parameter"),
            RegisterMapEntry(address=212, name="Okres zaworu PWM (Po6)", unit="s", data_type="uint16", register_type="holding", category="parameter"),
            RegisterMapEntry(address=213, name="Początkowe otwarcie zaworu (cP1)", unit="%", data_type="uint16", register_type="holding", category="parameter"),
            RegisterMapEntry(address=214, name="Czas otwarcia początkowego po odszranianiu (Pdd)", unit="min", data_type="uint16", register_type="holding", category="parameter"),
            RegisterMapEntry(address=215, name="Pozycja zaworu w czuwaniu (PSb)", unit="step", data_type="uint16", register_type="holding", category="parameter"),
            RegisterMapEntry(address=217, name="Adres sieciowy (H0)", data_type="uint16", register_type="holding", category="parameter"),
            RegisterMapEntry(address=218, name="Funkcja wyjścia AUX1 (H1)", data_type="uint16", register_type="holding", category="parameter"),
            RegisterMapEntry(address=219, name="Blokada klawiatury/pilota (H2)", data_type="uint16", register_type="holding", category="parameter"),
            RegisterMapEntry(address=220, name="Kod pilota (H3)", data_type="uint16", register_type="holding", category="parameter"),
            RegisterMapEntry(address=221, name="Funkcja wyjścia AUX2 (H5)", data_type="uint16", register_type="holding", category="parameter"),
            RegisterMapEntry(address=222, name="Blokada klawiatury terminala (H6)", data_type="uint16", register_type="holding", category="parameter"),
            RegisterMapEntry(address=223, name="Funkcja wyjścia AUX3 (H7)", data_type="uint16", register_type="holding", category="parameter"),
            # --- flags (coils) - confirmed live 2026-07-09 ---
            RegisterMapEntry(address=93, name="Nastawa Abs/wzgl. (A1)", data_type="uint16", register_type="coil", category="parameter"),
            RegisterMapEntry(address=12, name="Błąd czujnika S1 (rE1)", data_type="uint16", register_type="coil", category="alarm"),
            RegisterMapEntry(address=13, name="Błąd czujnika S2", data_type="uint16", register_type="coil", category="alarm"),
            RegisterMapEntry(address=14, name="Błąd czujnika S3", data_type="uint16", register_type="coil", category="alarm"),
            RegisterMapEntry(address=15, name="Błąd czujnika S4", data_type="uint16", register_type="coil", category="alarm"),
            RegisterMapEntry(address=16, name="Błąd czujnika S5", data_type="uint16", register_type="coil", category="alarm"),
            RegisterMapEntry(address=23, name="Alarm niskiej temperatury (LO)", data_type="uint16", register_type="coil", category="alarm"),
            RegisterMapEntry(address=24, name="Alarm wysokiej temperatury (HI)", data_type="uint16", register_type="coil", category="alarm"),
            RegisterMapEntry(address=114, name="Przekaźnik alarmowy (zbiorczy)", data_type="uint16", is_alarm_register=True, register_type="coil"),
        ]

    threshold_registers = {
        "St": ("holding", 39),
        "AL": ("holding", 54),
        "AH": ("holding", 55),
        "A1": ("coil", 93),
    }

    def chart_thresholds(self, values: Dict[str, float]) -> List[ChartThreshold]:
        """St plus the effective alarm limits. MPXPRO's A1 decides how AL/AH
        are read: 0 (factory default) = offsets from St, 1 = absolute
        temperatures - so with A1=0 and St=2, AL=4, AH=10 the alarms are at
        -2 and 12 degC, not at 4 and 10."""
        lines: List[ChartThreshold] = []
        st = values.get("St")
        if st is not None:
            lines.append(ChartThreshold("St", "Nastawa St", st, "setpoint", "°C"))
        relative = not values.get("A1")
        for key, kind, sign in (("AL", "alarm_low", -1), ("AH", "alarm_high", 1)):
            limit = values.get(key)
            if limit is None:
                continue
            if relative:
                if st is None:
                    continue
                limit = st + sign * limit
            label = "Alarm niskiej temp." if kind == "alarm_low" else "Alarm wysokiej temp."
            lines.append(ChartThreshold(key, label, round(limit, 2), kind, "°C"))
        return lines

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

    # Values read from the real controller on 2026-10-02 - preview mode shows
    # every parameter with a realistic value instead of leaving it empty.
    _DEMO_PARAMETERS = {
        "Sonda 1": {
                "value": 50.2,
                "unit": "°C"
        },
        "Sonda 2": {
                "value": 24.1,
                "unit": "°C"
        },
        "Sonda 3": {
                "value": 26.9,
                "unit": "°C"
        },
        "Sonda 4": {
                "value": 24.0,
                "unit": "°C"
        },
        "Sonda 5": {
                "value": 28.5,
                "unit": "°C"
        },
        "Sonda 6": {
                "value": 9.2,
                "unit": "°C"
        },
        "Sonda 7": {
                "value": 9.3,
                "unit": "°C"
        },
        "Sd1": {
                "value": 24.1,
                "unit": "°C"
        },
        "Nastawa (St)": {
                "value": 43.9,
                "unit": "°C"
        },
        "Nastawa 2 – podwójny termostat (St2)": {
                "value": 50.0,
                "unit": "°C"
        },
        "Różnica załączania (rd)": {
                "value": 2.0,
                "unit": "°C"
        },
        "Różnica załączania St2 (rd2)": {
                "value": 0.0,
                "unit": "°C"
        },
        "Minimalna nastawa (r1)": {
                "value": -50.0,
                "unit": "°C"
        },
        "Maksymalna nastawa (r2)": {
                "value": 50.0,
                "unit": "°C"
        },
        "Nocna zmiana nastawy (r4)": {
                "value": 0.0,
                "unit": "°C"
        },
        "Przesunięcie regulacji przy błędzie sondy (ro)": {
                "value": 0.0,
                "unit": "°C"
        },
        "Próg końca odszraniania (dt1)": {
                "value": 8.0,
                "unit": "°C"
        },
        "Próg końca odszraniania 2 (dt2)": {
                "value": 8.0,
                "unit": "°C"
        },
        "Próg odszraniania w trybie czasu pracy (d11)": {
                "value": -30.0,
                "unit": "°C"
        },
        "Dodatkowa delta końca odszraniania – Power defrost (ddt)": {
                "value": 0.0,
                "unit": "°C"
        },
        "Dyferencjał resetu alarmu temp. (A0)": {
                "value": 2.0,
                "unit": "°C"
        },
        "Próg alarmu niskiej temp. (AL)": {
                "value": 49.9,
                "unit": "°C"
        },
        "Próg alarmu wysokiej temp. (AH)": {
                "value": 20.0,
                "unit": "°C"
        },
        "Próg alarmu niskiej temp. 2 (AL2)": {
                "value": 0.0,
                "unit": "°C"
        },
        "Próg alarmu wysokiej temp. 2 (AH2)": {
                "value": 0.0,
                "unit": "°C"
        },
        "Próg załączenia wentylatora (F1)": {
                "value": 10.0,
                "unit": "°C"
        },
        "Dyferencjał wentylatora (Frd)": {
                "value": 2.0,
                "unit": "°C"
        },
        "Próg wyłączenia wentylatora (F5)": {
                "value": 50.0,
                "unit": "°C"
        },
        "Nastawa przegrzania (P3)": {
                "value": 7.0,
                "unit": "K"
        },
        "Zawór – wzmocnienie proporcjonalne (P4)": {
                "value": 15.0,
                "unit": ""
        },
        "Zawór – czas różniczkowania (P6)": {
                "value": 5.0,
                "unit": "s"
        },
        "Próg niskiego przegrzania (P7)": {
                "value": 4.0,
                "unit": "K"
        },
        "LowSH – czas całkowania (P8)": {
                "value": 15.0,
                "unit": "s"
        },
        "LSA – próg niskiej temp. ssania (P11)": {
                "value": -45.0,
                "unit": "°C"
        },
        "LSA – różnica alarmu (P13)": {
                "value": 10.0,
                "unit": "°C"
        },
        "Temp. nasycenia zastępcza przy błędzie sondy ciśn. (P15)": {
                "value": -15.0,
                "unit": "°C"
        },
        "Offset przegrzania – termostat modulacyjny (OSH)": {
                "value": 0.0,
                "unit": "K"
        },
        "MOP – maks. temp. parowania (PM1)": {
                "value": 50.0,
                "unit": "°C"
        },
        "MOP – czas całkowania (PM2)": {
                "value": 10.0,
                "unit": "s"
        },
        "LOP – min. temp. parowania (PL1)": {
                "value": -50.0,
                "unit": "°C"
        },
        "LOP – czas całkowania (PL2)": {
                "value": 0.0,
                "unit": "s"
        },
        "Kalibracja temp. nasycenia parowania (/cE)": {
                "value": 0.0,
                "unit": "°C"
        },
        "Smooth Lines – offset zatrzymania poniżej nastawy (PLt)": {
                "value": 2.0,
                "unit": "°C"
        },
        "Smooth Lines – maks. offset przegrzania (PHS)": {
                "value": 15.0,
                "unit": "K"
        },
        "Aktywny zestaw parametrów (HSS)": {
                "value": 1.1,
                "unit": ""
        },
        "Wersja oprogramowania": {
                "value": 4202,
                "unit": ""
        },
        "Stabilność pomiaru sond (/2)": {
                "value": 4,
                "unit": ""
        },
        "Udział sondy wlotowej w sondzie wirtualnej (/4)": {
                "value": 0,
                "unit": "%"
        },
        "Wyświetlanie na terminalu (/t1)": {
                "value": 12,
                "unit": ""
        },
        "Wyświetlanie na wyświetlaczu zdalnym (/t2)": {
                "value": 12,
                "unit": ""
        },
        "Typ sond S1–S3 (/P1)": {
                "value": 0,
                "unit": ""
        },
        "Typ sond S4–S5 (/P2)": {
                "value": 0,
                "unit": ""
        },
        "Typ sondy S6 (/P3)": {
                "value": 4,
                "unit": ""
        },
        "Typ sondy S7 (/P4)": {
                "value": 4,
                "unit": ""
        },
        "Typ sond szeregowych S8–S11 (/P5)": {
                "value": 0,
                "unit": ""
        },
        "Sonda wylotu powietrza Sm (/FA)": {
                "value": 1,
                "unit": ""
        },
        "Sonda odszraniania Sd (/Fb)": {
                "value": 2,
                "unit": ""
        },
        "Sonda wlotu powietrza Sr (/Fc)": {
                "value": 3,
                "unit": ""
        },
        "Sonda temp. gazu przegrzanego tGS (/Fd)": {
                "value": 4,
                "unit": ""
        },
        "Sonda ciśnienia/temp. parowania PEu (/FE)": {
                "value": 6,
                "unit": ""
        },
        "Opóźnienie sprężarki i wentylatorów po zasileniu (c0)": {
                "value": 2,
                "unit": "min"
        },
        "Min. czas między załączeniami (c1)": {
                "value": 0,
                "unit": "min"
        },
        "Min. czas postoju (c2)": {
                "value": 0,
                "unit": "min"
        },
        "Min. czas pracy (c3)": {
                "value": 0,
                "unit": "min"
        },
        "Czas pracy w trybie awaryjnym (c4)": {
                "value": 0,
                "unit": "min"
        },
        "Czas cyklu ciągłego (cc)": {
                "value": 1,
                "unit": "h"
        },
        "Blokada alarmu niskiej temp. po cyklu ciągłym (c6)": {
                "value": 60,
                "unit": "min"
        },
        "Typ odszraniania (d0)": {
                "value": 0,
                "unit": ""
        },
        "Maks. odstęp między odszranianiami (dI)": {
                "value": 8,
                "unit": "h"
        },
        "Maks. czas odszraniania (dP1)": {
                "value": 45,
                "unit": "min"
        },
        "Maks. czas odszraniania parownika 2 (dP2)": {
                "value": 45,
                "unit": "min"
        },
        "Opóźnienie odszraniania po zasileniu (d5)": {
                "value": 0,
                "unit": "min"
        },
        "Wyświetlanie podczas odszraniania (d6)": {
                "value": 1,
                "unit": ""
        },
        "Czas ociekania (dd)": {
                "value": 2,
                "unit": "min"
        },
        "Blokada alarmu wysokiej temp. po odszranianiu (d8)": {
                "value": 30,
                "unit": "min"
        },
        "Typ zaworu elektronicznego (P1)": {
                "value": 0,
                "unit": ""
        },
        "Zawór – czas całkowania (P5)": {
                "value": 150,
                "unit": "s"
        },
        "LowSH – opóźnienie alarmu (P9)": {
                "value": 600,
                "unit": "s"
        },
        "LSA – opóźnienie alarmu (P12)": {
                "value": 600,
                "unit": "s"
        },
        "Typ czynnika chłodniczego (PH)": {
                "value": 5,
                "unit": ""
        },
        "MOP – opóźnienie alarmu (PM3)": {
                "value": 0,
                "unit": "s"
        },
        "MOP – opóźnienie po starcie (PM4)": {
                "value": 2,
                "unit": "s"
        },
        "LOP – opóźnienie alarmu (PL3)": {
                "value": 0,
                "unit": "s"
        },
        "Okres zaworu PWM (Po6)": {
                "value": 6,
                "unit": "s"
        },
        "Początkowe otwarcie zaworu (cP1)": {
                "value": 30,
                "unit": "%"
        },
        "Czas otwarcia początkowego po odszranianiu (Pdd)": {
                "value": 10,
                "unit": "min"
        },
        "Pozycja zaworu w czuwaniu (PSb)": {
                "value": 0,
                "unit": "step"
        },
        "Adres sieciowy (H0)": {
                "value": 198,
                "unit": ""
        },
        "Funkcja wyjścia AUX1 (H1)": {
                "value": 8,
                "unit": ""
        },
        "Blokada klawiatury/pilota (H2)": {
                "value": 1,
                "unit": ""
        },
        "Kod pilota (H3)": {
                "value": 0,
                "unit": ""
        },
        "Funkcja wyjścia AUX2 (H5)": {
                "value": 8,
                "unit": ""
        },
        "Blokada klawiatury terminala (H6)": {
                "value": 0,
                "unit": ""
        },
        "Funkcja wyjścia AUX3 (H7)": {
                "value": 5,
                "unit": ""
        },
        "Błąd czujnika S1 (rE1)": {
                "value": 92,
                "unit": ""
        },
        "Błąd czujnika S2": {
                "value": 93,
                "unit": ""
        },
        "Błąd czujnika S3": {
                "value": 0,
                "unit": ""
        },
        "Błąd czujnika S4": {
                "value": 0,
                "unit": ""
        },
        "Błąd czujnika S5": {
                "value": 0,
                "unit": ""
        },
        "Alarm niskiej temperatury (LO)": {
                "value": 57472,
                "unit": ""
        },
        "Alarm wysokiej temperatury (HI)": {
                "value": 57472,
                "unit": ""
        }
    }

    def simulate_reading(self, tick: float) -> Dict[str, dict]:
        room = round(1 + 1.3 * math.sin(tick * 0.065) + random.uniform(-0.2, 0.2), 1)
        return {**self._DEMO_PARAMETERS,
            "Sonda 1": {"value": room, "unit": "°C"},
            "Sonda 2": {"value": round(room + 3 + random.uniform(-0.3, 0.3), 1), "unit": "°C"},
            "Sonda 3": {"value": round(room + 3.1 + random.uniform(-0.3, 0.3), 1), "unit": "°C"},
            "Sonda 4": {"value": round(room + 3.15 + random.uniform(-0.3, 0.3), 1), "unit": "°C"},
            "Sonda 5": {"value": round(room + 3.2 + random.uniform(-0.3, 0.3), 1), "unit": "°C"},
            "Sonda 6": {"value": round(room + 3.25 + random.uniform(-0.3, 0.3), 1), "unit": "°C"},
            "Sonda 7": {"value": round(room + 3.3 + random.uniform(-0.3, 0.3), 1), "unit": "°C"},
            "Sd1": {"value": round(room + 4 + random.uniform(-0.3, 0.3), 1), "unit": "°C"},
            "Nastawa (St)": {"value": 1.0, "unit": "°C"},
            "Różnica załączania (rd)": {"value": 2.0, "unit": "°C"},
            "Próg końca odszraniania (dt1)": {"value": 8.0, "unit": "°C"},
            "Dyferencjał resetu alarmu temp. (A0)": {"value": 2.0, "unit": "°C"},
            "Próg alarmu niskiej temp. (AL)": {"value": 4.0, "unit": "°C"},
            "Próg alarmu wysokiej temp. (AH)": {"value": 10.0, "unit": "°C"},
            "Próg załączenia wentylatora (F1)": {"value": -5.0, "unit": "°C"},
            "Dyferencjał wentylatora (Frd)": {"value": 2.0, "unit": "°C"},
            "Próg wyłączenia wentylatora (F5)": {"value": 50.0, "unit": "°C"},
            "Nastawa przegrzania (P3)": {"value": 7.0, "unit": "K"},
            "Próg niskiego przegrzania (P7)": {"value": 4.0, "unit": "K"},
            "Nastawa Abs/wzgl. (A1)": {"value": 0, "unit": ""},
            "Błąd czujnika S1 (rE1)": {"value": 0, "unit": ""},
            "Błąd czujnika S2": {"value": 0, "unit": ""},
            "Błąd czujnika S3": {"value": 0, "unit": ""},
            "Błąd czujnika S4": {"value": 0, "unit": ""},
            "Błąd czujnika S5": {"value": 0, "unit": ""},
            "Alarm niskiej temperatury (LO)": {"value": 1 if room < 1 else 0, "unit": ""},
            "Alarm wysokiej temperatury (HI)": {"value": 0, "unit": ""},
            "Przekaźnik alarmowy (zbiorczy)": {"value": 0, "unit": ""},
        }
