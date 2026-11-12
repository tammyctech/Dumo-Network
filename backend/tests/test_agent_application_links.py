import unittest
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from fastapi import HTTPException
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import AgentApplication, AgentApplicationLink, PollingUnit, User
from app.routes.agent_applications import LinkCreate, create_link
from app.routes.auth import register
from app.routes.auth import login
from app.schemas import UserCreate


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

    def test_pending_applicant_cannot_create_observer_account(self):
        engine = create_engine(
            "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
        )
        Base.metadata.create_all(engine)
        with Session(engine) as db:
            admin = User(
                full_name="Admin",
                email="admin@example.com",
                hashed_password="unused",
                role="admin",
                is_active=True,
            )
            unit = PollingUnit(
                code="32/01/01/001",
                name="Unit 001",
                state="Rivers",
                lga="Abua/Odual",
                ward="Ward 1",
            )
            db.add_all([admin, unit])
            db.flush()
            link = AgentApplicationLink(
                token="pending-test",
                created_by=admin.id,
                expires_at=datetime.now(timezone.utc) + timedelta(days=1),
            )
            db.add(link)
            db.flush()
            db.add(AgentApplication(
                link_id=link.id,
                polling_unit_id=unit.id,
                full_name="Pending Agent",
                phone_number="+2348012345678",
                email="pending@example.com",
            ))
            db.commit()

            with self.assertRaises(HTTPException) as raised:
                register(UserCreate(
                    full_name="Pending Agent",
                    email="pending@example.com",
                    password="secure-password",
                ), db)
            self.assertEqual(raised.exception.status_code, 409)
            self.assertIn("pending agent application", raised.exception.detail)
        engine.dispose()

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
