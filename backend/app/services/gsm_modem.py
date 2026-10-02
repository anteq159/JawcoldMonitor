"""SMS through a GSM/LTE modem plugged into the Raspberry (USB stick or a
SIM800/SIM7600-type board), driven with standard AT commands in text mode.

No internet or SMS gateway account needed - a SIM card with credit is
enough, which also makes it the channel that still works when the site's
internet is down.

Blocking (pyserial); callers run it in a thread. One lock serialises
every modem session, so two alarms at once never interleave commands.
"""

import re
import threading
import time
import unicodedata
from typing import Dict, List, Optional

from app.core.config import settings

_lock = threading.Lock()

# Text mode sends GSM 7-bit characters: Polish letters are replaced
# (ł is not decomposed by NFKD) and the message is cut to one SMS.
_REPLACE = str.maketrans({"ł": "l", "Ł": "L", "—": "-", "–": "-", "„": '"', "”": '"', "…": "..."})
SINGLE_SMS = 160


def to_gsm_text(text: str) -> str:
    text = unicodedata.normalize("NFKD", text.translate(_REPLACE))
    text = "".join(c for c in text if not unicodedata.combining(c) and (c in "\n" or 32 <= ord(c) < 127))
    return text if len(text) <= SINGLE_SMS else text[:SINGLE_SMS - 3] + "..."


class ModemError(RuntimeError):
    pass


# +CMS ERROR codes worth explaining to whoever sets the modem up.
_CMS_ERRORS = {
    "38": "brak sieci", "41": "sieć tymczasowo niedostępna", "42": "przeciążenie sieci",
    "302": "operacja niedozwolona", "304": "zły format numeru", "310": "brak karty SIM",
    "311": "wymagany PIN", "313": "awaria karty SIM", "330": "nieznany numer centrum SMS",
    "331": "brak zasięgu sieci", "332": "przekroczony czas sieci",
}


class _Session:
    def __init__(self, port: str, baudrate: int):
        import serial  # pyserial - imported here so the app starts without it
        if not port:
            raise ModemError("Nie podano portu modemu")
        ports = set(settings.rs485_port_list)
        if port in ports:
            raise ModemError("Ten port jest używany przez magistralę RS485 - modem musi mieć własny")
        try:
            self.ser = serial.Serial(port, baudrate=baudrate, timeout=0.5, write_timeout=5)
        except Exception as e:
            text = str(e)
            if "No such file" in text or "Errno 2" in text:
                raise ModemError(f"Nie ma portu {port} - sprawdź, czy modem jest podłączony, i wybierz port z listy")
            if "Permission denied" in text or "Errno 13" in text:
                raise ModemError(f"Brak dostępu do portu {port}")
            if "busy" in text.lower() or "lock" in text.lower():
                raise ModemError(f"Port {port} jest zajęty (np. przez ModemManager)")
            raise ModemError(f"Nie można otworzyć portu {port}: {e}")

    def close(self):
        try:
            self.ser.close()
        except Exception:
            pass

    def _read_until(self, done, timeout: float) -> str:
        buf = ""
        end = time.monotonic() + timeout
        while time.monotonic() < end:
            chunk = self.ser.read(self.ser.in_waiting or 1).decode("ascii", errors="replace")
            if chunk:
                buf += chunk
                if done(buf):
                    return buf
        return buf

    def cmd(self, command: str, timeout: float = 5.0) -> str:
        self.ser.reset_input_buffer()
        self.ser.write((command + "\r").encode("ascii"))
        reply = self._read_until(
            lambda b: re.search(r"\r\n(OK|ERROR|\+CM[ES] ERROR: ?[^\r\n]+)\r\n", b) is not None, timeout,
        )
        if not reply:
            raise ModemError(f"Modem nie odpowiada na {command} (sprawdź port i prędkość)")
        err = re.search(r"\+CM([ES]) ERROR: ?([^\r\n]+)", reply)
        if err:
            code = err.group(2).strip()
            raise ModemError(f"{command}: błąd {code}" + (f" ({_CMS_ERRORS[code]})" if code in _CMS_ERRORS else ""))
        if "\r\nERROR\r\n" in reply or reply.strip().endswith("ERROR"):
            raise ModemError(f"Modem odrzucił polecenie {command}")
        return reply

    def prepare(self) -> None:
        """Wake the modem, echo off, unlock the SIM, text mode."""
        for _ in range(3):
            try:
                self.cmd("AT", 2)
                break
            except ModemError:
                continue
        else:
            raise ModemError("Modem nie odpowiada (sprawdź port, prędkość i czy port nie jest zajęty, np. przez ModemManager)")
        self.cmd("ATE0", 2)
        sim = self.cmd("AT+CPIN?", 5)
        if "SIM PIN" in sim:
            if not settings.SMS_MODEM_PIN:
                raise ModemError("Karta SIM wymaga PIN-u - wpisz go w ustawieniach")
            self.cmd(f'AT+CPIN="{settings.SMS_MODEM_PIN}"', 10)
            time.sleep(5)  # the SIM needs a moment before it accepts SMS commands
        elif "SIM PUK" in sim:
            raise ModemError("Karta SIM zablokowana (wymaga PUK) - odblokuj ją w telefonie")
        elif "READY" not in sim:
            raise ModemError(f"Karta SIM niegotowa: {sim.strip()}")
        self.cmd("AT+CMGF=1", 2)
        self.cmd('AT+CSCS="GSM"', 2)

    def send(self, number: str, text: str) -> None:
        self.ser.reset_input_buffer()
        self.ser.write(f'AT+CMGS="{number}"\r'.encode("ascii"))
        prompt = self._read_until(lambda b: ">" in b or "ERROR" in b, 10)
        if ">" not in prompt:
            err = re.search(r"\+CMS ERROR: ?(\d+)", prompt)
            reason = _CMS_ERRORS.get(err.group(1), f"błąd {err.group(1)}") if err else (prompt.strip() or "brak odpowiedzi")
            raise ModemError(f"{number}: modem nie przyjął wiadomości ({reason})")
        self.ser.write(text.encode("ascii", errors="replace") + b"\x1a")
        reply = self._read_until(lambda b: "+CMGS" in b or "ERROR" in b, 60)
        if "+CMGS" not in reply:
            err = re.search(r"\+CMS ERROR: ?(\d+)", reply)
            code = err.group(1) if err else None
            reason = _CMS_ERRORS.get(code or "", f"błąd {code}" if code else "brak potwierdzenia z sieci")
            raise ModemError(f"{number}: SMS nie wysłany ({reason})")


def send_sms(numbers: List[str], text: str) -> None:
    text = to_gsm_text(text)
    with _lock:
        session = _Session(settings.SMS_MODEM_PORT, settings.SMS_MODEM_BAUDRATE)
        try:
            session.prepare()
            errors = []
            for number in numbers:
                try:
                    session.send(number, text)
                except ModemError as e:
                    errors.append(str(e))
            if errors:
                raise ModemError("; ".join(errors))
        finally:
            session.close()


def status() -> Dict[str, Optional[object]]:
    """What the setup screen shows: SIM, network registration, operator and
    signal - enough to tell "no coverage" from "wrong port"."""
    with _lock:
        session = _Session(settings.SMS_MODEM_PORT, settings.SMS_MODEM_BAUDRATE)
        try:
            session.prepare()
            info: Dict[str, Optional[object]] = {"sim": "gotowa"}
            try:
                model = session.cmd("AT+CGMM", 3)
                info["model"] = next((l.strip() for l in model.splitlines() if l.strip() and l.strip() != "OK"), None)
            except ModemError:
                info["model"] = None
            csq = re.search(r"\+CSQ: ?(\d+),", session.cmd("AT+CSQ", 3))
            rssi = int(csq.group(1)) if csq else 99
            # 0-31 (99 = unknown) -> percent for the panel.
            info["signal_percent"] = None if rssi == 99 else round(rssi * 100 / 31)
            reg = re.search(r"\+CREG: ?\d,(\d)", session.cmd("AT+CREG?", 3))
            state = reg.group(1) if reg else None
            info["registered"] = state in ("1", "5")
            info["network"] = {"1": "sieć domowa", "5": "roaming", "2": "szuka sieci", "3": "odmowa rejestracji", "0": "brak sieci"}.get(state or "", "nieznany")
            try:
                op = re.search(r'\+COPS: ?\d,\d,"([^"]+)"', session.cmd("AT+COPS?", 10))
                info["operator"] = op.group(1) if op else None
            except ModemError:
                info["operator"] = None
            return info
        finally:
            session.close()
