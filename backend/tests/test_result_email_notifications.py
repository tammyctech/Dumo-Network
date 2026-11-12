import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from app.routes.results import _notify_admins_of_result


class ResultEmailNotificationTests(unittest.TestCase):
    @patch("app.routes.results.send_bulk_system_email")
    def test_admin_email_contains_agent_and_polling_unit_details(self, send_email):
        send_email.return_value = (1, 0, None)
        db = MagicMock()
        db.scalars.return_value.all.return_value = [
            SimpleNamespace(email="admin@example.com", full_name="System Admin")
        ]
        _notify_admins_of_result(
            db,
            agent=SimpleNamespace(full_name="Ada Agent", phone_number="+2348012345678"),
            election=SimpleNamespace(name="Governorship Election"),
            polling_unit=SimpleNamespace(lga="Okrika", ward="Ward 9", code="32/21/09/003", name="Town Hall"),
            submission=SimpleNamespace(id=42, accredited_voters=500, valid_votes=450, rejected_votes=10),
            party_results=[SimpleNamespace(party="abc", votes=250), SimpleNamespace(party="xyz", votes=200)],
        )

        arguments = send_email.call_args.kwargs
        self.assertEqual(arguments["recipients"], [("admin@example.com", "System Admin")])
        self.assertIn("Ada Agent", arguments["body"])
        self.assertIn("Okrika", arguments["body"])
        self.assertIn("Ward 9", arguments["body"])
        self.assertIn("32/21/09/003", arguments["body"])
        self.assertIn("ABC: 250 votes", arguments["body"])

    @patch("app.routes.results.send_bulk_system_email", side_effect=RuntimeError("SMTP unavailable"))
    def test_email_failure_does_not_escape(self, _send_email):
        db = MagicMock()
        db.scalars.return_value.all.return_value = [SimpleNamespace(email="admin@example.com", full_name="Admin")]
        _notify_admins_of_result(
            db,
            agent=SimpleNamespace(full_name="Agent", phone_number=None),
            election=SimpleNamespace(name="Election"),
            polling_unit=SimpleNamespace(lga="LGA", ward="Ward", code="001", name="Unit"),
            submission=SimpleNamespace(id=1, accredited_voters=1, valid_votes=1, rejected_votes=0),
            party_results=[SimpleNamespace(party="abc", votes=1)],
        )


if __name__ == "__main__":
    unittest.main()
