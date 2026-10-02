"""Outbound alarm notifications: e-mail (SMTP), Telegram and SMS.

Design constraints:
- Failures must never take down the scanner loop - every public function
  swallows and logs errors.
- No new dependencies: smtplib + urllib from the stdlib, run in a thread
  (asyncio.to_thread) so the SMTP/HTTP round trip doesn't block the event
  loop the Modbus scanner shares.
- A channel with empty configuration (no SMTP_HOST / no bot token) is
  treated as disabled, not as an error - deployments enable only what
  they use.
"""

import asyncio
import base64
import json
import logging
import smtplib
import urllib.error
import urllib.parse
import urllib.request
from datetime import date
from email.mime.text import MIMEText

from app.core.config import settings

logger = logging.getLogger(__name__)


def _send_email_sync(subject: str, body: str) -> None:
    recipients = settings.alert_email_to_list
    if not settings.SMTP_HOST or not recipients:
        return
    msg = MIMEText(body, "plain", "utf-8")
    msg["Subject"] = subject
    msg["From"] = settings.SMTP_FROM or settings.SMTP_USER
    msg["To"] = ", ".join(recipients)
    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15) as smtp:
        smtp.ehlo()
        # STARTTLS when the server offers it - typical for port 587;
        # plain connections (e.g. an internal relay on 25) still work.
        if smtp.has_extn("starttls"):
            smtp.starttls()
            smtp.ehlo()
        if settings.SMTP_USER:
            smtp.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
        smtp.sendmail(msg["From"], recipients, msg.as_string())


def _send_telegram_sync(text: str) -> None:
    if not settings.TELEGRAM_BOT_TOKEN or not settings.telegram_chat_ids:
        return
    url = f"https://api.telegram.org/bot{settings.TELEGRAM_BOT_TOKEN}/sendMessage"
    errors = []
    for chat_id in settings.telegram_chat_ids:
        data = urllib.parse.urlencode({"chat_id": chat_id, "text": text}).encode()
        req = urllib.request.Request(url, data=data, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                payload = json.loads(resp.read().decode())
                if not payload.get("ok"):
                    errors.append(f"{chat_id}: {payload.get('description', payload)}")
        except urllib.error.HTTPError as e:
            errors.append(f"{chat_id}: {_http_error_text(e)}")
    if errors:
        raise RuntimeError("Telegram: " + "; ".join(errors))


def _http_error_text(e: "urllib.error.HTTPError") -> str:
    """The provider's own error message (wrong token, unknown chat...)
    rather than a bare "HTTP Error 401"."""
    try:
        payload = json.loads(e.read().decode())
        return str(payload.get("description") or payload.get("message") or payload.get("error") or payload)
    except Exception:
        return f"HTTP {e.code}"


# SMS cost money - count what went out today against SMS_DAILY_LIMIT.
_sms_sent = {"day": date.today(), "count": 0, "limit_logged": False}
SMS_MAX_CHARS = 300  # two SMS parts at most


def sms_text(subject: str, body: str) -> str:
    text = f"{subject.replace('[JawcoldMonitor] ', 'JawcoldMonitor: ')}\n{body}"
    return text if len(text) <= SMS_MAX_CHARS else text[:SMS_MAX_CHARS - 1] + "…"


def _sms_quota(recipients: int) -> bool:
    today = date.today()
    if _sms_sent["day"] != today:
        _sms_sent.update(day=today, count=0, limit_logged=False)
    limit = settings.SMS_DAILY_LIMIT
    if limit and _sms_sent["count"] + recipients > limit:
        if not _sms_sent["limit_logged"]:
            logger.warning("Osiągnięto dzienny limit SMS (%d) - kolejne SMS-y dziś nie zostaną wysłane", limit)
            _sms_sent["limit_logged"] = True
        return False
    _sms_sent["count"] += recipients
    return True


def sms_sent_today() -> int:
    return _sms_sent["count"] if _sms_sent["day"] == date.today() else 0


def _send_sms_sync(text: str, respect_limit: bool = True) -> None:
    recipients = settings.sms_to_list
    if not settings.SMS_API_TOKEN or not recipients:
        return
    if respect_limit and not _sms_quota(len(recipients)):
        return
    provider = (settings.SMS_PROVIDER or "smsapi").strip().lower()
    if provider == "smsapi":
        # SMSAPI.pl: one request for all numbers; normalize=1 replaces
        # Polish letters so a message fits in 160-char GSM parts.
        fields = {"to": ",".join(recipients), "message": text, "format": "json", "encoding": "utf-8", "normalize": "1"}
        if settings.SMS_SENDER:
            fields["from"] = settings.SMS_SENDER
        req = urllib.request.Request(
            "https://api.smsapi.pl/sms.do", data=urllib.parse.urlencode(fields).encode(), method="POST",
            headers={"Authorization": f"Bearer {settings.SMS_API_TOKEN}"},
        )
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                payload = json.loads(resp.read().decode())
        except urllib.error.HTTPError as e:
            raise RuntimeError(f"SMSAPI: {_http_error_text(e)}")
        if "error" in payload:
            raise RuntimeError(f"SMSAPI: {payload.get('message') or payload['error']}")
    elif provider == "twilio":
        if not settings.SMS_ACCOUNT_SID or not settings.SMS_SENDER:
            raise ValueError("Twilio wymaga Account SID i numeru nadawcy")
        auth = base64.b64encode(f"{settings.SMS_ACCOUNT_SID}:{settings.SMS_API_TOKEN}".encode()).decode()
        url = f"https://api.twilio.com/2010-04-01/Accounts/{settings.SMS_ACCOUNT_SID}/Messages.json"
        errors = []
        for number in recipients:
            data = urllib.parse.urlencode({"To": number, "From": settings.SMS_SENDER, "Body": text}).encode()
            req = urllib.request.Request(url, data=data, method="POST", headers={"Authorization": f"Basic {auth}"})
            try:
                urllib.request.urlopen(req, timeout=15).close()
            except urllib.error.HTTPError as e:
                errors.append(f"{number}: {_http_error_text(e)}")
        if errors:
            raise RuntimeError("Twilio: " + "; ".join(errors))
    else:
        raise ValueError(f"Nieznana bramka SMS: {provider} (dostępne: smsapi, twilio)")


CHANNELS = ("email", "telegram", "sms")


def channel_enabled(channel: str) -> bool:
    return {
        "email": settings.EMAIL_ENABLED,
        "telegram": settings.TELEGRAM_ENABLED,
        "sms": settings.SMS_ENABLED,
    }.get(channel, False)


def channel_configured(channel: str) -> bool:
    if channel == "email":
        return bool(settings.SMTP_HOST and settings.alert_email_to_list)
    if channel == "telegram":
        return bool(settings.TELEGRAM_BOT_TOKEN and settings.telegram_chat_ids)
    if channel == "sms":
        base = bool(settings.SMS_API_TOKEN and settings.sms_to_list)
        if (settings.SMS_PROVIDER or "").lower() == "twilio":
            return base and bool(settings.SMS_ACCOUNT_SID and settings.SMS_SENDER)
        return base
    return False


async def notify(channels: list, subject: str, body: str) -> None:
    """Send `subject`/`body` through each requested channel ("email",
    "telegram"). Unknown or unconfigured channels are skipped silently;
    a delivery failure is logged and does not raise."""
    for channel in channels or []:
        if not channel_enabled(channel):
            continue
        try:
            if channel == "email":
                await asyncio.to_thread(_send_email_sync, subject, body)
            elif channel == "telegram":
                await asyncio.to_thread(_send_telegram_sync, f"{subject}\n{body}")
            elif channel == "sms":
                await asyncio.to_thread(_send_sms_sync, sms_text(subject, body))
        except Exception as e:
            logger.warning("Powiadomienie przez %s nie powiodło się: %s", channel, e)


async def notify_system(subject: str, body: str) -> None:
    """System alarms (device offline, disk, hardware alarm codes) go to the
    channels configured globally in NOTIFY_SYSTEM_CHANNELS."""
    await notify(settings.notify_system_channels_list, subject, body)


async def send_test(channel: str) -> None:
    """Send a test message through one channel and RAISE on failure - the
    opposite of notify(), so the settings page can show what is wrong
    (bad SMTP password, wrong chat id) before a real alarm depends on it."""
    subject = "[JawcoldMonitor] Test powiadomień"
    body = "To jest wiadomość testowa. Jeśli ją widzisz, alarmy z panelu dotrą tym kanałem."
    if channel == "email":
        if not settings.SMTP_HOST or not settings.alert_email_to_list:
            raise ValueError("Uzupełnij serwer SMTP i odbiorców alarmów")
        await asyncio.to_thread(_send_email_sync, subject, body)
    elif channel == "telegram":
        if not settings.TELEGRAM_BOT_TOKEN or not settings.telegram_chat_ids:
            raise ValueError("Uzupełnij token bota i ID czatu")
        await asyncio.to_thread(_send_telegram_sync, f"{subject}\n{body}")
    elif channel == "sms":
        if not channel_configured("sms"):
            raise ValueError("Uzupełnij token bramki i numery odbiorców (dla Twilio także Account SID i nadawcę)")
        # A test is a deliberate click - not counted against the daily limit.
        await asyncio.to_thread(_send_sms_sync, sms_text(subject, "Test powiadomień SMS z panelu."), False)
    else:
        raise ValueError("Nieznany kanał")
