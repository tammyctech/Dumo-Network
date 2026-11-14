from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import OrganizationSettings, User


def get_organization_settings(db: Session) -> OrganizationSettings | None:
    return db.get(OrganizationSettings, 1)


def admin_notification_recipients(db: Session) -> list[tuple[str, str]]:
    admins = db.scalars(select(User).where(User.role == "admin", User.is_active.is_(True))).all()
    recipients: dict[str, tuple[str, str]] = {}
    for admin in admins:
        email = admin.email.strip().casefold()
        if not email.endswith(".invalid") and not email.endswith("@dumo-network.vercel.app"):
            recipients[email] = (admin.email, admin.full_name)
    settings = get_organization_settings(db)
    if settings:
        for configured_email in settings.notification_emails or []:
            email = configured_email.strip().casefold()
            recipients[email] = (configured_email, settings.organization_name)
    return list(recipients.values())


def email_sender_name(db: Session) -> str | None:
    settings = get_organization_settings(db)
    return settings.email_sender_name if settings else None


def sms_sender_name(db: Session) -> str | None:
    settings = get_organization_settings(db)
    return settings.sms_sender_name if settings else None
