import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import (
    AuditLog, Election, Incident, PartyResult, PollingUnit, ResultEvidence,
    ResultFlag, ResultReview, ResultSubmission, User,
)
from app.routes.election_admin import (
    ClearElectionResultsRequest, clear_election_results,
)


class ClearElectionResultsTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
        )
        Base.metadata.create_all(self.engine)

    def tearDown(self):
        self.engine.dispose()

    def test_admin_clears_only_selected_election_results(self):
        with tempfile.TemporaryDirectory() as upload_dir, Session(self.engine) as db:
            admin = User(full_name="Admin", email="admin@example.com", hashed_password="x", role="admin", is_active=True)
            agent = User(full_name="Agent", email="agent@example.com", hashed_password="x", role="agent", is_active=True)
            election = Election(name="Target Election", election_date=datetime.now(timezone.utc), state="Rivers")
            other_election = Election(name="Other Election", election_date=datetime.now(timezone.utc), state="Rivers")
            unit = PollingUnit(code="32/01/01/001", name="Unit 1", state="Rivers", lga="Abua/Odual", ward="Ward 1")
            db.add_all([admin, agent, election, other_election, unit])
            db.commit()
            target = ResultSubmission(election_id=election.id, polling_unit_id=unit.id, agent_id=agent.id, accredited_voters=10, valid_votes=9, rejected_votes=1)
            retained = ResultSubmission(election_id=other_election.id, polling_unit_id=unit.id, agent_id=agent.id, accredited_voters=10, valid_votes=9, rejected_votes=1)
            db.add_all([target, retained])
            db.commit()
            target_id = target.id
            retained_id = retained.id
            evidence_file = Path(upload_dir) / "sheet.jpg"
            evidence_file.write_bytes(b"evidence")
            db.add_all([
                PartyResult(submission_id=target.id, party="APC", votes=9),
                ResultEvidence(submission_id=target.id, file_path=str(evidence_file)),
                ResultReview(submission_id=target.id, reviewer_id=admin.id, status="verified"),
                ResultFlag(submission_id=target.id, flag_type="test", severity="low", message="test"),
                Incident(election_id=election.id, polling_unit_id=unit.id, reported_by=agent.id, category="Other", description="Preserve me", severity="low", status="open"),
            ])
            db.commit()

            with patch("app.routes.election_admin.RESULT_UPLOAD_DIR", Path(upload_dir).resolve()):
                response = clear_election_results(
                    election.id,
                    ClearElectionResultsRequest(confirmation="CLEAR ELECTION RESULTS"),
                    db,
                    admin,
                )

            self.assertEqual(response["deleted"]["submissions"], 1)
            self.assertFalse(evidence_file.exists())
            self.assertIsNone(db.get(ResultSubmission, target_id))
            self.assertIsNotNone(db.get(ResultSubmission, retained_id))
            self.assertEqual(db.scalar(select(func.count()).select_from(Incident)), 1)
            audit = db.scalar(select(AuditLog).where(AuditLog.action == "CLEAR_ELECTION_RESULTS"))
            self.assertEqual(audit.record_id, election.id)

    def test_exact_confirmation_is_required(self):
        with Session(self.engine) as db:
            admin = User(full_name="Admin", email="admin@example.com", hashed_password="x", role="admin", is_active=True)
            election = Election(name="Election", election_date=datetime.now(timezone.utc), state="Rivers")
            db.add_all([admin, election])
            db.commit()
            with self.assertRaises(HTTPException) as context:
                clear_election_results(
                    election.id,
                    ClearElectionResultsRequest(confirmation="clear"),
                    db,
                    admin,
                )
            self.assertEqual(context.exception.status_code, 400)


if __name__ == "__main__":
    unittest.main()
