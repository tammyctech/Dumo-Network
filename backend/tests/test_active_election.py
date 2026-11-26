import unittest
from datetime import datetime, timedelta, timezone

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import AuditLog, Election, PartyResult, PollingUnit, ResultSubmission, User
from app.routes.dashboard_statistics import dashboard_statistics
from app.routes.election_admin import activate_election
from app.routes.public_results import public_election_overview, public_polling_unit_results


class ActiveElectionTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)

    def tearDown(self):
        self.engine.dispose()

    def test_admin_selection_drives_dashboard_and_public_overview(self):
        with Session(self.engine) as db:
            admin = User(
                full_name="Admin",
                email="admin@example.com",
                hashed_password="unused",
                role="admin",
                is_active=True,
            )
            first = Election(
                name="Rivers Governorship Election",
                election_date=datetime.now(timezone.utc) + timedelta(days=30),
                state="Rivers",
                is_active=True,
            )
            selected = Election(
                name="Nigeria Presidential Election",
                election_date=datetime.now(timezone.utc) + timedelta(days=10),
                state="Rivers",
            )
            unit = PollingUnit(
                code="32/01/01/001",
                name="Unit 1",
                state="Rivers",
                lga="Abua/Odual",
                ward="Ward 1",
            )
            db.add_all([admin, first, selected, unit])
            db.commit()

            response = activate_election(selected.id, db, admin)

            self.assertEqual(response["election"]["id"], selected.id)
            self.assertFalse(db.get(Election, first.id).is_active)
            self.assertTrue(db.get(Election, selected.id).is_active)
            self.assertEqual(
                dashboard_statistics(None, db, admin)["election"]["id"],
                selected.id,
            )
            self.assertEqual(
                public_election_overview(None, db)["election"]["id"],
                selected.id,
            )
            audit = db.scalar(select(AuditLog).where(AuditLog.action == "activate_election"))
            self.assertEqual(audit.record_id, selected.id)

    def test_historical_election_reports_are_public_and_paginated(self):
        with Session(self.engine) as db:
            admin = User(full_name="Admin", email="admin@example.com", hashed_password="unused", role="admin")
            now = datetime.now(timezone.utc)
            historical = Election(name="Historical election", election_date=now, state="Rivers")
            active = Election(name="Current election", election_date=now, state="Rivers", is_active=True)
            units = [
                PollingUnit(code=f"unit-{index}", name=f"Unit {index}", state="Rivers", lga="Abua/Odual", ward="Ward 1")
                for index in range(26)
            ]
            db.add_all([admin, historical, active, *units])
            db.flush()
            reports = [
                ResultSubmission(election_id=historical.id, polling_unit_id=unit.id, agent_id=admin.id,
                                 accredited_voters=12, valid_votes=10, rejected_votes=2)
                for unit in units
            ]
            db.add_all(reports)
            db.flush()
            db.add_all([PartyResult(submission_id=report.id, party="APC", votes=10) for report in reports])
            db.commit()

            overview = public_election_overview(None, db)
            self.assertEqual(overview["election"]["id"], active.id)
            self.assertEqual(overview["submitted_polling_units"], 0)
            self.assertIn(historical.id, [item["id"] for item in overview["available_elections"]])

            historical_overview = public_election_overview(None, db, election_id=historical.id)
            self.assertEqual(historical_overview["submitted_polling_units"], 26)
            self.assertEqual(historical_overview["lga_results"][0]["leader"], {"party": "APC", "votes": 260})

            first_page = public_polling_unit_results(historical.id, "Abua/Odual", db, offset=0)
            self.assertEqual(len(first_page["reports"]), 25)
            self.assertNotIn("agent_id", first_page["reports"][0])
            self.assertEqual(first_page["reports"][0]["party_totals"], [{"party": "APC", "votes": 10}])
            self.assertEqual(first_page["next_offset"], 25)
            last_page = public_polling_unit_results(historical.id, "Abua/Odual", db, offset=25)
            self.assertEqual(len(last_page["reports"]), 1)
            self.assertIsNone(last_page["next_offset"])
            self.assertEqual(public_polling_unit_results(active.id, "Abua/Odual", db, offset=0)["reports"], [])


if __name__ == "__main__":
    unittest.main()
