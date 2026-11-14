import os
import unittest
from unittest.mock import MagicMock, patch

from app.services.email_service import _delivery_error, send_agent_approval_email, send_system_email


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

    @patch("app.services.email_service.requests.post")
    def test_gmail_api_refreshes_token_and_sends_raw_mime_message(self, post):
        token_response = MagicMock(); token_response.ok = True; token_response.json.return_value = {"access_token": "access-token"}
        send_response = MagicMock(); send_response.ok = True
        post.side_effect = [token_response, send_response]
        with patch.dict(os.environ, {
            "EMAIL_PROVIDER": "gmail_api", "GMAIL_CLIENT_ID": "client-id",
            "GMAIL_CLIENT_SECRET": "client-secret", "GMAIL_REFRESH_TOKEN": "refresh-token",
            "GMAIL_SENDER_EMAIL": "dumo.network@gmail.com",
        }, clear=True):
            sent, error = send_system_email(recipient="agent@example.com", subject="Assignment",
                plain_text="Assigned", html="<p>Assigned</p>")
        self.assertTrue(sent); self.assertIsNone(error)
        self.assertEqual(post.call_args_list[0].args[0], "https://oauth2.googleapis.com/token")
        self.assertEqual(post.call_args_list[1].args[0], "https://gmail.googleapis.com/gmail/v1/users/me/messages/send")
        self.assertIn("raw", post.call_args_list[1].kwargs["json"])

    @patch("app.services.email_service.requests.post")
    def test_gmail_api_reports_google_oauth_error_description(self, post):
        response = MagicMock(); response.ok = False; response.status_code = 400
        response.json.return_value = {"error": "invalid_grant", "error_description": "Token has been expired or revoked."}
        post.return_value = response
        with patch.dict(os.environ, {
            "EMAIL_PROVIDER": "gmail_api", "GMAIL_CLIENT_ID": "client-id",
            "GMAIL_CLIENT_SECRET": "client-secret", "GMAIL_REFRESH_TOKEN": "refresh-token",
            "GMAIL_SENDER_EMAIL": "dumo.network@gmail.com",
        }, clear=True):
            sent, error = send_system_email(recipient="agent@example.com", subject="Assignment",
                plain_text="Assigned", html="<p>Assigned</p>")
        self.assertFalse(sent)
        self.assertIn("invalid_grant", error)
        self.assertIn("expired or revoked", error)


if __name__ == "__main__":
    unittest.main()
