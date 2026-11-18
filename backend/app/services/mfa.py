import base64
import hashlib
import os
import secrets

import pyotp
from cryptography.fernet import Fernet


def _fernet() -> Fernet:
    configured = os.getenv("MFA_ENCRYPTION_KEY", "").strip()
    if configured:
        return Fernet(configured.encode())
    # Compatibility fallback; production should configure a separate key.
    material = hashlib.sha256(os.environ["JWT_SECRET_KEY"].encode()).digest()
    return Fernet(base64.urlsafe_b64encode(material))


def encrypt_secret(secret: str) -> str:
    return _fernet().encrypt(secret.encode()).decode()


def decrypt_secret(value: str) -> str:
    return _fernet().decrypt(value.encode()).decode()


def verify_totp(encrypted: str, code: str) -> bool:
    return pyotp.TOTP(decrypt_secret(encrypted)).verify(code.replace(" ", ""), valid_window=1)


def recovery_codes() -> tuple[list[str], list[str]]:
    plain = [secrets.token_hex(5).upper() for _ in range(10)]
    hashed = [hashlib.sha256(code.encode()).hexdigest() for code in plain]
    return plain, hashed


def consume_recovery(hashed_codes: list[str] | None, code: str) -> list[str] | None:
    digest = hashlib.sha256(code.replace("-", "").upper().encode()).hexdigest()
    values = list(hashed_codes or [])
    if digest not in values:
        return None
    values.remove(digest)
    return values
