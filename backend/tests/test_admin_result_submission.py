import unittest
from datetime import datetime, timezone
from unittest.mock import patch

from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import Election, PollingUnit, ResultSubmission, User
from app.monitoring.result_schemas import PartyVoteInput, ResultSubmissionInput
from app.routes.results import submit_election_result


class AdminResultSubmissionTests(unittest.TestCase):
    @patch("app.routes.results._notify_admins_of_result")
    def test_admin_can_submit_for_an_unassigned_polling_unit(self, notify):
        engine = create_engine(
            "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
        )
        Base.metadata.create_all(engine)
        with Session(engine) as db:
            admin = User(
                full_name="Admin", email="admin@example.com",
                hashed_password="unused", role="admin", is_active=True,
            )
            election = Election(
                name="State Election", election_date=datetime.now(timezone.utc), state="Rivers",
            )
            unit = PollingUnit(
                code="32/01/01/001", name="Unit 1", state="Rivers",
                lga="Abua/Odual", ward="Ward 1",
            )
            db.add_all([admin, election, unit])
            db.commit()

            result = submit_election_result(
                ResultSubmissionInput(
                    election_id=election.id,
                    polling_unit_id=unit.id,
                    accredited_voters=110,
                    valid_votes=100,
                    rejected_votes=10,
                    party_results=[PartyVoteInput(party="ABC", votes=100)],
                ),
                db,
                admin,
            )

            submission = db.get(ResultSubmission, result.submission_id)
            self.assertEqual(submission.agent_id, admin.id)
            self.assertEqual(submission.polling_unit_id, unit.id)
            notify.assert_called_once()
        engine.dispose()


if __name__ == "__main__":
    unittest.main()
