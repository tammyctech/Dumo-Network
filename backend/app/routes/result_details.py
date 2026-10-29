from pathlib import Path

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
)
from fastapi.responses import FileResponse

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db

from app.models import (
    User,
    Election,
    PollingUnit,
    ResultSubmission,
    PartyResult,
    ResultEvidence,
)

from app.security import get_current_user


router = APIRouter(
    prefix="/api/result-details",
    tags=["Polling Unit Result Details"],
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

    if current_user.role not in ("admin", "agent"):
        raise HTTPException(
            status_code=403,
            detail="Access restricted.",
        )

    return current_user


# ==========================================
# LIST RESULT SUBMISSIONS
# ==========================================

@router.get("")
def list_result_submissions(
    election_id: int | None = None,
    lga: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_active_user),
):

    query = (
        select(
            ResultSubmission,
            Election,
            PollingUnit,
            User,
        )
        .join(
            Election,
            Election.id == ResultSubmission.election_id,
        )
        .join(
            PollingUnit,
            PollingUnit.id == ResultSubmission.polling_unit_id,
        )
        .join(
            User,
            User.id == ResultSubmission.agent_id,
        )
        .where(
            Election.state == "Rivers",
            PollingUnit.state == "Rivers",
        )
    )

    if current_user.role == "agent":
        query = query.where(
            ResultSubmission.agent_id == current_user.id
        )

    if election_id is not None:
        query = query.where(
            ResultSubmission.election_id == election_id
        )

    if lga:
        query = query.where(
            PollingUnit.lga == lga
        )

    rows = db.execute(
        query.order_by(
            ResultSubmission.submitted_at.desc(),
            ResultSubmission.id.desc(),
        ).limit(200)
    ).all()

    submissions = []

    for submission, election, unit, agent in rows:
        submissions.append(
            {
                "id": submission.id,
                "election": {
                    "id": election.id,
                    "name": election.name,
                },
                "polling_unit": {
                    "id": unit.id,
                    "code": unit.code,
                    "name": unit.name,
                    "lga": unit.lga,
                    "ward": unit.ward,
                },
                "agent": {
                    "id": agent.id,
                    "full_name": agent.full_name,
                },
                "submitted_at": submission.submitted_at,
                "version": submission.version,
                "is_flagged": submission.is_flagged,
                "verification_status": submission.verification_status,
            }
        )

    return {
        "state": "Rivers",
        "data_type": "unofficial_agent_submitted",
        "limit": 200,
        "submissions": submissions,
    }


# ==========================================
# GET ONE SUBMISSION
# ==========================================

@router.get("/{submission_id}")
def get_result_submission(
    submission_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_active_user),
):

    row = db.execute(
        select(
            ResultSubmission,
            Election,
            PollingUnit,
            User,
        )
        .join(
            Election,
            Election.id == ResultSubmission.election_id,
        )
        .join(
            PollingUnit,
            PollingUnit.id == ResultSubmission.polling_unit_id,
        )
        .join(
            User,
            User.id == ResultSubmission.agent_id,
        )
        .where(
            ResultSubmission.id == submission_id,
            Election.state == "Rivers",
            PollingUnit.state == "Rivers",
        )
    ).first()

    if row is None:
        raise HTTPException(
            status_code=404,
            detail="Result submission not found.",
        )

    submission, election, unit, agent = row

    if (
        current_user.role != "admin"
        and submission.agent_id != current_user.id
    ):
        raise HTTPException(
            status_code=403,
            detail="You cannot access this submission.",
        )

    party_rows = db.scalars(
        select(PartyResult)
        .where(PartyResult.submission_id == submission.id)
        .order_by(PartyResult.party)
    ).all()

    evidence_rows = db.scalars(
        select(ResultEvidence)
        .where(ResultEvidence.submission_id == submission.id)
        .order_by(ResultEvidence.id)
    ).all()

    return {
        "state": "Rivers",
        "data_type": "unofficial_agent_submitted",
        "submission": {
            "id": submission.id,
            "submitted_at": submission.submitted_at,
            "version": submission.version,
            "is_flagged": submission.is_flagged,
            "verification_status": submission.verification_status,

            "election": {
                "id": election.id,
                "name": election.name,
                "election_date": election.election_date,
            },

            "polling_unit": {
                "id": unit.id,
                "code": unit.code,
                "name": unit.name,
                "lga": unit.lga,
                "ward": unit.ward,
            },

            "agent": {
                "id": agent.id,
                "full_name": agent.full_name,
            },

            "accredited_voters": submission.accredited_voters,
            "valid_votes": submission.valid_votes,
            "rejected_votes": submission.rejected_votes,

            "party_results": [
                {
                    "party": result.party,
                    "votes": result.votes,
                }
                for result in party_rows
            ],

            "evidence": [
                {
                    "id": evidence.id,
                    "uploaded_at": evidence.uploaded_at,
                    "image_url": (
                        f"/api/result-details/"
                        f"{submission.id}/evidence/{evidence.id}"
                    ),
                }
                for evidence in evidence_rows
            ],
        },
    }


# ==========================================
# VIEW PRIVATE RESULT-SHEET IMAGE
# ==========================================

@router.get("/{submission_id}/evidence/{evidence_id}")
def view_result_evidence(
    submission_id: int,
    evidence_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_active_user),
):

    row = db.execute(
        select(
            ResultSubmission,
            Election,
            PollingUnit,
        )
        .join(
            Election,
            Election.id == ResultSubmission.election_id,
        )
        .join(
            PollingUnit,
            PollingUnit.id == ResultSubmission.polling_unit_id,
        )
        .where(
            ResultSubmission.id == submission_id,
            Election.state == "Rivers",
            PollingUnit.state == "Rivers",
        )
    ).first()

    if row is None:
        raise HTTPException(
            status_code=404,
            detail="Submission not found.",
        )

    submission, election, unit = row

    if (
        current_user.role != "admin"
        and submission.agent_id != current_user.id
    ):
        raise HTTPException(
            status_code=403,
            detail="You cannot access this evidence.",
        )

    evidence = db.scalar(
        select(ResultEvidence).where(
            ResultEvidence.id == evidence_id,
            ResultEvidence.submission_id == submission_id,
        )
    )

    if evidence is None:
        raise HTTPException(
            status_code=404,
            detail="Evidence not found.",
        )

    # Restrict access to the private evidence directory.
    # Never trust a stored path without checking its location.

    evidence_root = (
        Path(__file__).resolve().parents[2]
        / "uploads"
        / "result_sheets"
    ).resolve()

    stored_path = Path(evidence.file_path)

    if stored_path.is_absolute():
        image_path = stored_path.resolve()
    else:
        image_path = (
            Path(__file__).resolve().parents[2]
            / stored_path
        ).resolve()

    if not image_path.is_relative_to(evidence_root):
        raise HTTPException(
            status_code=403,
            detail="Invalid evidence path.",
        )

    if not image_path.is_file():
        raise HTTPException(
            status_code=404,
            detail="Evidence image is unavailable.",
        )

    # The upload endpoint accepts JPEG and PNG only.
    # Do not use the original user-supplied filename
    # as the download name.

    suffix = image_path.suffix.lower()

    if suffix in (".jpg", ".jpeg"):
        media_type = "image/jpeg"
    elif suffix == ".png":
        media_type = "image/png"
    else:
        raise HTTPException(
            status_code=415,
            detail="Unsupported evidence format.",
        )

    return FileResponse(
        path=str(image_path),
        media_type=media_type,
        headers={
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "default-src 'none'; sandbox",
        },
    )
