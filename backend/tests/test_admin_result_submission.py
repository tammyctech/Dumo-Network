import unittest
from datetime import datetime, timezone
from unittest.mock import patch

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import AgentAssignment, Election, PollingUnit, ResultSubmission, User
from app.monitoring.result_schemas import PartyVoteInput, ResultSubmissionInput
from app.routes.results import submit_election_result
from app.routes.agent_assignments import get_my_assignments
from app.routes.election_admin import activate_election
from app.political_parties import REGISTERED_POLITICAL_PARTIES


class AdminResultSubmissionTests(unittest.TestCase):
    @patch("app.routes.results._notify_admins_of_result")
    def test_agent_must_submit_for_the_current_active_election(self, notify):
        engine = create_engine("sqlite://")
        self.addCleanup(engine.dispose)
        Base.metadata.create_all(engine)
        with Session(engine) as db:
            admin = User(full_name="Admin", email="admin@example.com", hashed_password="unused", role="admin", is_active=True)
            agent = User(full_name="Agent", email="agent@example.com", hashed_password="unused", role="agent", is_active=True)
            first = Election(name="First election", election_date=datetime.now(timezone.utc), state="Rivers")
            second = Election(name="Second election", election_date=datetime.now(timezone.utc), state="Rivers")
            unit = PollingUnit(code="32/01/01/001", name="Unit 1", state="Rivers", lga="Abua/Odual", ward="Ward 1")
            db.add_all([admin, agent, first, second, unit])
            db.flush()
            db.add(AgentAssignment(agent_id=agent.id, polling_unit_id=unit.id))
            db.commit()

            def payload(election_id):
                return ResultSubmissionInput(
                    election_id=election_id,
                    polling_unit_id=unit.id,
                    accredited_voters=100,
                    valid_votes=100,
                    rejected_votes=0,
                    party_results=[
                        PartyVoteInput(party=acronym, votes=100 if index == 0 else 0)
                        for index, (acronym, _) in enumerate(REGISTERED_POLITICAL_PARTIES)
                    ],
                )

            self.assertIsNone(get_my_assignments(db, agent)["active_election"])
            with self.assertRaises(HTTPException) as no_active:
                submit_election_result(payload(first.id), db, agent)
            self.assertEqual(no_active.exception.status_code, 409)

            activate_election(first.id, db, admin)
            assignments = get_my_assignments(db, agent)
            self.assertEqual(assignments["active_election"]["id"], first.id)
            self.assertEqual(len(assignments["assignments"]), 2)

            activate_election(second.id, db, admin)
            self.assertEqual(get_my_assignments(db, agent)["active_election"]["id"], second.id)
            with self.assertRaises(HTTPException) as stale:
                submit_election_result(payload(first.id), db, agent)
            self.assertEqual(stale.exception.status_code, 409)

            result = submit_election_result(payload(second.id), db, agent)
            self.assertEqual(result.election_id, second.id)
            notify.assert_called_once()

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
                    party_results=[
                        PartyVoteInput(party=acronym, votes=100 if index == 0 else 0)
                        for index, (acronym, _) in enumerate(REGISTERED_POLITICAL_PARTIES)
                    ],
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
