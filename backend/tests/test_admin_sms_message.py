import unittest

from app.models import PollingUnit
from app.routes.admin_sms import _assignment_login_message


class AdminSmsMessageTests(unittest.TestCase):
    def setUp(self):
        self.unit = PollingUnit(
            code="32-01-08-012",
            name="Community Primary School Town Hall",
            ward="WARD 12 - ORO-ESARA",
            lga="Port Harcourt",
            state="Rivers",
        )

    def test_temporary_password_message_fits_one_segment(self):
        message = _assignment_login_message(
            phone="+2348012345678",
            polling_unit=self.unit,
            login_url="https://dumo-network.vercel.app/login",
            must_change_password=True,
            default_password="12345",
        )
        self.assertLessEqual(len(message), 160)
        self.assertIn("Temp password 12345", message)
        self.assertNotIn(self.unit.name, message)

    def test_existing_password_message_has_no_temporary_password(self):
        message = _assignment_login_message(
            phone="+2348012345678",
            polling_unit=self.unit,
            login_url="https://dumo-network.vercel.app/login",
            must_change_password=False,
            default_password="12345",
        )
        self.assertLessEqual(len(message), 160)
        self.assertIn("Use your current password", message)
        self.assertNotIn("Temp password", message)


if __name__ == "__main__":
    unittest.main()
