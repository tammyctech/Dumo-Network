import base64
import binascii
import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import AuditLog, OrganizationSettings, User
from ..security import get_current_user

router = APIRouter(prefix="/api/admin/organization", tags=["Organization Settings"])
DEFAULT_NAME = "Dumo Youth Network"
LOGO_PATTERN = re.compile(r"^data:image/(png|jpeg|webp|svg\+xml);base64,", re.I)


class OrganizationSettingsPayload(BaseModel):
    organization_name: str = Field(min_length=2, max_length=200)
    official_email: EmailStr | None = None
    official_phone: str | None = Field(default=None, max_length=30)
    office_address: str | None = Field(default=None, max_length=500)
    website: str | None = Field(default=None, max_length=500)
    logo_data_url: str | None = Field(default=None, max_length=1_500_000)
    notification_emails: list[EmailStr] = Field(default_factory=list, max_length=20)
    email_sender_name: str = Field(min_length=2, max_length=100)
    sms_sender_name: str | None = Field(default=None, min_length=3, max_length=11)
    model_config = ConfigDict(extra="forbid")

    @field_validator("official_phone")
    @classmethod
    def validate_phone(cls, value: str | None):
        if value and not re.fullmatch(r"\+?[0-9]{7,19}", value.strip()):
            raise ValueError("Enter a valid phone number using 7 to 19 digits.")
        return value.strip() if value else None

    @field_validator("website")
    @classmethod
    def validate_website(cls, value: str | None):
        if value and not re.match(r"^https://", value.strip(), re.I):
            raise ValueError("Website must begin with https://")
        return value.strip() if value else None

    @field_validator("sms_sender_name")
    @classmethod
    def validate_sms_sender(cls, value: str | None):
        if value and not re.fullmatch(r"[A-Za-z0-9 ]{3,11}", value.strip()):
            raise ValueError("SMS sender name must be 3–11 letters, numbers, or spaces.")
        return value.strip() if value else None

    @field_validator("logo_data_url")
    @classmethod
    def validate_logo(cls, value: str | None):
        if not value:
            return None
        match = LOGO_PATTERN.match(value)
        if not match:
            raise ValueError("Logo must be a PNG, JPEG, WebP, or SVG image.")
        try:
            decoded = base64.b64decode(value[match.end():], validate=True)
        except (ValueError, binascii.Error) as exc:
            raise ValueError("Logo image data is invalid.") from exc
        if len(decoded) > 1_000_000:
            raise ValueError("Logo must not exceed 1 MB.")
        return value


def require_admin(user: User = Depends(get_current_user)) -> User:
    if not user.is_active or user.role != "admin":
        raise HTTPException(403, "Administrator access required.")
    return user


def serialize(item: OrganizationSettings | None) -> dict:
    return {
        "organization_name": item.organization_name if item else DEFAULT_NAME,
        "official_email": item.official_email if item else None,
        "official_phone": item.official_phone if item else None,
        "office_address": item.office_address if item else None,
        "website": item.website if item else None,
        "logo_data_url": item.logo_data_url if item else None,
        "notification_emails": item.notification_emails if item else [],
        "email_sender_name": item.email_sender_name if item else DEFAULT_NAME,
        "sms_sender_name": item.sms_sender_name if item else None,
        "updated_at": item.updated_at.isoformat() if item and item.updated_at else None,
    }


@router.get("")
def get_organization_settings(
    db: Session = Depends(get_db), admin: User = Depends(require_admin),
):
    return serialize(db.get(OrganizationSettings, 1))


@router.put("")
def update_organization_settings(
    payload: OrganizationSettingsPayload,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    item = db.get(OrganizationSettings, 1)
    old_data = serialize(item)
    values = payload.model_dump(mode="json")
    values["notification_emails"] = list(dict.fromkeys(
        email.strip().casefold() for email in values["notification_emails"]
    ))
    if item is None:
        item = OrganizationSettings(id=1, **values, updated_by=admin.id)
        db.add(item)
    else:
        for key, value in values.items():
            setattr(item, key, value)
        item.updated_by = admin.id
        item.updated_at = datetime.now(timezone.utc)
    db.flush()
    new_data = serialize(item)
    audit_old = {**old_data, "logo_data_url": "stored" if old_data.get("logo_data_url") else None}
    audit_new = {**new_data, "logo_data_url": "stored" if item.logo_data_url else None}
    db.add(AuditLog(
        user_id=admin.id, action="UPDATE_ORGANIZATION", table_name="organization_settings",
        record_id=1, old_data=audit_old, new_data=audit_new,
    ))
    db.commit()
    db.refresh(item)
    return serialize(item)
