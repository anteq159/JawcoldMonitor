"""Outbound alarm notifications: e-mail (SMTP) and Telegram.

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
import json
import logging
import smtplib
import urllib.parse
import urllib.request
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
    if not settings.TELEGRAM_BOT_TOKEN or not settings.TELEGRAM_CHAT_ID:
        return
    url = f"https://api.telegram.org/bot{settings.TELEGRAM_BOT_TOKEN}/sendMessage"
    data = urllib.parse.urlencode({
        "chat_id": settings.TELEGRAM_CHAT_ID,
        "text": text,
    }).encode()
    req = urllib.request.Request(url, data=data, method="POST")
    with urllib.request.urlopen(req, timeout=15) as resp:
        payload = json.loads(resp.read().decode())
        if not payload.get("ok"):
            raise RuntimeError(f"Telegram API: {payload}")


async def notify(channels: list, subject: str, body: str) -> None:
    """Send `subject`/`body` through each requested channel ("email",
    "telegram"). Unknown or unconfigured channels are skipped silently;
    a delivery failure is logged and does not raise."""
    for channel in channels or []:
        try:
            if channel == "email":
                await asyncio.to_thread(_send_email_sync, subject, body)
            elif channel == "telegram":
                await asyncio.to_thread(_send_telegram_sync, f"{subject}\n{body}")
        except Exception as e:
            logger.warning("Notification via %s failed: %s", channel, e)


async def notify_system(subject: str, body: str) -> None:
    """System alarms (device offline, disk, hardware alarm codes) go to the
    channels configured globally in NOTIFY_SYSTEM_CHANNELS."""
    await notify(settings.notify_system_channels_list, subject, body)
