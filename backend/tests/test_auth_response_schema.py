import unittest

from app.schemas import AgentResponse, UserResponse


class AuthResponseSchemaTests(unittest.TestCase):
    def test_imported_agent_placeholder_email_serializes(self):
        values = {
            "id": 1,
            "full_name": "Imported Agent",
            "email": "2347044627066@agents.dumo.invalid",
            "phone_number": "+2347044627066",
            "role": "agent",
            "is_active": True,
        }
        profile = UserResponse(**values, must_change_password=True)
        agent = AgentResponse(**values)
        self.assertEqual(profile.email, values["email"])
        self.assertEqual(agent.email, values["email"])


if __name__ == "__main__":
    unittest.main()
