from collections import defaultdict

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Election, PartyResult, PollingUnit, ResultSubmission


router = APIRouter(
    prefix="/api/public",
    tags=["Public Election Results"],
)


@router.get("/election-overview")
def public_election_overview(db: Session = Depends(get_db)):
    """Return a privacy-safe public summary of the latest Rivers election."""

    election = db.scalar(
        select(Election)
        .where(Election.state == "Rivers")
        .order_by(Election.election_date.desc(), Election.id.desc())
        .limit(1)
    )

    total_polling_units = db.scalar(
        select(func.count(PollingUnit.id)).where(
            PollingUnit.state == "Rivers"
        )
    ) or 0

    if election is None:
        return {
            "state": "Rivers",
            "data_type": "unofficial_agent_submitted",
            "election": None,
            "last_updated": None,
            "total_polling_units": total_polling_units,
            "submitted_polling_units": 0,
            "submission_coverage_percent": None,
            "party_totals": [],
            "lga_results": [],
            "updates": [],
        }

    submission_filter = (
        ResultSubmission.election_id == election.id,
        PollingUnit.state == "Rivers",
    )

    submitted_polling_units = db.scalar(
        select(func.count(func.distinct(ResultSubmission.polling_unit_id)))
        .join(PollingUnit, PollingUnit.id == ResultSubmission.polling_unit_id)
        .where(*submission_filter)
    ) or 0

    last_updated = db.scalar(
        select(func.max(ResultSubmission.submitted_at))
        .join(PollingUnit, PollingUnit.id == ResultSubmission.polling_unit_id)
        .where(*submission_filter)
    )

    party_rows = db.execute(
        select(
            PartyResult.party,
            func.sum(PartyResult.votes).label("votes"),
        )
        .join(
            ResultSubmission,
            ResultSubmission.id == PartyResult.submission_id,
        )
        .join(PollingUnit, PollingUnit.id == ResultSubmission.polling_unit_id)
        .where(*submission_filter)
        .group_by(PartyResult.party)
        .order_by(func.sum(PartyResult.votes).desc())
    ).all()

    lga_unit_rows = db.execute(
        select(PollingUnit.lga, func.count(PollingUnit.id))
        .where(PollingUnit.state == "Rivers")
        .group_by(PollingUnit.lga)
        .order_by(PollingUnit.lga)
    ).all()

    lga_submission_rows = db.execute(
        select(
            PollingUnit.lga,
            func.count(func.distinct(ResultSubmission.polling_unit_id)),
        )
        .join(ResultSubmission, ResultSubmission.polling_unit_id == PollingUnit.id)
        .where(*submission_filter)
        .group_by(PollingUnit.lga)
    ).all()

    lga_party_rows = db.execute(
        select(
            PollingUnit.lga,
            PartyResult.party,
            func.sum(PartyResult.votes).label("votes"),
        )
        .join(ResultSubmission, ResultSubmission.polling_unit_id == PollingUnit.id)
        .join(PartyResult, PartyResult.submission_id == ResultSubmission.id)
        .where(*submission_filter)
        .group_by(PollingUnit.lga, PartyResult.party)
        .order_by(PollingUnit.lga, func.sum(PartyResult.votes).desc())
    ).all()

    submissions_by_lga = dict(lga_submission_rows)
    parties_by_lga: dict[str, list[dict]] = defaultdict(list)

    for lga, party, votes in lga_party_rows:
        parties_by_lga[lga].append(
            {"party": party, "votes": int(votes or 0)}
        )

    lga_results = []
    for lga, total_units in lga_unit_rows:
        submitted_units = submissions_by_lga.get(lga, 0)
        parties = parties_by_lga.get(lga, [])
        leader = parties[0] if parties else None
        coverage = (
            round(submitted_units / total_units * 100, 2)
            if total_units
            else None
        )
        lga_results.append(
            {
                "lga": lga,
                "total_polling_units": total_units,
                "submitted_polling_units": submitted_units,
                "coverage_percent": coverage,
                "leader": leader,
                "party_totals": parties,
            }
        )

    recent_rows = db.execute(
        select(
            ResultSubmission.id,
            ResultSubmission.submitted_at,
            ResultSubmission.is_flagged,
            PollingUnit,
        )
        .join(PollingUnit, PollingUnit.id == ResultSubmission.polling_unit_id)
        .where(*submission_filter)
        .order_by(ResultSubmission.submitted_at.desc(), ResultSubmission.id.desc())
        .limit(12)
    ).all()

    recent_ids = [submission_id for submission_id, _, _, _ in recent_rows]
    recent_parties: dict[int, list[dict]] = defaultdict(list)

    if recent_ids:
        recent_party_rows = db.execute(
            select(PartyResult.submission_id, PartyResult.party, PartyResult.votes)
            .where(PartyResult.submission_id.in_(recent_ids))
            .order_by(PartyResult.submission_id, PartyResult.votes.desc())
        ).all()
        for submission_id, party, votes in recent_party_rows:
            recent_parties[submission_id].append(
                {"party": party, "votes": votes}
            )

    updates = []
    for submission_id, submitted_at, is_flagged, unit in recent_rows:
        parties = recent_parties.get(submission_id, [])
        updates.append(
            {
                "id": submission_id,
                "submitted_at": submitted_at,
                "lga": unit.lga,
                "ward": unit.ward,
                "polling_unit_name": unit.name,
                "polling_unit_code": unit.code,
                "leading_party": parties[0] if parties else None,
                "is_flagged": is_flagged,
            }
        )

    coverage = (
        round(submitted_polling_units / total_polling_units * 100, 2)
        if total_polling_units
        else None
    )

    return {
        "state": "Rivers",
        "data_type": "unofficial_agent_submitted",
        "election": {
            "id": election.id,
            "name": election.name,
            "election_date": election.election_date,
        },
        "last_updated": last_updated,
        "total_polling_units": total_polling_units,
        "submitted_polling_units": submitted_polling_units,
        "submission_coverage_percent": coverage,
        "party_totals": [
            {"party": party, "votes": int(votes or 0)}
            for party, votes in party_rows
        ],
        "lga_results": lga_results,
        "updates": updates,
    }
