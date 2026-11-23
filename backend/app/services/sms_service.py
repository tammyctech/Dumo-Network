from datetime import datetime, timezone
import logging
import os

import requests
from sqlalchemy import select

from app.database import SessionLocal
from app.models import SmsDelivery
from app.utils.phone import normalize_nigerian_phone


logger = logging.getLogger(__name__)
PROMOTIONAL = "promotional"
TRANSACTIONAL = "transactional"
ALLOWED_MESSAGE_TYPES = {PROMOTIONAL, TRANSACTIONAL}
TERMINAL_STATUSES = {"DELIVERED", "FAILED", "REJECTED"}


def _masked_phone(phone_number: str) -> str:
    return f"{phone_number[:3]}******{phone_number[-4:]}" if len(phone_number) >= 8 else "***"


def _configuration(message_type: str) -> tuple[dict[str, str] | None, str | None]:
    if message_type not in ALLOWED_MESSAGE_TYPES:
        return None, "SMS message type must be promotional or transactional."
    base_url = os.getenv("TERMII_BASE_URL", "").strip().rstrip("/")
    api_key = os.getenv("TERMII_API_KEY", "").strip()
    if message_type == PROMOTIONAL:
        sender_id = (os.getenv("TERMII_PROMOTIONAL_SENDER_ID") or os.getenv("TERMII_SENDER_ID", "")).strip()
        channel = "generic"
    else:
        sender_id = (os.getenv("TERMII_TRANSACTIONAL_SENDER_ID") or os.getenv("TERMII_SENDER_ID", "")).strip()
        channel = os.getenv("TERMII_TRANSACTIONAL_CHANNEL", os.getenv("TERMII_CHANNEL", "dnd")).strip().lower()
    if not base_url or not api_key or not sender_id:
        return None, "SMS service is not configured. Set TERMII_BASE_URL, TERMII_API_KEY, and TERMII_SENDER_ID."
    if not base_url.startswith("https://"):
        return None, "TERMII_BASE_URL must use HTTPS."
    if not 3 <= len(sender_id) <= 11:
        return None, "The configured Termii sender ID must contain between 3 and 11 characters."
    if channel not in {"dnd", "generic"}:
        return None, "The configured Termii channel must be either dnd or generic."
    return {"base_url": base_url, "api_key": api_key, "sender_id": sender_id, "channel": channel}, None


def _store_delivery(**values: object) -> None:
    """Persist provider state without turning a successful provider call into an app failure."""
    try:
        with SessionLocal() as db:
            db.add(SmsDelivery(**values))
            db.commit()
    except Exception:
        logger.exception("sms_tracking_write_failed")


def send_sms(
    *, recipient: str, message: str, sender_name: str | None = None,
    message_type: str = PROMOTIONAL,
) -> tuple[bool, str | None]:
    """Submit one SMS to Termii; True means accepted, not delivered.

    ``sender_name`` remains for compatibility. Provider sender IDs come from
    environment configuration so a display name cannot override an approved ID.
    """
    del sender_name
    config, error = _configuration(message_type)
    if config is None:
        return False, error
    try:
        phone_number = normalize_nigerian_phone(recipient).removeprefix("+")
    except ValueError as exc:
        return False, str(exc)
    text = message.strip()
    if not text:
        return False, "SMS message cannot be empty."
    log_context = {
        "recipient": _masked_phone(phone_number),
        "sender_id": config["sender_id"],
        "channel": config["channel"],
        "message_type": message_type,
    }
    try:
        response = requests.post(
            f"{config['base_url']}/api/sms/send",
            json={
                "api_key": config["api_key"], "to": phone_number,
                "from": config["sender_id"], "sms": text,
                "type": "plain", "channel": config["channel"],
            },
            timeout=15,
        )
    except requests.RequestException as exc:
        logger.warning("termii_submission_failed context=%s error_type=%s", log_context, type(exc).__name__)
        _store_delivery(
            recipient=phone_number, sender_id=config["sender_id"], channel=config["channel"],
            message_type=message_type, status="FAILED", error="Provider connection failed",
            provider_status=type(exc).__name__,
        )
        return False, "Could not connect to Termii. Check the backend logs and TERMII_BASE_URL."
    try:
        payload = response.json()
    except ValueError:
        payload = {}
    provider_message = payload.get("message") if isinstance(payload, dict) else None
    message_id = (payload.get("message_id") or payload.get("message_id_str")) if isinstance(payload, dict) else None
    accepted = response.ok and (
        payload.get("code") == "ok" or bool(message_id)
        or str(provider_message or "").strip().casefold() == "successfully sent"
    )
    status = "SENT" if accepted else ("REJECTED" if 400 <= response.status_code < 500 else "FAILED")
    _store_delivery(
        termii_message_id=str(message_id) if message_id else None,
        recipient=phone_number, sender_id=config["sender_id"], channel=config["channel"],
        message_type=message_type, status=status,
        provider_status=str(provider_message or payload.get("code") or response.status_code)[:100],
        error=None if accepted else str(provider_message or "Provider rejected submission")[:500],
    )
    if accepted:
        logger.info("termii_submission_accepted context=%s message_id=%s status=SENT", log_context, message_id)
        return True, None
    logger.warning("termii_submission_rejected context=%s http_status=%s provider_code=%s", log_context, response.status_code, payload.get("code") or "unknown")
    return False, f"Termii rejected the SMS ({response.status_code}): {provider_message or 'Unknown provider error.'}"


def delivery_status(provider_status: str) -> str:
    normalized = provider_status.strip().casefold()
    if normalized in {"delivered", "message delivered", "message delivered to handset"}:
        return "DELIVERED"
    if "reject" in normalized or "dnd" in normalized:
        return "REJECTED"
    if "fail" in normalized or "expired" in normalized:
        return "FAILED"
    return "SENT"


def process_delivery_report(payload: dict[str, object]) -> bool:
    message_id = str(payload.get("message_id") or payload.get("id") or "").strip()
    provider_status = str(payload.get("status") or "").strip()
    if not message_id or not provider_status:
        return False
    mapped_status = delivery_status(provider_status)
    try:
        with SessionLocal() as db:
            delivery = db.scalar(select(SmsDelivery).where(SmsDelivery.termii_message_id == message_id))
            if delivery is None:
                logger.warning("termii_delivery_report_unknown message_id=%s", message_id)
                return False
            if delivery.status in TERMINAL_STATUSES and delivery.status != mapped_status:
                logger.info("termii_delivery_report_ignored message_id=%s current=%s incoming=%s", message_id, delivery.status, mapped_status)
                return True
            delivery.status = mapped_status
            delivery.provider_status = provider_status[:100]
            delivery.updated_at = datetime.now(timezone.utc)
            if mapped_status == "DELIVERED":
                delivery.delivered_at = datetime.now(timezone.utc)
                delivery.error = None
            elif mapped_status in {"FAILED", "REJECTED"}:
                delivery.error = provider_status[:500]
            db.commit()
            logger.info("termii_delivery_report message_id=%s status=%s", message_id, mapped_status)
            return True
    except Exception:
        logger.exception("termii_delivery_report_write_failed message_id=%s", message_id)
        return False


def send_agent_approval_sms(
    *, recipient: str, full_name: str, temporary_password: str,
    lga: str, ward: str, polling_unit_code: str,
    polling_unit_name: str | None = None, sender_name: str | None = None,
) -> tuple[bool, str | None]:
    login_url = f"{os.getenv('FRONTEND_URL', 'http://localhost:5173').rstrip('/')}/login"
    polling_unit = f"{polling_unit_code} - {polling_unit_name}" if polling_unit_name else polling_unit_code
    return send_sms(
        recipient=recipient,
        message=(
            f"Hello {full_name}, your Dumo agent account is approved. Assignment: "
            f"{lga} LGA, {ward}, {polling_unit}. Login phone: {recipient}. "
            f"Temporary password: {temporary_password}. Login: {login_url}. "
            "Change your password after signing in."
        ), sender_name=sender_name, message_type=PROMOTIONAL,
    )
