import os
import unittest
from unittest.mock import MagicMock, patch

from app.services.email_service import _delivery_error, send_agent_approval_email


class ApprovalEmailTests(unittest.TestCase):
    def test_connection_error_explains_render_free_smtp_block(self):
        message = _delivery_error(OSError("Network is unreachable"))
        self.assertIn("Render Free", message)
        self.assertIn("HTTPS API", message)

    def test_reports_missing_configuration(self):
        with patch.dict(os.environ, {}, clear=True):
            sent, error = send_agent_approval_email(
                recipient="agent@example.com",
                full_name="Ada Agent",
                phone_number="+2348012345678",
                temporary_password="12345",
                lga="Okrika",
                ward="Ward 9",
                polling_unit_code="32/21/09/003",
                polling_unit_name="Town Hall",
            )
        self.assertFalse(sent)
        self.assertIn("not configured", error)

    @patch("app.services.email_service.smtplib.SMTP")
    def test_sends_assignment_and_login_details(self, smtp_class):
        smtp = MagicMock()
        smtp_class.return_value.__enter__.return_value = smtp
        with patch.dict(os.environ, {
            "SMTP_HOST": "smtp.example.com",
            "SMTP_FROM_EMAIL": "no-reply@example.com",
            "SMTP_USERNAME": "smtp-user",
            "SMTP_PASSWORD": "smtp-password",
            "FRONTEND_URL": "https://dumo-network.vercel.app",
        }, clear=True):
            sent, error = send_agent_approval_email(
                recipient="agent@example.com",
                full_name="Ada Agent",
                phone_number="+2348012345678",
                temporary_password="12345",
                lga="Okrika",
                ward="Ward 9",
                polling_unit_code="32/21/09/003",
                polling_unit_name="Town Hall",
            )

        self.assertTrue(sent)
        self.assertIsNone(error)
        smtp.starttls.assert_called_once()
        smtp.login.assert_called_once_with("smtp-user", "smtp-password")
        message = smtp.send_message.call_args.args[0]
        self.assertEqual(message["To"], "agent@example.com")
        body = message.get_body(preferencelist=("plain",)).get_content()
        self.assertIn("Okrika", body)
        self.assertIn("Ward 9", body)
        self.assertIn("32/21/09/003", body)
        self.assertIn("12345", body)
        self.assertIn("https://dumo-network.vercel.app/login", body)


if __name__ == "__main__":
    unittest.main()
