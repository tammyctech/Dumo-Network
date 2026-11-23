import hashlib
import hmac
import json
import logging
import os

from fastapi import APIRouter, HTTPException, Request

from ..services.sms_service import process_delivery_report


router = APIRouter(prefix="/api/webhooks/termii", tags=["Termii Webhooks"])
logger = logging.getLogger(__name__)


def valid_termii_signature(body: bytes, signature: str | None) -> bool:
    secret = os.getenv("TERMII_WEBHOOK_SECRET", os.getenv("TERMII_API_KEY", "")).strip()
    if not secret or not signature:
        return False
    supplied = signature.removeprefix("sha512=").strip().lower()
    expected = hmac.new(secret.encode(), body, hashlib.sha512).hexdigest()
    return hmac.compare_digest(expected, supplied)


@router.post("/delivery-report")
async def termii_delivery_report(request: Request):
    body = await request.body()
    if not valid_termii_signature(body, request.headers.get("X-Termii-Signature")):
        logger.warning("termii_webhook_invalid_signature")
        raise HTTPException(401, "Invalid webhook signature.")
    try:
        payload = json.loads(body)
    except (TypeError, ValueError):
        raise HTTPException(400, "Invalid JSON payload.") from None
    if not isinstance(payload, dict) or not process_delivery_report(payload):
        raise HTTPException(422, "Unknown or incomplete delivery report.")
    return {"received": True}
