import unittest

from pydantic import ValidationError
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import AuditLog, OrganizationSettings, User
from app.routes.organization_settings import (
    OrganizationSettingsPayload, get_organization_settings,
    update_organization_settings,
)
from app.services.organization_service import admin_notification_recipients


class OrganizationSettingsTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
        )
        Base.metadata.create_all(self.engine)

    def tearDown(self):
        self.engine.dispose()

    def test_admin_can_save_and_load_settings(self):
        with Session(self.engine) as db:
            admin = User(full_name="Admin", email="admin@example.com", hashed_password="x", role="admin", is_active=True)
            db.add(admin); db.commit()
            payload = OrganizationSettingsPayload(
                organization_name="Dumo Youth Network", official_email="office@example.com",
                official_phone="+2348012345678", office_address="Rivers State",
                website="https://example.com", notification_emails=["Results@Example.com", "results@example.com"],
                email_sender_name="Dumo Network", sms_sender_name="Dumo",
            )
            saved = update_organization_settings(payload, db, admin)
            self.assertEqual(saved["notification_emails"], ["results@example.com"])
            self.assertEqual(get_organization_settings(db, admin)["official_phone"], "+2348012345678")
            self.assertIsNotNone(db.scalar(select(AuditLog).where(AuditLog.action == "UPDATE_ORGANIZATION")))
            self.assertIsNotNone(db.get(OrganizationSettings, 1))

    def test_configured_notification_addresses_are_included(self):
        with Session(self.engine) as db:
            admin = User(full_name="Admin", email="admin@example.com", hashed_password="x", role="admin", is_active=True)
            db.add(admin); db.flush()
            db.add(OrganizationSettings(
                id=1, organization_name="Dumo", notification_emails=["alerts@example.com"],
                email_sender_name="Dumo", updated_by=admin.id,
            ))
            db.commit()
            self.assertEqual(
                {email for email, _ in admin_notification_recipients(db)},
                {"admin@example.com", "alerts@example.com"},
            )

    def test_rejects_unapproved_logo_format(self):
        with self.assertRaises(ValidationError):
            OrganizationSettingsPayload(
                organization_name="Dumo", email_sender_name="Dumo",
                logo_data_url="data:text/plain;base64,SGVsbG8=",
            )


if __name__ == "__main__":
    unittest.main()
