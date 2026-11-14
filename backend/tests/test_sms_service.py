import os
import unittest
from unittest.mock import Mock, patch

from app.services.sms_service import send_sms


class SmsServiceTests(unittest.TestCase):
    def setUp(self):
        self.environment = patch.dict(os.environ, {
            "TERMII_BASE_URL": "https://example.termii.com",
            "TERMII_API_KEY": "secret-key",
            "TERMII_SENDER_ID": "Dumo",
            "TERMII_CHANNEL": "dnd",
        }, clear=False)
        self.environment.start()

    def tearDown(self):
        self.environment.stop()

    @patch("app.services.sms_service.requests.post")
    def test_sends_normalized_number_to_termii(self, post):
        post.return_value = Mock(ok=True, status_code=200)
        post.return_value.json.return_value = {"code": "ok", "message": "Successfully Sent"}
        sent, error = send_sms(recipient="0801 234 5678", message="Account approved")
        self.assertTrue(sent)
        self.assertIsNone(error)
        self.assertEqual(post.call_args.args[0], "https://example.termii.com/api/sms/send")
        payload = post.call_args.kwargs["json"]
        self.assertEqual(payload["to"], "2348012345678")
        self.assertEqual(payload["channel"], "dnd")
        self.assertEqual(payload["type"], "plain")

    def test_missing_configuration_returns_safe_error(self):
        with patch.dict(os.environ, {"TERMII_API_KEY": ""}, clear=False):
            sent, error = send_sms(recipient="08012345678", message="Hello")
        self.assertFalse(sent)
        self.assertIn("not configured", error or "")


if __name__ == "__main__":
    unittest.main()
