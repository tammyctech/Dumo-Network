import json
import os
import base64
import binascii
from functools import lru_cache
from pathlib import Path
from urllib.parse import urlsplit
import ipaddress

from dotenv import load_dotenv
from pywebpush import webpush, WebPushException

load_dotenv()

BACKEND_DIR = Path(__file__).resolve().parents[2]


@lru_cache(maxsize=1)
def get_vapid_config():
    key_path = os.getenv("VAPID_PRIVATE_KEY_PATH")
    subject = os.getenv("VAPID_SUBJECT") or os.getenv("FRONTEND_URL")

    private_key_b64 = os.getenv("VAPID_PRIVATE_KEY_B64", "").strip()

    if key_path:
        private_key = Path(key_path)
        if not private_key.is_absolute():
            private_key = BACKEND_DIR / private_key
    else:
        # Render mounts secret files under /etc/secrets. Keep the local path as
        # a development fallback without ever committing the ignored PEM file.
        candidates = (
            Path("/etc/secrets/private_key.pem"),
            BACKEND_DIR / "private_key.pem",
        )
        private_key = next(
            (candidate for candidate in candidates if candidate.is_file()),
            candidates[0],
        )

    if not private_key.is_file() and private_key_b64:
        try:
            private_key_bytes = base64.b64decode(
                private_key_b64,
                validate=True,
            )
        except (binascii.Error, ValueError) as error:
            raise RuntimeError(
                "VAPID_PRIVATE_KEY_B64 is not valid base64"
            ) from error

        if (
            len(private_key_bytes) > 16_384
            or b"-----BEGIN" not in private_key_bytes
            or b"PRIVATE KEY-----" not in private_key_bytes
        ):
            raise RuntimeError(
                "VAPID_PRIVATE_KEY_B64 does not contain a valid PEM private key"
            )

        private_key = Path("/tmp/dumo_vapid_private_key.pem")
        private_key.write_bytes(private_key_bytes)
        private_key.chmod(0o600)

    if not subject:
        raise RuntimeError("VAPID_SUBJECT is not configured")

    if not private_key.is_file():
        raise RuntimeError(
            "VAPID private key file was not found at the configured path or "
            "/etc/secrets/private_key.pem, and VAPID_PRIVATE_KEY_B64 is absent"
        )

    return str(private_key), subject


def validate_push_endpoint(endpoint: str):
    """
    Restrict outgoing requests to supported browser push services.
    """

    parsed = urlsplit(endpoint)

    if (
        parsed.scheme != "https"
        or not parsed.hostname
        or parsed.username is not None
        or parsed.password is not None
        or parsed.port not in (None, 443)
    ):
        raise ValueError("Invalid push endpoint")

    hostname = parsed.hostname.lower().rstrip(".")

    allowed_hosts = {
        "fcm.googleapis.com",
        "updates.push.services.mozilla.com",
        "web.push.apple.com",
    }

    allowed_suffixes = (
        ".push.apple.com",
    )

    if hostname not in allowed_hosts and not any(
        hostname.endswith(suffix)
        for suffix in allowed_suffixes
    ):
        raise ValueError("Unsupported push service")

    try:
        ipaddress.ip_address(hostname)
        raise ValueError("IP addresses are not permitted")
    except ValueError as error:
        if str(error) == "IP addresses are not permitted":
            raise


def send_push_notification(
    subscription,
    title: str,
    body: str,
    url: str = "/dashboard",
):
    """
    Send a Web Push notification to a registered browser.

    subscription must contain:
        endpoint
        p256dh
        auth
    """

    validate_push_endpoint(subscription.endpoint)

    if not url.startswith("/") or url.startswith("//"):
        raise ValueError("Notification URL must be a relative path")

    private_key, subject = get_vapid_config()

    payload = {
        "title": title,
        "body": body,
        "url": url,
    }

    subscription_info = {
        "endpoint": subscription.endpoint,
        "keys": {
            "p256dh": subscription.p256dh,
            "auth": subscription.auth,
        },
    }

    try:
        response = webpush(
            subscription_info=subscription_info,
            data=json.dumps(payload),
            vapid_private_key=private_key,
            vapid_claims={"sub": subject},
            ttl=3600,
            timeout=10,
        )

        return {
            "success": True,
            "status_code": response.status_code,
        }

    except WebPushException as error:
        status_code = (
            error.response.status_code
            if error.response is not None
            else None
        )

        return {
            "success": False,
            "status_code": status_code,
            "error": str(error),
        }
