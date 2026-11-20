import unittest
from types import SimpleNamespace
from unittest.mock import patch

from app.routes.user_management import notify_administrator_created


class AdministratorCreationNotificationTests(unittest.TestCase):
    @patch("app.routes.user_management.send_system_email")
    def test_notification_identifies_new_and_creating_administrators(self, send_email):
        send_email.return_value = (True, None)
        new_admin = SimpleNamespace(
            id=42,
            full_name="New Administrator",
            email="new.admin@example.com",
            phone_number="+2348012345678",
        )
        creator = SimpleNamespace(
            id=7,
            full_name="Existing Administrator",
            email="creator@example.com",
        )

        sent, error = notify_administrator_created(new_admin, creator)

        self.assertTrue(sent)
        self.assertIsNone(error)
        message = send_email.call_args.kwargs
        self.assertEqual(message["recipient"], "dumoyouthnetwork@gmail.com")
        self.assertIn("New Administrator", message["plain_text"])
        self.assertIn("Existing Administrator", message["plain_text"])
        self.assertNotIn("temporary password:", message["plain_text"].lower())


if __name__ == "__main__":
    unittest.main()
