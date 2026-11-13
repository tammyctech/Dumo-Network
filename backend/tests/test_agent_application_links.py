import unittest
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from fastapi import HTTPException
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import AgentApplication, AgentApplicationLink, AgentAssignment, PollingUnit, User
from app.routes.agent_applications import (
    ApplicationCreate, LinkCreate, _notify_admins_of_application, create_link,
    public_polling_units, submit_application,
)
from app.routes.auth import login


class AgentApplicationLinkTests(unittest.TestCase):
    def test_admin_can_generate_global_application_link(self):
        engine = create_engine(
            "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
        )
        event.listen(engine, "connect", lambda connection, _: connection.execute("PRAGMA foreign_keys=ON"))
        Base.metadata.create_all(engine)
        with Session(engine) as db:
            admin = User(
                full_name="Admin",
                email="admin@example.com",
                hashed_password="unused",
                role="admin",
                is_active=True,
            )
            db.add(admin)
            db.commit()
            db.refresh(admin)
            result = create_link(LinkCreate(expires_in_days=30), db, admin)
            self.assertEqual(result["application_count"], 0)
            self.assertIn("/apply/agent/", result["url"])
            self.assertTrue(result["is_active"])
        engine.dispose()

    @patch("app.routes.agent_applications._active_link")
    def test_taken_polling_unit_is_marked_and_rejected(self, _active_link):
        engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(engine)
        with Session(engine) as db:
            agent = User(full_name="Existing Agent", email="agent@example.com", phone_number="+2348099999999", hashed_password="unused", role="agent", is_active=True)
            unit = PollingUnit(code="32/01/01/003", name="Unit 003", state="Rivers", lga="Abua/Odual", ward="Ward 1")
            db.add_all([agent, unit]); db.flush()
            db.add(AgentAssignment(election_id=None, polling_unit_id=unit.id, agent_id=agent.id)); db.commit()

            units = public_polling_units("token", "Abua/Odual", db)
            self.assertTrue(units[0]["taken"])
            with self.assertRaises(HTTPException) as raised:
                submit_application("token", ApplicationCreate(full_name="New Agent", phone_number="08012345678", email="new@example.com", polling_unit_id=unit.id), db)
            self.assertEqual(raised.exception.status_code, 409)
            self.assertIn("already been taken", raised.exception.detail)
        engine.dispose()

    @patch("app.routes.agent_applications.send_bulk_system_email")
    def test_application_email_contains_applicant_and_location(self, send_email):
        send_email.return_value = (1, 0, None)
        db = MagicMock()
        db.scalars.return_value.all.return_value = [SimpleNamespace(email="admin@example.com", full_name="Admin")]
        item = SimpleNamespace(id=12, full_name="Ada Applicant", phone_number="+2348012345678", email="ada@example.com")
        unit = SimpleNamespace(lga="Okrika", ward="Ward 9", code="32/21/09/003", name="Town Hall")
        _notify_admins_of_application(db, item, unit)
        arguments = send_email.call_args.kwargs
        self.assertIn("Ada Applicant", arguments["body"])
        self.assertIn("Okrika", arguments["body"])
        self.assertIn("Ward 9", arguments["body"])
        self.assertIn("32/21/09/003", arguments["body"])

    def test_pending_applicant_receives_approval_message_when_logging_in(self):
        engine = create_engine(
            "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
        )
        Base.metadata.create_all(engine)
        with Session(engine) as db:
            admin = User(full_name="Admin", email="admin@example.com", hashed_password="unused", role="admin", is_active=True)
            unit = PollingUnit(code="32/01/01/002", name="Unit 002", state="Rivers", lga="Abua/Odual", ward="Ward 1")
            db.add_all([admin, unit]); db.flush()
            link = AgentApplicationLink(token="login-pending-test", created_by=admin.id, expires_at=datetime.now(timezone.utc) + timedelta(days=1))
            db.add(link); db.flush()
            db.add(AgentApplication(link_id=link.id, polling_unit_id=unit.id, full_name="Pending Agent", phone_number="+2348012345678", email="pending@example.com"))
            db.commit()

            for identifier in ("08012345678", "pending@example.com"):
                with self.assertRaises(HTTPException) as raised:
                    login(SimpleNamespace(username=identifier, password="12345"), db)
                self.assertEqual(raised.exception.status_code, 403)
                self.assertEqual(raised.exception.detail, "Your agent account has not been approved by the admin yet.")
        engine.dispose()


if __name__ == "__main__":
    unittest.main()
