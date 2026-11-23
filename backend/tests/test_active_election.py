import unittest
from datetime import datetime, timedelta, timezone

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import AuditLog, Election, PollingUnit, User
from app.routes.dashboard_statistics import dashboard_statistics
from app.routes.election_admin import activate_election
from app.routes.public_results import public_election_overview


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


if __name__ == "__main__":
    unittest.main()
