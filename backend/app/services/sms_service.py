import logging
import os

import requests

from app.utils.phone import normalize_nigerian_phone


logger = logging.getLogger(__name__)
ALLOWED_CHANNELS = {"dnd", "generic"}


def _configuration(sender_name: str | None = None) -> tuple[dict[str, str] | None, str | None]:
    base_url = os.getenv("TERMII_BASE_URL", "").strip().rstrip("/")
    api_key = os.getenv("TERMII_API_KEY", "").strip()
    sender_id = (sender_name or os.getenv("TERMII_SENDER_ID", "")).strip()
    channel = os.getenv("TERMII_CHANNEL", "dnd").strip().lower()
    if not base_url or not api_key or not sender_id:
        return None, "SMS service is not configured. Set TERMII_BASE_URL, TERMII_API_KEY, and TERMII_SENDER_ID."
    if not base_url.startswith("https://"):
        return None, "TERMII_BASE_URL must use HTTPS."
    if not 3 <= len(sender_id) <= 11:
        return None, "TERMII_SENDER_ID must contain between 3 and 11 characters."
    if channel not in ALLOWED_CHANNELS:
        return None, "TERMII_CHANNEL must be either dnd or generic."
    return {"base_url": base_url, "api_key": api_key, "sender_id": sender_id, "channel": channel}, None


def send_sms(*, recipient: str, message: str, sender_name: str | None = None) -> tuple[bool, str | None]:
    """Send one SMS through Termii without exposing credentials in errors or logs."""
    config, error = _configuration(sender_name)
    if config is None:
        return False, error
    try:
        phone_number = normalize_nigerian_phone(recipient).removeprefix("+")
    except ValueError as exc:
        return False, str(exc)
    text = message.strip()
    if not text:
        return False, "SMS message cannot be empty."
    try:
        response = requests.post(
            f"{config['base_url']}/api/sms/send",
            json={
                "api_key": config["api_key"],
                "to": phone_number,
                "from": config["sender_id"],
                "sms": text,
                "type": "plain",
                "channel": config["channel"],
            },
            timeout=15,
        )
    except requests.RequestException as exc:
        logger.warning("Termii SMS connection failed: %s", type(exc).__name__)
        return False, "Could not connect to Termii. Check the backend logs and TERMII_BASE_URL."
    try:
        payload = response.json()
    except ValueError:
        payload = {}
    if response.ok and payload.get("code") == "ok":
        return True, None
    provider_message = payload.get("message") if isinstance(payload, dict) else None
    logger.warning("Termii SMS failed with HTTP %s: %s", response.status_code, provider_message or "unknown response")
    return False, f"Termii rejected the SMS ({response.status_code}): {provider_message or 'Unknown provider error.'}"


def send_agent_approval_sms(
    *, recipient: str, full_name: str, temporary_password: str,
    lga: str, ward: str, polling_unit_code: str, sender_name: str | None = None,
) -> tuple[bool, str | None]:
    login_url = f"{os.getenv('FRONTEND_URL', 'http://localhost:5173').rstrip('/')}/login"
    return send_sms(
        recipient=recipient,
        message=(
            f"Hello {full_name}, your Dumo agent account is approved. Assignment: "
            f"{lga}, {ward}, {polling_unit_code}. Login with this phone number and "
            f"temporary password {temporary_password}: {login_url}"
        ), sender_name=sender_name,
    )
