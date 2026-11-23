import logging
import os
import smtplib
import base64
import re
from email.message import EmailMessage
from email.utils import formataddr
from html import escape
import requests


logger = logging.getLogger(__name__)


def _email_shell(subject: str, content: str) -> str:
    """Wrap message-specific markup in an email-client-safe DYN layout."""
    body_match = re.search(r"<body[^>]*>(.*?)</body>", content, re.I | re.S)
    inner = body_match.group(1) if body_match else content
    frontend_url = os.getenv("FRONTEND_URL", "https://dumo-network.vercel.app").strip().rstrip("/")
    logo_url = f"{frontend_url}/dyn-favicon-192.png"
    safe_subject = escape(subject)
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><title>{safe_subject}</title></head>
<body style="margin:0;padding:0;background:#eef3ef;color:#172033;font-family:Arial,'Helvetica Neue',sans-serif;-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">{safe_subject} · Dumo Youth Network</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;background:#eef3ef;border-collapse:collapse"><tr><td align="center" style="padding:28px 12px">
  <table role="presentation" width="620" cellpadding="0" cellspacing="0" style="width:100%;max-width:620px;border-collapse:separate;background:#ffffff;border:1px solid #dbe5df;border-radius:22px;overflow:hidden;box-shadow:0 12px 30px rgba(6,63,50,.08)">
    <tr><td style="background:#063f32;padding:26px 30px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td width="58" valign="middle"><img src="{escape(logo_url)}" width="48" height="48" alt="Dumo Youth Network" style="display:block;width:48px;height:48px;border-radius:13px;background:#ffffff;object-fit:contain"></td>
        <td valign="middle"><div style="font-size:14px;line-height:18px;font-weight:800;letter-spacing:1.2px;color:#ffffff">DUMO YOUTH NETWORK</div><div style="margin-top:4px;font-size:10px;line-height:14px;font-weight:700;letter-spacing:1.5px;color:#a7f3d0">ELECTION MONITORING SYSTEM</div></td>
      </tr></table>
    </td></tr>
    <tr><td style="padding:30px 30px 8px"><div style="display:inline-block;padding:6px 10px;border-radius:999px;background:#ecfdf5;color:#047857;font-size:10px;line-height:12px;font-weight:800;letter-spacing:1.2px">OFFICIAL COMMUNICATION</div><h1 style="margin:14px 0 0;color:#0f172a;font-size:24px;line-height:32px;font-weight:800">{safe_subject}</h1></td></tr>
    <tr><td class="email-content" style="padding:8px 30px 32px;font-size:15px;line-height:24px;color:#334155">{inner}</td></tr>
    <tr><td style="border-top:1px solid #e2e8f0;background:#f8faf9;padding:22px 30px;text-align:center"><p style="margin:0;color:#64748b;font-size:12px;line-height:19px">This message was sent by Dumo Youth Network Election Monitoring System.</p><p style="margin:5px 0 0;color:#94a3b8;font-size:11px;line-height:17px">Please do not share passwords or verification details with anyone.</p></td></tr>
  </table>
</td></tr></table>
</body></html>"""


def _gmail_configuration() -> tuple[str, str, str, str] | None:
    values = tuple(os.getenv(name, "").strip() for name in (
        "GMAIL_CLIENT_ID", "GMAIL_CLIENT_SECRET", "GMAIL_REFRESH_TOKEN", "GMAIL_SENDER_EMAIL"
    ))
    return values if all(values) else None


def _gmail_access_token() -> tuple[str | None, str | None]:
    config = _gmail_configuration()
    if not config:
        return None, "Gmail API is not configured. Set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, and GMAIL_SENDER_EMAIL."
    client_id, client_secret, refresh_token, _ = config
    try:
        response = requests.post("https://oauth2.googleapis.com/token", data={
            "client_id": client_id, "client_secret": client_secret,
            "refresh_token": refresh_token, "grant_type": "refresh_token",
        }, timeout=15)
        if not response.ok:
            try:
                payload = response.json()
                code = str(payload.get("error") or f"HTTP {response.status_code}")
                description = str(payload.get("error_description") or "Google rejected the OAuth token exchange.")
            except (ValueError, AttributeError):
                code = f"HTTP {response.status_code}"
                description = "Google rejected the OAuth token exchange."
            logger.error("Gmail OAuth token refresh rejected: %s: %s", code, description)
            if code == "invalid_grant":
                return None, (
                    "Gmail authorization has expired or been revoked. Reconnect the Gmail account "
                    "and replace GMAIL_REFRESH_TOKEN in the backend environment."
                )
            return None, "Gmail authorization failed. Check the backend email configuration and logs."
        return response.json()["access_token"], None
    except (requests.RequestException, KeyError, ValueError) as exc:
        logger.exception("Gmail OAuth token refresh failed")
        return None, f"Gmail OAuth request failed: {type(exc).__name__}."


def _send_gmail_message(message: EmailMessage, access_token: str | None = None) -> tuple[bool, str | None]:
    token, error = (access_token, None) if access_token else _gmail_access_token()
    if not token:
        return False, error
    raw = base64.urlsafe_b64encode(message.as_bytes()).decode().rstrip("=")
    try:
        response = requests.post("https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
            headers={"Authorization": f"Bearer {token}"}, json={"raw": raw}, timeout=20)
        response.raise_for_status()
        return True, None
    except requests.RequestException as exc:
        logger.exception("Gmail API message delivery failed for %s", message.get("To"))
        status = exc.response.status_code if exc.response is not None else "network"
        return False, f"Gmail API delivery failed ({status})."


def _provider() -> str:
    return os.getenv("EMAIL_PROVIDER", "smtp").strip().casefold()


def _from_email() -> str:
    return os.getenv("GMAIL_SENDER_EMAIL" if _provider() == "gmail_api" else "SMTP_FROM_EMAIL", "").strip()


def _message(recipient: str, subject: str, plain_text: str, html: str, sender_name: str | None) -> EmailMessage:
    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = formataddr((sender_name or os.getenv("SMTP_FROM_NAME", "Dumo Youth Network"), _from_email()))
    message["To"] = recipient
    message.set_content(plain_text)
    message.add_alternative(_email_shell(subject, html), subtype="html")
    return message


def _enabled(value: str | None, default: bool = False) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _delivery_error(exc: OSError | smtplib.SMTPException) -> str:
    if isinstance(exc, OSError):
        return (
            "Could not connect to the SMTP server. Render Free blocks outbound "
            "SMTP ports 25, 465, and 587; upgrade the backend service or use an "
            "email provider with an HTTPS API."
        )
    if isinstance(exc, smtplib.SMTPAuthenticationError):
        return "Gmail rejected the SMTP login. Check the Gmail address and 16-character App Password."
    return f"SMTP provider error: {type(exc).__name__}. Check the backend logs for details."


def send_agent_approval_email(
    *,
    recipient: str,
    full_name: str,
    phone_number: str,
    temporary_password: str,
    lga: str,
    ward: str,
    polling_unit_code: str,
    polling_unit_name: str,
    sender_name: str | None = None,
) -> tuple[bool, str | None]:
    """Send an approval email without exposing provider errors to the recipient."""
    host = os.getenv("SMTP_HOST", "").strip()
    from_email = _from_email()
    if _provider() != "gmail_api" and (not host or not from_email):
        return False, "Email service is not configured. Set SMTP_HOST and SMTP_FROM_EMAIL."

    try:
        port = int(os.getenv("SMTP_PORT", "587"))
    except ValueError:
        return False, "Email service configuration has an invalid SMTP_PORT."
    username = os.getenv("SMTP_USERNAME", "").strip()
    password = os.getenv("SMTP_PASSWORD", "")
    from_name = sender_name or os.getenv("SMTP_FROM_NAME", "Dumo Youth Network").strip()
    use_ssl = _enabled(os.getenv("SMTP_USE_SSL"))
    use_tls = _enabled(os.getenv("SMTP_USE_TLS"), default=not use_ssl)
    login_url = f"{os.getenv('FRONTEND_URL', 'http://localhost:5173').rstrip('/')}/login"

    subject = "Your polling-unit agent application has been approved"
    plain_text = f"""Hello {full_name},

Your application has been approved. You are now a Dumo Youth Network polling-unit agent.

Assignment:
LGA: {lga}
Ward: {ward}
Polling unit: {polling_unit_code} - {polling_unit_name}

Login details:
Phone number: {phone_number}
Temporary password: {temporary_password}
Login: {login_url}

You will be required to change the temporary password after your first login.
"""
    html = f"""<!doctype html>
<html><body style="font-family:Arial,sans-serif;color:#172033;line-height:1.6">
<div style="max-width:620px;margin:auto;padding:24px">
<h2 style="color:#047857">Application approved</h2>
<p>Hello {escape(full_name)},</p>
<p>Your application has been approved. You are now a <strong>Dumo Youth Network polling-unit agent</strong>.</p>
<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:18px;margin:20px 0">
<strong>Your assignment</strong><br>
LGA: {escape(lga)}<br>
Ward: {escape(ward)}<br>
Polling unit: {escape(polling_unit_code)} &middot; {escape(polling_unit_name)}
</div>
<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:18px;margin:20px 0">
<strong>Login details</strong><br>
Phone number: {escape(phone_number)}<br>
Temporary password: <strong>{escape(temporary_password)}</strong>
</div>
<p><a href="{escape(login_url)}" style="display:inline-block;background:#047857;color:white;text-decoration:none;border-radius:10px;padding:12px 20px;font-weight:bold">Go to login</a></p>
<p>You will be required to change the temporary password after your first login.</p>
</div></body></html>"""

    if _provider() == "gmail_api":
        return send_system_email(recipient=recipient, subject=subject, plain_text=plain_text, html=html, sender_name=from_name)

    message = _message(recipient, subject, plain_text, html, from_name)

    try:
        smtp_class = smtplib.SMTP_SSL if use_ssl else smtplib.SMTP
        with smtp_class(host, port, timeout=15) as smtp:
            if use_tls and not use_ssl:
                smtp.starttls()
            if username:
                smtp.login(username, password)
            smtp.send_message(message)
        return True, None
    except (OSError, smtplib.SMTPException) as exc:
        logger.exception("Approval email delivery failed for %s", recipient)
        return False, _delivery_error(exc)


def send_system_email(*, recipient: str, subject: str, plain_text: str, html: str, sender_name: str | None = None) -> tuple[bool, str | None]:
    if _provider() == "gmail_api":
        if not _from_email():
            return False, "Gmail API is not configured."
        return _send_gmail_message(_message(recipient, subject, plain_text, html, sender_name))
    host = os.getenv("SMTP_HOST", "").strip()
    from_email = os.getenv("SMTP_FROM_EMAIL", "").strip()
    if not host or not from_email:
        return False, "Email service is not configured."
    try:
        port = int(os.getenv("SMTP_PORT", "587"))
    except ValueError:
        return False, "Email service configuration has an invalid SMTP_PORT."
    username = os.getenv("SMTP_USERNAME", "").strip()
    password = os.getenv("SMTP_PASSWORD", "")
    use_ssl = _enabled(os.getenv("SMTP_USE_SSL"))
    use_tls = _enabled(os.getenv("SMTP_USE_TLS"), default=not use_ssl)
    message = _message(recipient, subject, plain_text, html, sender_name)
    try:
        smtp_class = smtplib.SMTP_SSL if use_ssl else smtplib.SMTP
        with smtp_class(host, port, timeout=15) as smtp:
            if use_tls and not use_ssl:
                smtp.starttls()
            if username:
                smtp.login(username, password)
            smtp.send_message(message)
        return True, None
    except (OSError, smtplib.SMTPException) as exc:
        logger.exception("Email delivery failed for %s", recipient)
        return False, _delivery_error(exc)


def send_bulk_system_email(*, recipients: list[tuple[str, str]], subject: str, body: str, sender_name: str | None = None) -> tuple[int, int, str | None]:
    """Send individual messages over one SMTP connection; never expose recipients to each other."""
    if _provider() == "gmail_api":
        token, error = _gmail_access_token()
        if not token:
            return 0, len(recipients), error
        sent = failed = 0
        for recipient, full_name in recipients:
            plain = f"Hello {full_name},\n\n{body}\n\nDumo Youth Network"
            safe_body = escape(body).replace("\n", "<br>")
            message = _message(recipient, subject, plain, f"<p>Hello {escape(full_name)},</p><p>{safe_body}</p><p>Dumo Youth Network</p>", sender_name)
            delivered, _ = _send_gmail_message(message, token)
            sent += int(delivered); failed += int(not delivered)
        return sent, failed, None if not failed else f"{failed} Gmail API message(s) failed."
    host = os.getenv("SMTP_HOST", "").strip()
    from_email = os.getenv("SMTP_FROM_EMAIL", "").strip()
    if not host or not from_email:
        return 0, len(recipients), "Email service is not configured."
    try:
        port = int(os.getenv("SMTP_PORT", "587"))
    except ValueError:
        return 0, len(recipients), "Email service configuration has an invalid SMTP_PORT."
    username = os.getenv("SMTP_USERNAME", "").strip()
    password = os.getenv("SMTP_PASSWORD", "")
    use_ssl = _enabled(os.getenv("SMTP_USE_SSL"))
    use_tls = _enabled(os.getenv("SMTP_USE_TLS"), default=not use_ssl)
    sent = failed = 0
    try:
        smtp_class = smtplib.SMTP_SSL if use_ssl else smtplib.SMTP
        with smtp_class(host, port, timeout=20) as smtp:
            if use_tls and not use_ssl:
                smtp.starttls()
            if username:
                smtp.login(username, password)
            for recipient, full_name in recipients:
                safe_body = escape(body).replace("\n", "<br>")
                message = _message(
                    recipient, subject,
                    f"Hello {full_name},\n\n{body}\n\nDumo Youth Network",
                    f"<p>Hello {escape(full_name)},</p><p>{safe_body}</p><p style=\"margin-top:24px\"><strong>Dumo Youth Network</strong></p>",
                    sender_name,
                )
                try:
                    smtp.send_message(message)
                    sent += 1
                except smtplib.SMTPException:
                    failed += 1
                    logger.exception("Bulk email delivery failed for %s", recipient)
        return sent, failed, None
    except (OSError, smtplib.SMTPException) as exc:
        logger.exception("Bulk email provider connection failed")
        return sent, len(recipients) - sent, _delivery_error(exc)
