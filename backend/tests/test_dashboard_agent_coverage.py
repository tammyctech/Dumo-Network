import unittest

from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import AgentAssignment, PollingUnit, User
from app.routes.dashboard_statistics import dashboard_statistics


class DashboardAgentCoverageTests(unittest.TestCase):
    def test_agent_coverage_is_available_without_an_election(self):
        engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(engine)
        with Session(engine) as db:
            admin = User(
                full_name="Admin",
                email="admin@example.com",
                hashed_password="unused",
                role="admin",
                is_active=True,
            )
            agent = User(
                full_name="Agent",
                email="agent@example.com",
                phone_number="+2348012345678",
                hashed_password="unused",
                role="agent",
                is_active=True,
            )
            filled = PollingUnit(
                code="32/01/01/001", name="Unit 1", state="Rivers",
                lga="Abua/Odual", ward="Ward 1",
            )
            vacant = PollingUnit(
                code="32/01/01/002", name="Unit 2", state="Rivers",
                lga="Abua/Odual", ward="Ward 1",
            )
            db.add_all([admin, agent, filled, vacant])
            db.flush()
            db.add(AgentAssignment(
                election_id=None,
                polling_unit_id=filled.id,
                agent_id=agent.id,
            ))
            db.commit()

            result = dashboard_statistics(None, db, admin)

            self.assertEqual(result["total_polling_units"], 2)
            self.assertEqual(result["assigned_polling_units"], 1)
            self.assertEqual(result["unassigned_polling_units"], 1)
            self.assertEqual(result["assignment_coverage_percent"], 50.0)
        engine.dispose()


if __name__ == "__main__":
    unittest.main()
