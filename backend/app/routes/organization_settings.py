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
FAVICON_PATTERN = re.compile(r"^data:image/(png|jpeg|webp|x-icon|vnd\.microsoft\.icon|svg\+xml);base64,", re.I)
HEX_COLOR_PATTERN = re.compile(r"^#[0-9a-f]{6}$", re.I)
FONT_FAMILIES = {"Inter", "Arial", "Georgia", "Verdana", "Tahoma", "Trebuchet MS", "Courier New"}
FONT_STYLES = {"normal", "italic"}
DEFAULT_LANDING_TEXT = {
    "nav_results": {"text": "Live results", "color": "#475569"},
    "nav_updates": {"text": "Updates", "color": "#475569"},
    "nav_methodology": {"text": "Methodology", "color": "#475569"},
    "nav_login": {"text": "Monitor login", "color": "#ffffff"},
    "hero_line_1": {"text": "See what’s", "color": "#0f172a"},
    "hero_line_2": {"text": "happening at", "color": "#0369a1"},
    "hero_line_3": {"text": "the polling unit.", "color": "#0f172a"},
    "hero_description": {"text": "Follow unofficial reports submitted by assigned monitors across all 23 local government areas.", "color": "#475569"},
    "hero_results_button": {"text": "Explore the results", "color": "#ffffff"},
    "hero_login_button": {"text": "Monitor sign in", "color": "#1e293b"},
    "hero_disclaimer": {"text": "Unofficial — Agent-Submitted Data. Dumo Youth Network Election Monitoring System does not declare election winners; only authorized electoral bodies do.", "color": "#475569"},
    "map_eyebrow": {"text": "Rivers State · LGA overview", "color": "#0284c7"},
    "map_heading": {"text": "See where submitted results currently lead.", "color": "#0f172a"},
    "map_description": {"text": "Map colors show the party currently leading from reports received in each LGA. Always check the reporting coverage percentage before interpreting the result.", "color": "#1e293b"},
    "totals_eyebrow": {"text": "Statewide totals", "color": "#0284c7"},
    "totals_heading": {"text": "Reported vote position", "color": "#0f172a"},
    "totals_description": {"text": "Totals update as monitors submit polling-unit records. These figures remain provisional and unofficial.", "color": "#475569"},
    "updates_eyebrow": {"text": "Election updates", "color": "#0369a1"},
    "updates_heading": {"text": "Latest field reports", "color": "#0f172a"},
    "updates_description": {"text": "A privacy-safe stream of the newest polling-unit submissions. Agent identities are not published.", "color": "#475569"},
    "method_eyebrow": {"text": "How it works", "color": "#0369a1"},
    "method_heading": {"text": "Transparent from field report to public view.", "color": "#0c4a6e"},
    "method_description": {"text": "Follow each result through a clear, structured process—from an assigned monitor's submission to the public dashboard.", "color": "#0c4a6e"},
    "cta_label": {"text": "Part of the monitoring network?", "color": "#e0f2fe"},
    "cta_heading": {"text": "Sign in to your command center.", "color": "#ffffff"},
    "cta_button": {"text": "Open monitoring workspace", "color": "#ffffff"},
    "footer_notice": {"text": "Unofficial — Agent-Submitted Data", "color": "#64748b"},
}


class LandingTextItem(BaseModel):
    text: str = Field(min_length=1, max_length=600)
    color: str

    @field_validator("color")
    @classmethod
    def validate_item_color(cls, value: str):
        if not HEX_COLOR_PATTERN.fullmatch(value):
            raise ValueError("Use a six-digit hex color.")
        return value.lower()


class OrganizationSettingsPayload(BaseModel):
    organization_name: str = Field(min_length=2, max_length=200)
    official_email: EmailStr | None = None
    official_phone: str | None = Field(default=None, max_length=30)
    office_address: str | None = Field(default=None, max_length=500)
    website: str | None = Field(default=None, max_length=500)
    logo_data_url: str | None = Field(default=None, max_length=1_500_000)
    logo_title: str = Field(default=DEFAULT_NAME, min_length=2, max_length=200)
    logo_subtitle: str = Field(default="Election Monitoring System", min_length=2, max_length=200)
    login_heading: str = Field(default="Welcome back.", min_length=2, max_length=200)
    login_description: str = Field(default="Enter your registered email or phone number to continue to your monitoring dashboard.", min_length=2, max_length=500)
    primary_color: str = "#0284c7"
    background_color: str = "#f6f8f7"
    text_color: str = "#0f172a"
    font_family: str = "Inter"
    font_size: int = Field(default=16, ge=12, le=22)
    font_style: str = "normal"
    background_image_data_url: str | None = Field(default=None, max_length=3_000_000)
    favicon_data_url: str | None = Field(default=None, max_length=800_000)
    landing_text: dict[str, LandingTextItem] = Field(default_factory=lambda: DEFAULT_LANDING_TEXT.copy())
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
        return validate_image(value, LOGO_PATTERN, 1_000_000, "Logo")

    @field_validator("background_image_data_url")
    @classmethod
    def validate_background_image(cls, value: str | None):
        return validate_image(value, LOGO_PATTERN, 2_000_000, "Background image")

    @field_validator("favicon_data_url")
    @classmethod
    def validate_favicon(cls, value: str | None):
        return validate_image(value, FAVICON_PATTERN, 500_000, "Favicon")

    @field_validator("primary_color", "background_color", "text_color")
    @classmethod
    def validate_color(cls, value: str):
        if not HEX_COLOR_PATTERN.fullmatch(value):
            raise ValueError("Use a six-digit hex color such as #0284c7.")
        return value.lower()

    @field_validator("font_family")
    @classmethod
    def validate_font_family(cls, value: str):
        if value not in FONT_FAMILIES:
            raise ValueError("Choose a supported font family.")
        return value

    @field_validator("font_style")
    @classmethod
    def validate_font_style(cls, value: str):
        if value not in FONT_STYLES:
            raise ValueError("Choose normal or italic font style.")
        return value

    @field_validator("landing_text")
    @classmethod
    def validate_landing_text(cls, value: dict[str, LandingTextItem]):
        unknown = set(value) - set(DEFAULT_LANDING_TEXT)
        if unknown:
            raise ValueError("Unknown landing-page text field.")
        return value


def validate_image(value: str | None, pattern: re.Pattern, maximum_bytes: int, label: str):
    if not value:
        return None
    match = pattern.match(value)
    if not match:
        raise ValueError(f"{label} uses an unsupported image format.")
    try:
        decoded = base64.b64decode(value[match.end():], validate=True)
    except (ValueError, binascii.Error) as exc:
        raise ValueError(f"{label} image data is invalid.") from exc
    if len(decoded) > maximum_bytes:
        raise ValueError(f"{label} is too large.")
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
        "logo_title": item.logo_title if item else DEFAULT_NAME,
        "logo_subtitle": item.logo_subtitle if item else "Election Monitoring System",
        "login_heading": item.login_heading if item else "Welcome back.",
        "login_description": item.login_description if item else "Enter your registered email or phone number to continue to your monitoring dashboard.",
        "primary_color": item.primary_color if item else "#0284c7",
        "background_color": item.background_color if item else "#f6f8f7",
        "text_color": item.text_color if item else "#0f172a",
        "font_family": item.font_family if item else "Inter",
        "font_size": item.font_size if item else 16,
        "font_style": item.font_style if item else "normal",
        "background_image_data_url": item.background_image_data_url if item else None,
        "favicon_data_url": item.favicon_data_url if item else None,
        "landing_text": {**DEFAULT_LANDING_TEXT, **(item.landing_text or {})} if item else DEFAULT_LANDING_TEXT,
        "notification_emails": item.notification_emails if item else [],
        "email_sender_name": item.email_sender_name if item else DEFAULT_NAME,
        "sms_sender_name": item.sms_sender_name if item else None,
        "updated_at": item.updated_at.isoformat() if item and item.updated_at else None,
    }


@router.get("/branding")
def get_public_branding(db: Session = Depends(get_db)):
    data = serialize(db.get(OrganizationSettings, 1))
    allowed = (
        "organization_name", "logo_data_url", "logo_title", "logo_subtitle",
        "login_heading", "login_description", "primary_color", "background_color",
        "text_color", "font_family", "font_size", "font_style",
        "background_image_data_url", "favicon_data_url", "landing_text",
    )
    return {key: data[key] for key in allowed}


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
    image_fields = ("logo_data_url", "background_image_data_url", "favicon_data_url")
    audit_old = {**old_data, **{key: "stored" if old_data.get(key) else None for key in image_fields}}
    audit_new = {**new_data, **{key: "stored" if new_data.get(key) else None for key in image_fields}}
    db.add(AuditLog(
        user_id=admin.id, action="UPDATE_ORGANIZATION", table_name="organization_settings",
        record_id=1, old_data=audit_old, new_data=audit_new,
    ))
    db.commit()
    db.refresh(item)
    return serialize(item)
