from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import (
    User,
    Election,
    PollingUnit,
    AgentAssignment,
    ResultSubmission,
    PartyResult,
    ResultFlag,
    Incident,
)
from app.security import get_current_user


router = APIRouter(
    prefix="/api/dashboard",
    tags=["Dashboard Statistics"],
)


# ==========================================
# AUTHENTICATION
# ==========================================

def require_active_user(
    current_user: User = Depends(get_current_user),
):
    if not current_user.is_active:
        raise HTTPException(
            status_code=403,
            detail="Your account is inactive.",
        )

    return current_user


# ==========================================
# LIVE DASHBOARD STATISTICS
# ==========================================

@router.get("/statistics")
def dashboard_statistics(
    election_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_active_user),
):

    # --------------------------------------
    # RIVERS STATE POLLING UNITS
    # --------------------------------------

    total_polling_units = db.scalar(
        select(func.count(PollingUnit.id)).where(
            PollingUnit.state == "Rivers"
        )
    ) or 0

    # --------------------------------------
    # ELECTION SELECTION
    # --------------------------------------

    # Use the most recently created Rivers
    # election if no election ID is supplied.

    if election_id is None:
        election = db.scalar(
            select(Election)
            .where(Election.state == "Rivers")
            .order_by(Election.id.desc())
            .limit(1)
        )
    else:
        election = db.scalar(
            select(Election).where(
                Election.id == election_id,
                Election.state == "Rivers",
            )
        )

        if election is None:
            raise HTTPException(
                status_code=404,
                detail="Rivers State election not found.",
            )

    # --------------------------------------
    # NO ELECTION CREATED YET
    # --------------------------------------

    if election is None:
        return {
            "state": "Rivers",
            "data_type": "unofficial_agent_submitted",
            "election": None,
            "total_polling_units": total_polling_units,
            "assigned_polling_units": 0,
            "submitted_polling_units": 0,
            "submission_coverage_percent": None,
            "accredited_voters": None,
            "valid_votes": None,
            "rejected_votes": None,
            "verification_summary": {},
            "active_flags": 0,
            "open_incidents": 0,
            "party_totals": [],
            "lga_progress": [],
            "message": "No election has been created yet.",
        }

    # --------------------------------------
    # ASSIGNED POLLING UNITS
    # --------------------------------------

    assigned_polling_units = db.scalar(
        select(
            func.count(
                func.distinct(
                    AgentAssignment.polling_unit_id
                )
            )
        )
        .join(
            PollingUnit,
            PollingUnit.id == AgentAssignment.polling_unit_id,
        )
        .where(
            AgentAssignment.election_id == election.id,
            PollingUnit.state == "Rivers",
        )
    ) or 0

    # --------------------------------------
    # SUBMITTED POLLING UNITS
    # --------------------------------------

    submitted_polling_units = db.scalar(
        select(
            func.count(
                func.distinct(
                    ResultSubmission.polling_unit_id
                )
            )
        )
        .join(
            PollingUnit,
            PollingUnit.id == ResultSubmission.polling_unit_id,
        )
        .where(
            ResultSubmission.election_id == election.id,
            PollingUnit.state == "Rivers",
        )
    ) or 0

    # --------------------------------------
    # SUBMISSION COVERAGE
    # --------------------------------------

    coverage = (
        round(
            submitted_polling_units
            / total_polling_units
            * 100,
            2,
        )
        if total_polling_units > 0
        else None
    )

    # --------------------------------------
    # VOTE STATISTICS
    # --------------------------------------

    vote_totals = db.execute(
        select(
            func.sum(ResultSubmission.accredited_voters),
            func.sum(ResultSubmission.valid_votes),
            func.sum(ResultSubmission.rejected_votes),
        )
        .join(
            PollingUnit,
            PollingUnit.id == ResultSubmission.polling_unit_id,
        )
        .where(
            ResultSubmission.election_id == election.id,
            PollingUnit.state == "Rivers",
        )
    ).one()

    accredited_voters = vote_totals[0]
    valid_votes = vote_totals[1]
    rejected_votes = vote_totals[2]

    verification_rows = db.execute(
        select(ResultSubmission.verification_status, func.count(ResultSubmission.id))
        .where(ResultSubmission.election_id == election.id)
        .group_by(ResultSubmission.verification_status)
    ).all()
    verification_summary = {status: count for status, count in verification_rows}
    active_flags = db.scalar(
        select(func.count(ResultFlag.id)).join(
            ResultSubmission, ResultSubmission.id == ResultFlag.submission_id
        ).where(ResultSubmission.election_id == election.id, ResultFlag.resolved_at.is_(None))
    ) or 0
    open_incidents = db.scalar(
        select(func.count(Incident.id)).where(
            Incident.election_id == election.id,
            Incident.status.in_(("open", "investigating")),
        )
    ) or 0

    # --------------------------------------
    # PARTY VOTE TOTALS
    # --------------------------------------

    party_rows = db.execute(
        select(
            PartyResult.party,
            func.sum(PartyResult.votes).label("votes"),
        )
        .join(
            ResultSubmission,
            PartyResult.submission_id == ResultSubmission.id,
        )
        .join(
            PollingUnit,
            PollingUnit.id == ResultSubmission.polling_unit_id,
        )
        .where(
            ResultSubmission.election_id == election.id,
            PollingUnit.state == "Rivers",
        )
        .group_by(PartyResult.party)
        .order_by(func.sum(PartyResult.votes).desc())
    ).all()

    party_totals = [
        {
            "party": party,
            "votes": int(votes),
        }
        for party, votes in party_rows
    ]

    # --------------------------------------
    # LGA PROGRESS
    # --------------------------------------

    lga_rows = db.execute(
        select(
            PollingUnit.lga,
            func.count(PollingUnit.id).label("total_units"),
        )
        .where(PollingUnit.state == "Rivers")
        .group_by(PollingUnit.lga)
        .order_by(PollingUnit.lga)
    ).all()

    submitted_lga_rows = db.execute(
        select(
            PollingUnit.lga,
            func.count(
                func.distinct(
                    ResultSubmission.polling_unit_id
                )
            ).label("submitted_units"),
        )
        .join(
            ResultSubmission,
            ResultSubmission.polling_unit_id == PollingUnit.id,
        )
        .where(
            ResultSubmission.election_id == election.id,
            PollingUnit.state == "Rivers",
        )
        .group_by(PollingUnit.lga)
    ).all()

    submitted_by_lga = {
        lga: count
        for lga, count in submitted_lga_rows
    }

    lga_progress = []

    for lga, total in lga_rows:
        submitted = submitted_by_lga.get(lga, 0)

        percentage = (
            round(submitted / total * 100, 2)
            if total > 0
            else None
        )

        lga_progress.append(
            {
                "lga": lga,
                "total_polling_units": total,
                "submitted_polling_units": submitted,
                "coverage_percent": percentage,
            }
        )

    # --------------------------------------
    # RESPONSE
    # --------------------------------------

    return {
        "state": "Rivers",
        "data_type": "unofficial_agent_submitted",
        "election": {
            "id": election.id,
            "name": election.name,
            "election_date": election.election_date,
        },
        "total_polling_units": total_polling_units,
        "assigned_polling_units": assigned_polling_units,
        "submitted_polling_units": submitted_polling_units,
        "submission_coverage_percent": coverage,
        "accredited_voters": accredited_voters,
        "valid_votes": valid_votes,
        "rejected_votes": rejected_votes,
        "verification_summary": verification_summary,
        "active_flags": active_flags,
        "open_incidents": open_incidents,
        "party_totals": party_totals,
        "lga_progress": lga_progress,
    }
