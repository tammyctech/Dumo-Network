import unittest
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import AgentAssignment, PollingUnit, User
from app.routes.auth import RefreshTokenRequest, ResetPasswordRequest, _send_first_login_welcome_email, change_password, login, refresh_session, reset_password, router
from app.schemas import ChangePasswordRequest
from app.security import create_password_reset_token, create_refresh_token, hash_password, verify_password


class PasswordWorkflowTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(self.engine)

    def tearDown(self):
        self.engine.dispose()

    def test_reset_link_is_invalid_after_successful_use(self):
        with Session(self.engine) as db:
            user = User(full_name="Agent", email="agent@example.com", hashed_password=hash_password("old-password"), role="agent", is_active=True)
            db.add(user); db.commit(); db.refresh(user)
            token = create_password_reset_token(user.id, user.session_version)
            payload = ResetPasswordRequest(token=token, new_password="new-password", confirm_password="new-password")
            reset_password(payload, db)
            self.assertTrue(verify_password("new-password", user.hashed_password))
            with self.assertRaises(HTTPException) as raised:
                reset_password(payload, db)
            self.assertEqual(raised.exception.status_code, 400)

    def test_public_registration_route_is_removed(self):
        self.assertNotIn("/api/auth/register", {route.path for route in router.routes})

    def test_refresh_token_restores_session_and_respects_session_version(self):
        with Session(self.engine) as db:
            user = User(full_name="Agent", email="agent@example.com", hashed_password=hash_password("private-password"), role="agent", is_active=True)
            db.add(user); db.commit(); db.refresh(user)
            token = create_refresh_token(user.id, user.session_version)
            renewed = refresh_session(RefreshTokenRequest(refresh_token=token), db)
            self.assertIn("access_token", renewed)
            self.assertIn("refresh_token", renewed)
            user.session_version += 1; db.commit()
            with self.assertRaises(HTTPException) as raised:
                refresh_session(RefreshTokenRequest(refresh_token=token), db)
            self.assertEqual(raised.exception.status_code, 401)

    def test_legacy_account_role_cannot_sign_in(self):
        with Session(self.engine) as db:
            user = User(full_name="Legacy User", email="legacy@example.com", hashed_password=hash_password("private-password"), role="legacy", is_active=True)
            db.add(user); db.commit()
            with self.assertRaises(HTTPException) as raised:
                login(SimpleNamespace(username="legacy@example.com", password="private-password"), db)
            self.assertEqual(raised.exception.status_code, 403)

    def test_first_login_requires_and_saves_real_email(self):
        with Session(self.engine) as db:
            user = User(full_name="Agent", email="agent@dumo-network.vercel.app", hashed_password=hash_password("12345"), role="agent", is_active=True, must_change_password=True)
            db.add(user); db.commit(); db.refresh(user)
            with self.assertRaises(HTTPException) as raised:
                change_password(ChangePasswordRequest(current_password="12345", new_password="private-password", confirm_password="private-password"), user, db)
            self.assertEqual(raised.exception.status_code, 422)
            change_password(ChangePasswordRequest(current_password="12345", new_password="private-password", confirm_password="private-password", email="agent@example.com"), user, db)
            self.assertEqual(user.email, "agent@example.com")
            self.assertFalse(user.must_change_password)

    @patch("app.routes.auth.send_system_email", return_value=(True, None))
    def test_welcome_email_contains_permanent_assignment(self, send_email):
        with Session(self.engine) as db:
            user = User(full_name="Ada Agent", email="ada@example.com", hashed_password=hash_password("private-password"), role="agent", is_active=True)
            unit = PollingUnit(code="32/21/09/003", name="Town Hall", state="Rivers", lga="Okrika", ward="Ward 9")
            db.add_all([user, unit]); db.flush()
            db.add(AgentAssignment(election_id=None, polling_unit_id=unit.id, agent_id=user.id))
            db.commit()

            _send_first_login_welcome_email(db, user)

            arguments = send_email.call_args.kwargs
            self.assertEqual(arguments["recipient"], "ada@example.com")
            self.assertIn("Okrika", arguments["plain_text"])
            self.assertIn("Ward 9", arguments["plain_text"])
            self.assertIn("32/21/09/003", arguments["plain_text"])
            self.assertIn("all current and future elections", arguments["plain_text"])


if __name__ == "__main__":
    unittest.main()
