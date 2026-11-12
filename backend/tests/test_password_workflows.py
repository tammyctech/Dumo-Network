import unittest

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import User
from app.routes.auth import ResetPasswordRequest, change_password, reset_password
from app.schemas import ChangePasswordRequest
from app.security import create_password_reset_token, hash_password, verify_password


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


if __name__ == "__main__":
    unittest.main()
