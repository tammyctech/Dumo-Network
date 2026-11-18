import os
import unittest

os.environ.setdefault("DATABASE_URL", "sqlite://")

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.database import Base
from app.models import AgentAssignment, PollingUnit, User
from app.services.agent_integrity import validate_assignment
from app.utils.phone import normalize_nigerian_phone


class PhoneValidationTests(unittest.TestCase):
    def test_equivalent_formats_normalize_to_e164(self):
        expected = "+2348012345678"
        for value in ("08012345678", "+2348012345678", "2348012345678", "080 1234 5678"):
            self.assertEqual(normalize_nigerian_phone(value), expected)

    def test_invalid_numbers_are_rejected_without_truncation(self):
        for value in ("081028767516751", "0801234567", "080123456789", "080ABC45678", ""):
            with self.subTest(value=value), self.assertRaises(ValueError):
                normalize_nigerian_phone(value)


class AssignmentCapacityTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)

    def tearDown(self):
        self.db.close(); self.engine.dispose()

    def agent(self, index: int) -> User:
        item = User(full_name=f"Agent {index}", email=f"agent{index}@example.com",
            phone_number=f"+2348012345{index:03d}", hashed_password="unused", role="agent", is_active=True)
        self.db.add(item); self.db.flush(); return item

    def unit(self, lga: str, code: str) -> PollingUnit:
        item = PollingUnit(code=code, name="Unit", state="Rivers", lga=lga, ward="Ward")
        self.db.add(item); self.db.flush(); return item

    def test_standard_unit_rejects_second_active_agent(self):
        unit = self.unit("Eleme", "32/09/01/001")
        first, second = self.agent(1), self.agent(2)
        self.db.add(AgentAssignment(polling_unit_id=unit.id, agent_id=first.id)); self.db.commit()
        with self.assertRaises(HTTPException) as raised:
            validate_assignment(self.db, agent=second, unit=unit)
        self.assertEqual(raised.exception.status_code, 409)

    def test_tai_allows_two_and_rejects_third(self):
        unit = self.unit("Tai", "32/20/01/001")
        first, second, third = self.agent(1), self.agent(2), self.agent(3)
        self.db.add(AgentAssignment(polling_unit_id=unit.id, agent_id=first.id)); self.db.commit()
        validate_assignment(self.db, agent=second, unit=unit)
        self.db.add(AgentAssignment(polling_unit_id=unit.id, agent_id=second.id)); self.db.commit()
        with self.assertRaises(HTTPException):
            validate_assignment(self.db, agent=third, unit=unit)

    def test_agent_cannot_receive_second_assignment(self):
        first = self.unit("Tai", "32/20/01/001"); second = self.unit("Tai", "32/20/01/002")
        agent = self.agent(1)
        self.db.add(AgentAssignment(polling_unit_id=first.id, agent_id=agent.id)); self.db.commit()
        with self.assertRaises(HTTPException) as raised:
            validate_assignment(self.db, agent=agent, unit=second)
        self.assertIn("already has", raised.exception.detail)

    def test_reassignment_cannot_cross_registered_lga(self):
        unit = self.unit("Eleme", "32/09/01/001"); agent = self.agent(1)
        with self.assertRaises(HTTPException) as raised:
            validate_assignment(self.db, agent=agent, unit=unit, registered_lga="Tai")
        self.assertIn("registered LGA", raised.exception.detail)


if __name__ == "__main__":
    unittest.main()
