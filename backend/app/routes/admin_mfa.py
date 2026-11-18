import pyotp
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import AuditLog, User
from app.security import require_admin
from app.services.mfa import encrypt_secret, recovery_codes, verify_totp

router = APIRouter(prefix="/api/admin/mfa", tags=["Administrator MFA"])

class CodeRequest(BaseModel):
    code: str = Field(min_length=6, max_length=12)
    model_config = ConfigDict(extra="forbid")

@router.get("")
def status(admin: User = Depends(require_admin)):
    return {"enabled": admin.mfa_enabled, "recovery_codes_remaining": len(admin.mfa_recovery_codes or [])}

@router.post("/setup")
def setup(db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    if admin.mfa_enabled:
        raise HTTPException(409, "MFA is already enabled. Contact the security administrator for a controlled reset.")
    secret = pyotp.random_base32()
    admin.mfa_secret_encrypted = encrypt_secret(secret)
    admin.mfa_enabled = False
    admin.mfa_recovery_codes = None
    db.commit()
    uri = pyotp.TOTP(secret).provisioning_uri(name=admin.email, issuer_name="Dumo Network")
    return {"secret": secret, "provisioning_uri": uri}

@router.post("/enable")
def enable(payload: CodeRequest, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    if not admin.mfa_secret_encrypted or not verify_totp(admin.mfa_secret_encrypted, payload.code):
        raise HTTPException(422, "The authenticator code is invalid.")
    plain, hashed = recovery_codes()
    admin.mfa_enabled = True; admin.mfa_recovery_codes = hashed; admin.session_version += 1
    db.add(AuditLog(user_id=admin.id, action="ENABLE_ADMIN_MFA", table_name="users",
                    record_id=admin.id, old_data={"mfa_enabled": False}, new_data={"mfa_enabled": True}))
    db.commit()
    return {"enabled": True, "recovery_codes": plain}
