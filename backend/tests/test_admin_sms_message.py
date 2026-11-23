import unittest

from app.models import PollingUnit
from app.routes.admin_sms import _assignment_login_message, _valid_phone


class AdminSmsMessageTests(unittest.TestCase):
    def setUp(self):
        self.unit = PollingUnit(
            code="32-01-08-012",
            name="Community Primary School Town Hall",
            ward="WARD 12 - ORO-ESARA",
            lga="Port Harcourt",
            state="Rivers",
        )

    def test_temporary_password_message_uses_original_template(self):
        message = _assignment_login_message(
            full_name="Tamunotonye Emmanuel",
            phone="+2348012345678",
            polling_unit=self.unit,
            login_url="https://dumo-network.vercel.app/login",
            must_change_password=True,
            default_password="12345",
        )
        self.assertTrue(message.startswith("Hello Tamunotonye."))
        self.assertNotIn("Tamunotonye Emmanuel", message)
        self.assertIn("Your Dumo Youth Network polling unit", message)
        self.assertIn(self.unit.name, message)
        self.assertIn("Temporary password: 12345", message)

    def test_recipient_phone_is_normalized_for_loading(self):
        self.assertEqual(_valid_phone("0801 234 5678"), "+2348012345678")
        self.assertIsNone(_valid_phone("not-a-number"))

    def test_existing_password_message_has_no_temporary_password(self):
        message = _assignment_login_message(
            full_name="Ada Okon",
            phone="+2348012345678",
            polling_unit=self.unit,
            login_url="https://dumo-network.vercel.app/login",
            must_change_password=False,
            default_password="12345",
        )
        self.assertTrue(message.startswith("Hello Ada."))
        self.assertNotIn("Ada Okon", message)
        self.assertIn("Use your existing password", message)
        self.assertNotIn("Temporary password", message)


if __name__ == "__main__":
    unittest.main()
