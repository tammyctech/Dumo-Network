import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import (
    User,
    PollingUnit,
    Election,
    AgentAssignment,
    ResultSubmission,
    PartyResult,
    ResultFlag,
)
from ..security import get_current_user
from ..services.email_service import send_bulk_system_email
from ..services.organization_service import admin_notification_recipients, email_sender_name
from ..political_parties import REGISTERED_POLITICAL_PARTIES
from ..monitoring.result_schemas import (
    ResultSubmissionInput,
    ResultSubmissionResponse,
)


logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/results",
    tags=["Agent Election Results"],
)


@router.get("/political-parties")
def political_parties(current_user: User = Depends(get_current_user)):
    if not current_user.is_active or current_user.role not in {"agent", "admin"}:
        raise HTTPException(status_code=403, detail="Active agent or administrator access required.")
    return {
        "source": "INEC statutory register",
        "cycle": "2027 General Election",
        "total": len(REGISTERED_POLITICAL_PARTIES),
        "parties": [
            {"acronym": acronym, "name": name}
            for acronym, name in REGISTERED_POLITICAL_PARTIES
        ],
    }


def _notify_admins_of_result(
    db: Session,
    *,
    agent: User,
    election: Election,
    polling_unit: PollingUnit,
    submission: ResultSubmission,
    party_results,
) -> None:
    """Best-effort email notification; result submission must never depend on SMTP."""
    recipients = admin_notification_recipients(db)
    if not recipients:
        return
    party_lines = "\n".join(
        f"{item.party.strip().upper()}: {item.votes:,} votes"
        for item in party_results
    )
    body = (
        "A new polling-unit result has been submitted.\n\n"
        f"Agent: {agent.full_name}\n"
        f"Agent phone: {agent.phone_number or 'Not provided'}\n"
        f"Election: {election.name}\n"
        f"LGA: {polling_unit.lga}\n"
        f"Ward: {polling_unit.ward}\n"
        f"Polling unit: {polling_unit.code} - {polling_unit.name}\n"
        f"Accredited voters: {submission.accredited_voters:,}\n"
        f"Valid votes: {submission.valid_votes:,}\n"
        f"Rejected votes: {submission.rejected_votes:,}\n\n"
        f"Party results:\n{party_lines}\n\n"
        f"Submission ID: {submission.id}"
    )
    try:
        sent, failed, error = send_bulk_system_email(
            recipients=recipients,
            subject=f"New result: {polling_unit.code} - {election.name}",
            body=body,
            sender_name=email_sender_name(db),
        )
        if error or failed:
            logger.warning(
                "Result %s email notification incomplete: sent=%s failed=%s error=%s",
                submission.id, sent, failed, error,
            )
    except Exception:
        logger.exception("Unexpected result notification failure for submission %s", submission.id)


@router.post(
    "/submit",
    response_model=ResultSubmissionResponse,
    status_code=status.HTTP_201_CREATED,
)
def submit_election_result(
    payload: ResultSubmissionInput,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):

    # 1. Confirm account is active.
    if not current_user.is_active:
        raise HTTPException(
            status_code=403,
            detail="Your account is inactive.",
        )

    # 2. Confirm the election exists.
    election = db.get(
        Election,
        payload.election_id,
    )

    if election is None:
        raise HTTPException(
            status_code=404,
            detail="Election not found.",
        )

    # 3. Restrict elections to Rivers State.
    if election.state.strip().lower() != "rivers":
        raise HTTPException(
            status_code=403,
            detail="Only Rivers State elections are supported.",
        )

    # 4. Confirm the polling unit exists.
    polling_unit = db.get(
        PollingUnit,
        payload.polling_unit_id,
    )

    if polling_unit is None:
        raise HTTPException(
            status_code=404,
            detail="Polling unit not found.",
        )

    # 5. Restrict polling units to Rivers State.
    if polling_unit.state.strip().lower() != "rivers":
        raise HTTPException(
            status_code=403,
            detail="Polling unit must belong to Rivers State.",
        )

    # 6. Agents may submit only for their permanent polling unit. An active
    # administrator may submit for any Rivers State polling unit.
    if current_user.role not in {"agent", "admin"}:
        raise HTTPException(status_code=403, detail="Only agents and administrators can submit results.")
    if current_user.role == "agent":
        assignment = db.scalar(
            select(AgentAssignment).where(
                AgentAssignment.agent_id == current_user.id,
                AgentAssignment.polling_unit_id == payload.polling_unit_id,
            )
        )
        if assignment is None:
            raise HTTPException(
                status_code=403,
                detail="You are not assigned to this polling unit.",
            )

    # 7. Prevent duplicate first submissions.
    existing_submission = db.scalar(
        select(ResultSubmission.id).where(
            ResultSubmission.election_id == payload.election_id,
            ResultSubmission.polling_unit_id == payload.polling_unit_id,
        )
    )

    if existing_submission is not None:
        raise HTTPException(
            status_code=409,
            detail=(
                "A result has already been submitted for this "
                "polling unit and election."
            ),
        )

    # 8. Save the result.
    submission = ResultSubmission(
        election_id=payload.election_id,
        polling_unit_id=payload.polling_unit_id,
        agent_id=current_user.id,
        accredited_voters=payload.accredited_voters,
        valid_votes=payload.valid_votes,
        rejected_votes=payload.rejected_votes,
        version=1,
        is_flagged=False,
    )

    try:
        db.add(submission)
        db.flush()

        # 9. Save votes for each political party.
        for result in payload.party_results:
            party_vote = PartyResult(
                submission_id=submission.id,
                party=result.party.strip().upper(),
                votes=result.votes,
            )

            db.add(party_vote)

        anomaly_rows = []
        if payload.accredited_voters and (
            payload.rejected_votes / payload.accredited_voters
        ) > 0.10:
            anomaly_rows.append((
                "high_rejection_rate", "medium",
                "Rejected votes exceed 10% of accredited voters.",
            ))
        if payload.valid_votes:
            leading_votes = max(item.votes for item in payload.party_results)
            if leading_votes / payload.valid_votes > 0.95:
                anomaly_rows.append((
                    "dominant_party_share", "low",
                    "One party received more than 95% of valid votes; review recommended.",
                ))
        for flag_type, severity, message in anomaly_rows:
            db.add(ResultFlag(
                submission_id=submission.id,
                flag_type=flag_type,
                severity=severity,
                message=message,
            ))
        submission.is_flagged = bool(anomaly_rows)

        # 10. Commit all records together.
        db.commit()
        db.refresh(submission)

    except Exception:
        db.rollback()
        raise

    _notify_admins_of_result(
        db,
        agent=current_user,
        election=election,
        polling_unit=polling_unit,
        submission=submission,
        party_results=payload.party_results,
    )

    return ResultSubmissionResponse(
        message="Unofficial result submitted successfully.",
        submission_id=submission.id,
        election_id=submission.election_id,
        polling_unit_id=submission.polling_unit_id,
        submitted_by=current_user.id,
    )
