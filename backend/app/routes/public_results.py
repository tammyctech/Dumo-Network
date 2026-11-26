from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Election, PartyResult, PollingUnit, ResultSubmission, Ward


router = APIRouter(
    prefix="/api/public",
    tags=["Public Election Results"],
)


@router.get("/polling-unit-results")
def public_polling_unit_results(
    election_id: int,
    lga: str,
    db: Session = Depends(get_db),
    offset: int = Query(default=0, ge=0),
):
    """Page through public vote figures without exposing agent or evidence records."""
    page_size = 25
    rows = db.execute(
        select(
            ResultSubmission.id, PollingUnit.code, PollingUnit.name, PollingUnit.ward,
            ResultSubmission.valid_votes, ResultSubmission.rejected_votes,
        )
        .select_from(ResultSubmission)
        .join(PollingUnit, PollingUnit.id == ResultSubmission.polling_unit_id)
        .join(Election, Election.id == ResultSubmission.election_id)
        .where(
            Election.id == election_id,
            Election.state == "Rivers",
            PollingUnit.state == "Rivers",
            PollingUnit.lga == lga,
        )
        .order_by(ResultSubmission.id)
        .offset(offset)
        .limit(page_size + 1)
    ).all()
    page = rows[:page_size]
    totals = defaultdict(list)
    if page:
        for submission_id, party, votes in db.execute(
            select(PartyResult.submission_id, PartyResult.party, PartyResult.votes)
            .where(PartyResult.submission_id.in_([row.id for row in page]))
            .order_by(PartyResult.party)
        ):
            totals[submission_id].append({"party": party, "votes": votes})

    return {
        "reports": [
            {
                "id": row.id, "code": row.code, "name": row.name, "ward": row.ward,
                "valid_votes": row.valid_votes, "rejected_votes": row.rejected_votes,
                "party_totals": totals[row.id],
            }
            for row in page
        ],
        "next_offset": offset + page_size if len(rows) > page_size else None,
    }


@router.get("/election-overview")
def public_election_overview(
    race: str | None = None,
    db: Session = Depends(get_db),
    election_id: int | None = None,
):
    """Return a privacy-safe summary of the administrator-selected election."""

    query = select(Election).where(Election.state == "Rivers")
    reported_elections = (
        select(ResultSubmission.election_id)
        .join(PollingUnit, PollingUnit.id == ResultSubmission.polling_unit_id)
        .where(PollingUnit.state == "Rivers")
    )
    public_elections = db.scalars(
        query.where(Election.is_active.is_(True) | Election.id.in_(reported_elections))
        .order_by(Election.is_active.desc(), Election.election_date.desc(), Election.id.desc())
    ).all()
    if election_id is not None:
        query = query.where(Election.id == election_id)
        query = query.where(Election.is_active.is_(True) | Election.id.in_(reported_elections))
    elif race:
        normalized_race = race.strip().lower()
        race_term = "president" if normalized_race == "presidential" else "governor"
        query = query.where(func.lower(Election.name).contains(race_term))
    election = db.scalar(
        query.order_by(Election.is_active.desc(), Election.id.desc()).limit(1)
    )
    if election_id is not None and election is None:
        raise HTTPException(status_code=404, detail="Public results for this election are unavailable.")

    available_elections = [{"id": item.id, "name": item.name} for item in public_elections]

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
            "available_elections": available_elections,
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

    lga_ward_rows = db.execute(
        select(Ward.lga, func.count(Ward.id))
        .where(Ward.state == "Rivers")
        .group_by(Ward.lga)
    ).all()
    wards_by_lga = dict(lga_ward_rows)

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
        leader = parties[0] if parties and parties[0]["votes"] > 0 else None
        total_valid_votes = sum(party["votes"] for party in parties)
        leader_percentage = (
            round(leader["votes"] / total_valid_votes * 100, 2)
            if leader and total_valid_votes
            else 0
        )
        coverage = (
            round(submitted_units / total_units * 100, 2)
            if total_units
            else None
        )
        lga_results.append(
            {
                "lga": lga,
                "total_wards": wards_by_lga.get(lga, 0),
                "total_polling_units": total_units,
                "submitted_polling_units": submitted_units,
                "coverage_percent": coverage,
                "leader": leader,
                "leader_percentage": leader_percentage,
                "total_valid_votes": total_valid_votes,
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
        "available_elections": available_elections,
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
