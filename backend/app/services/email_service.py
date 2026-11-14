import logging
import os
import smtplib
from email.message import EmailMessage
from email.utils import formataddr
from html import escape


logger = logging.getLogger(__name__)


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
    from_email = os.getenv("SMTP_FROM_EMAIL", "").strip()
    if not host or not from_email:
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

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = formataddr((from_name, from_email))
    message["To"] = recipient
    message.set_content(plain_text)
    message.add_alternative(html, subtype="html")

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
    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = formataddr((sender_name or os.getenv("SMTP_FROM_NAME", "Dumo Youth Network"), from_email))
    message["To"] = recipient
    message.set_content(plain_text)
    message.add_alternative(html, subtype="html")
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
                message = EmailMessage()
                message["Subject"] = subject
                message["From"] = formataddr((sender_name or os.getenv("SMTP_FROM_NAME", "Dumo Youth Network"), from_email))
                message["To"] = recipient
                message.set_content(f"Hello {full_name},\n\n{body}\n\nDumo Youth Network")
                safe_body = escape(body).replace("\n", "<br>")
                message.add_alternative(f"<p>Hello {escape(full_name)},</p><p>{safe_body}</p><p>Dumo Youth Network</p>", subtype="html")
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
