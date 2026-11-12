import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from app.routes.operations import _notify_admins_of_incident


class IncidentEmailNotificationTests(unittest.TestCase):
    @patch("app.routes.operations.send_bulk_system_email")
    def test_admin_email_contains_reporter_location_and_incident(self, send_email):
        send_email.return_value = (1, 0, None)
        db = MagicMock()
        db.scalars.return_value.all.return_value = [SimpleNamespace(email="admin@example.com", full_name="Admin")]

        _notify_admins_of_incident(
            db,
            reporter=SimpleNamespace(full_name="Ada Agent", phone_number="+2348012345678"),
            election=SimpleNamespace(name="Governorship Election"),
            unit=SimpleNamespace(lga="Okrika", ward="Ward 9", code="32/21/09/003", name="Town Hall"),
            incident=SimpleNamespace(id=7, category="Violence", severity="critical", status="open", description="Security personnel needed."),
        )

        arguments = send_email.call_args.kwargs
        self.assertEqual(arguments["recipients"], [("admin@example.com", "Admin")])
        self.assertIn("Ada Agent", arguments["body"])
        self.assertIn("Okrika", arguments["body"])
        self.assertIn("Ward 9", arguments["body"])
        self.assertIn("32/21/09/003", arguments["body"])
        self.assertIn("Security personnel needed", arguments["body"])
        self.assertIn("CRITICAL", arguments["subject"])

    @patch("app.routes.operations.send_bulk_system_email", side_effect=RuntimeError("SMTP unavailable"))
    def test_email_failure_does_not_escape(self, _send_email):
        db = MagicMock()
        db.scalars.return_value.all.return_value = [SimpleNamespace(email="admin@example.com", full_name="Admin")]
        _notify_admins_of_incident(
            db,
            reporter=SimpleNamespace(full_name="Agent", phone_number=None),
            election=SimpleNamespace(name="Election"),
            unit=None,
            incident=SimpleNamespace(id=1, category="Other", severity="low", status="open", description="Test incident."),
        )


if __name__ == "__main__":
    unittest.main()
