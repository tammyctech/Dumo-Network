import os
import unittest
from unittest.mock import Mock, patch

from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import SmsDelivery
from app.services.sms_service import process_delivery_report, send_sms
from app.routes.termii_webhooks import valid_termii_signature


class SmsServiceTests(unittest.TestCase):
    def setUp(self):
        self.environment = patch.dict(os.environ, {
            "TERMII_BASE_URL": "https://example.termii.com",
            "TERMII_API_KEY": "secret-key",
            "TERMII_SENDER_ID": "DYN",
            "TERMII_CHANNEL": "dnd",
        }, clear=False)
        self.environment.start()
        self.engine = create_engine(
            "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
        )
        Base.metadata.create_all(self.engine)
        self.sessions = sessionmaker(bind=self.engine)
        self.session_patch = patch("app.services.sms_service.SessionLocal", self.sessions)
        self.session_patch.start()

    def tearDown(self):
        self.session_patch.stop()
        self.engine.dispose()
        self.environment.stop()

    @patch("app.services.sms_service.requests.post")
    def test_promotional_submission_is_sent_not_delivered(self, post):
        post.return_value = Mock(ok=True, status_code=200)
        post.return_value.json.return_value = {
            "code": "ok", "message": "Successfully Sent", "message_id": "termii-123"
        }
        accepted, error = send_sms(recipient="0801 234 5678", message="Account approved")
        self.assertTrue(accepted)
        self.assertIsNone(error)
        self.assertEqual(post.call_args.args[0], "https://example.termii.com/api/sms/send")
        payload = post.call_args.kwargs["json"]
        self.assertEqual(payload["to"], "2348012345678")
        self.assertEqual(payload["from"], "DYN")
        self.assertEqual(payload["channel"], "generic")
        self.assertEqual(payload["type"], "plain")
        with self.sessions() as db:
            delivery = db.scalar(select(SmsDelivery))
            self.assertEqual(delivery.termii_message_id, "termii-123")
            self.assertEqual(delivery.status, "SENT")
            self.assertIsNone(delivery.delivered_at)

    @patch("app.services.sms_service.requests.post")
    def test_delivery_report_marks_accepted_message_delivered(self, post):
        post.return_value = Mock(ok=True, status_code=200)
        post.return_value.json.return_value = {
            "code": "ok", "message": "Successfully Sent", "message_id": "termii-delivered"
        }
        send_sms(recipient="08012345678", message="Welcome")
        self.assertTrue(process_delivery_report({
            "message_id": "termii-delivered", "status": "DELIVERED"
        }))
        with self.sessions() as db:
            delivery = db.scalar(select(SmsDelivery))
            self.assertEqual(delivery.status, "DELIVERED")
            self.assertIsNotNone(delivery.delivered_at)

    @patch("app.services.sms_service.requests.post")
    def test_rejected_submission_and_delivery_report_are_tracked(self, post):
        post.return_value = Mock(ok=False, status_code=400)
        post.return_value.json.return_value = {"code": "invalid_sender", "message": "Sender rejected"}
        accepted, error = send_sms(recipient="08012345678", message="Welcome")
        self.assertFalse(accepted)
        self.assertIn("rejected", error or "")
        with self.sessions() as db:
            delivery = db.scalar(select(SmsDelivery))
            self.assertEqual(delivery.status, "REJECTED")

        with self.sessions() as db:
            db.add(SmsDelivery(
                termii_message_id="termii-dnd", recipient="2348012345678", sender_id="DYN",
                channel="generic", message_type="promotional", status="SENT",
            ))
            db.commit()
        self.assertTrue(process_delivery_report({
            "message_id": "termii-dnd", "status": "DND Active on Phone Number"
        }))
        with self.sessions() as db:
            delivery = db.scalar(select(SmsDelivery).where(SmsDelivery.termii_message_id == "termii-dnd"))
            self.assertEqual(delivery.status, "REJECTED")

    def test_missing_configuration_returns_safe_error(self):
        with patch.dict(os.environ, {"TERMII_API_KEY": ""}, clear=False):
            accepted, error = send_sms(recipient="08012345678", message="Hello")
        self.assertFalse(accepted)
        self.assertIn("not configured", error or "")

    def test_webhook_signature_is_verified(self):
        import hashlib
        import hmac

        body = b'{"message_id":"termii-123","status":"DELIVERED"}'
        signature = hmac.new(b"secret-key", body, hashlib.sha512).hexdigest()
        self.assertTrue(valid_termii_signature(body, signature))
        self.assertFalse(valid_termii_signature(body, "bad-signature"))


if __name__ == "__main__":
    unittest.main()
