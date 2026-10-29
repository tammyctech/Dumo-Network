"""Seed the real schema with the historical 2023 Rivers LGA demo dataset.

The source contains LGA aggregates rather than polling-unit results. To avoid
misrepresenting those figures, every generated unit is explicitly labelled as
a synthetic historical LGA collation record.

Run from the backend directory:
    python scripts/seed_2023_rivers_demo.py          # preview only
    python scripts/seed_2023_rivers_demo.py --apply  # commit transaction
"""

import argparse
import re
import secrets
import sys
from datetime import datetime, timedelta
from pathlib import Path

from pwdlib import PasswordHash
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.database import SessionLocal, engine  # noqa: E402
from app.demo_data.rivers_2023 import (  # noqa: E402
    COLLATION_DATE,
    ELECTION_DATE,
    ELECTION_NAME,
    LGA_RESULTS,
    SOURCE_URL,
)
from app.models import (  # noqa: E402
    AgentAssignment,
    Election,
    PartyResult,
    PollingUnit,
    ResultSubmission,
    User,
)


DEMO_AGENT_EMAIL = "historical-results-2023@dumo.invalid"
DEMO_UNIT_PREFIX = "DEMO-2023-RIV-"
DEMO_WARD = "Historical LGA Collation"


def unit_code(lga: str) -> str:
    slug = re.sub(r"[^A-Z0-9]", "", lga.upper())
    return f"{DEMO_UNIT_PREFIX}{slug}"


def get_or_create_election(db) -> tuple[Election, bool]:
    election = db.scalar(
        select(Election).where(
            Election.name == ELECTION_NAME,
            Election.state == "Rivers",
        )
    )
    if election:
        election.election_date = datetime.fromisoformat(ELECTION_DATE)
        return election, False

    election = Election(
        name=ELECTION_NAME,
        election_date=datetime.fromisoformat(ELECTION_DATE),
        state="Rivers",
    )
    db.add(election)
    db.flush()
    return election, True


def get_or_create_agent(db) -> tuple[User, bool]:
    agent = db.scalar(select(User).where(User.email == DEMO_AGENT_EMAIL))
    if agent:
        agent.full_name = "Historical Results Import (2023)"
        agent.role = "agent"
        agent.is_active = False
        return agent, False

    agent = User(
        full_name="Historical Results Import (2023)",
        email=DEMO_AGENT_EMAIL,
        phone_number=None,
        hashed_password=PasswordHash.recommended().hash(
            secrets.token_urlsafe(48)
        ),
        role="agent",
        is_active=False,
    )
    db.add(agent)
    db.flush()
    return agent, True


def seed(apply: bool) -> None:
    target = engine.url.render_as_string(hide_password=True)
    mode = "APPLY" if apply else "PREVIEW"
    print(f"Mode: {mode}")
    print(f"Database: {target}")
    print(f"Election: {ELECTION_NAME}")
    print(f"Source: {SOURCE_URL}")
    print(f"LGA collation records: {len(LGA_RESULTS)}")

    if not apply:
        print("\nNo database changes made. Re-run with --apply to commit.")
        return

    created = {
        "elections": 0,
        "agents": 0,
        "polling_units": 0,
        "assignments": 0,
        "submissions": 0,
        "party_results": 0,
    }
    updated = {"submissions": 0, "party_results": 0}

    with SessionLocal() as db:
        try:
            election, was_created = get_or_create_election(db)
            created["elections"] += int(was_created)
            agent, was_created = get_or_create_agent(db)
            created["agents"] += int(was_created)
            submitted_at = datetime.fromisoformat(COLLATION_DATE)

            for index, result in enumerate(LGA_RESULTS):
                code = unit_code(result.lga)
                unit = db.scalar(
                    select(PollingUnit).where(PollingUnit.code == code)
                )
                if unit is None:
                    unit = PollingUnit(
                        code=code,
                        name=f"{result.lga} Historical LGA Collation (Demo)",
                        state="Rivers",
                        lga=result.lga,
                        ward=DEMO_WARD,
                    )
                    db.add(unit)
                    db.flush()
                    created["polling_units"] += 1
                else:
                    unit.name = f"{result.lga} Historical LGA Collation (Demo)"
                    unit.state = "Rivers"
                    unit.lga = result.lga
                    unit.ward = DEMO_WARD

                assignment = db.scalar(
                    select(AgentAssignment).where(
                        AgentAssignment.election_id == election.id,
                        AgentAssignment.polling_unit_id == unit.id,
                        AgentAssignment.agent_id == agent.id,
                    )
                )
                if assignment is None:
                    db.add(
                        AgentAssignment(
                            election_id=election.id,
                            polling_unit_id=unit.id,
                            agent_id=agent.id,
                        )
                    )
                    created["assignments"] += 1

                submission = db.scalar(
                    select(ResultSubmission).where(
                        ResultSubmission.election_id == election.id,
                        ResultSubmission.polling_unit_id == unit.id,
                    )
                )
                if submission is None:
                    submission = ResultSubmission(
                        election_id=election.id,
                        polling_unit_id=unit.id,
                        agent_id=agent.id,
                        accredited_voters=result.valid_votes,
                        valid_votes=result.valid_votes,
                        rejected_votes=0,
                        version=1,
                        is_flagged=False,
                        submitted_at=submitted_at - timedelta(minutes=index * 12),
                    )
                    db.add(submission)
                    db.flush()
                    created["submissions"] += 1
                else:
                    submission.agent_id = agent.id
                    submission.accredited_voters = result.valid_votes
                    submission.valid_votes = result.valid_votes
                    submission.rejected_votes = 0
                    submission.is_flagged = False
                    updated["submissions"] += 1

                for party, votes in result.party_votes.items():
                    party_result = db.scalar(
                        select(PartyResult).where(
                            PartyResult.submission_id == submission.id,
                            PartyResult.party == party,
                        )
                    )
                    if party_result is None:
                        db.add(
                            PartyResult(
                                submission_id=submission.id,
                                party=party,
                                votes=votes,
                            )
                        )
                        created["party_results"] += 1
                    else:
                        party_result.votes = votes
                        updated["party_results"] += 1

            db.commit()
        except Exception:
            db.rollback()
            raise

    print("\nHistorical demo seed committed successfully.")
    print(f"Created: {created}")
    print(f"Updated: {updated}")
    print("Select the '[HISTORICAL DEMO]' election in the admin dashboard.")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Seed historical 2023 Rivers LGA demo results."
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Commit the idempotent seed transaction (default is preview).",
    )
    args = parser.parse_args()
    try:
        seed(apply=args.apply)
    except SQLAlchemyError as error:
        print(
            "\nDatabase operation failed. Confirm PostgreSQL is running and "
            "DATABASE_URL is correct.",
            file=sys.stderr,
        )
        print(f"Details: {error.__class__.__name__}", file=sys.stderr)
        raise SystemExit(1) from None


if __name__ == "__main__":
    main()
