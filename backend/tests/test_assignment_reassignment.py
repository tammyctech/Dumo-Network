import unittest
from unittest.mock import patch

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import AgentAssignment, PollingUnit, User
from app.routes.assignment_management import ReassignRequest, _send_reassignment_email, reassign_agent


class AssignmentReassignmentTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(self.engine)

    def tearDown(self):
        self.engine.dispose()

    @patch("app.routes.assignment_management._send_reassignment_email", return_value=(True, None))
    def test_admin_can_reassign_agent_to_available_unit(self, send_email):
        with Session(self.engine) as db:
            admin = User(full_name="Admin", email="admin@example.com", hashed_password="unused", role="admin", is_active=True)
            agent = User(full_name="Agent", email="agent@example.com", hashed_password="unused", role="agent", is_active=True)
            old = PollingUnit(code="32/01/01/001", name="Old Unit", state="Rivers", lga="Abua/Odual", ward="Ward 1")
            new = PollingUnit(code="32/01/01/002", name="New Unit", state="Rivers", lga="Abua/Odual", ward="Ward 1")
            db.add_all([admin, agent, old, new]); db.flush()
            assignment = AgentAssignment(election_id=None, polling_unit_id=old.id, agent_id=agent.id)
            db.add(assignment); db.commit(); assignment_id=assignment.id; new_id=new.id

            result = reassign_agent(assignment_id, ReassignRequest(polling_unit_id=new_id), db, admin)
            self.assertEqual(result["polling_unit_id"], new_id)
            self.assertTrue(result["email_sent"])
            self.assertEqual(db.get(AgentAssignment, assignment_id).polling_unit_id, new_id)
            self.assertEqual(send_email.call_args.args[1].name, "Old Unit")
            self.assertEqual(send_email.call_args.args[2].name, "New Unit")

    @patch("app.routes.assignment_management.send_system_email", return_value=(True, None))
    def test_reassignment_email_shows_old_and_new_units(self, send_email):
        agent = User(id=8, full_name="Ada Agent", email="ada@example.com", hashed_password="unused", role="agent", is_active=True)
        old = PollingUnit(code="32/01/01/001", name="Old Unit", state="Rivers", lga="Abua/Odual", ward="Ward 1")
        new = PollingUnit(code="32/02/03/004", name="New Unit", state="Rivers", lga="Ahoada East", ward="Ward 3")
        sent, error = _send_reassignment_email(agent, old, new)
        self.assertTrue(sent)
        self.assertIsNone(error)
        content = send_email.call_args.kwargs["plain_text"]
        self.assertIn("Previous assignment", content)
        self.assertIn("32/01/01/001 - Old Unit", content)
        self.assertIn("New assignment", content)
        self.assertIn("32/02/03/004 - New Unit", content)
        self.assertIn("Ahoada East", content)

    def test_reassignment_rejects_occupied_unit(self):
        with Session(self.engine) as db:
            admin = User(full_name="Admin", email="admin@example.com", hashed_password="unused", role="admin", is_active=True)
            first = User(full_name="First", email="first@example.com", hashed_password="unused", role="agent", is_active=True)
            second = User(full_name="Second", email="second@example.com", hashed_password="unused", role="agent", is_active=True)
            old = PollingUnit(code="32/01/01/001", name="Old Unit", state="Rivers", lga="Abua/Odual", ward="Ward 1")
            occupied = PollingUnit(code="32/01/01/002", name="Occupied Unit", state="Rivers", lga="Abua/Odual", ward="Ward 1")
            db.add_all([admin, first, second, old, occupied]); db.flush()
            moving = AgentAssignment(election_id=None, polling_unit_id=old.id, agent_id=first.id)
            db.add_all([moving, AgentAssignment(election_id=None, polling_unit_id=occupied.id, agent_id=second.id)]); db.commit()

            with self.assertRaises(HTTPException) as raised:
                reassign_agent(moving.id, ReassignRequest(polling_unit_id=occupied.id), db, admin)
            self.assertEqual(raised.exception.status_code, 409)


if __name__ == "__main__":
    unittest.main()
