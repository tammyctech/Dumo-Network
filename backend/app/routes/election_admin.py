import logging
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import (
    User,
    Election,
    PollingUnit,
    AgentAssignment,
    AuditLog,
    PartyResult,
    ResultEvidence,
    ResultFlag,
    ResultReview,
    ResultSubmission,
)
from ..security import get_current_user
from ..monitoring.admin_schemas import (
    ElectionCreate,
    ElectionResponse,
    AgentAssignmentCreate,
    AgentAssignmentResponse,
)


router = APIRouter(
    tags=["Election Administration"],
)

logger = logging.getLogger(__name__)
RESULT_UPLOAD_DIR = Path("uploads/result_sheets").resolve()
CLEAR_RESULTS_CONFIRMATION = "CLEAR ELECTION RESULTS"


class ClearElectionResultsRequest(BaseModel):
    confirmation: str
    model_config = ConfigDict(extra="forbid")


def require_admin(
    current_user: User = Depends(get_current_user),
):
    if not current_user.is_active or current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrator access required.",
        )

    return current_user


@router.post(
    "/api/elections",
    response_model=ElectionResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_election(
    payload: ElectionCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    election = Election(
        name=payload.name.strip(),
        election_date=payload.election_date,
        state="Rivers",
    )

    db.add(election)
    db.commit()
    db.refresh(election)

    return ElectionResponse(
        id=election.id,
        name=election.name,
        election_date=election.election_date,
        state=election.state,
    )


@router.delete("/api/admin/elections/{election_id}/results")
def clear_election_results(
    election_id: int,
    payload: ClearElectionResultsRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Remove live result data for one election while preserving configuration."""
    if payload.confirmation != CLEAR_RESULTS_CONFIRMATION:
        raise HTTPException(
            status_code=400,
            detail=f'Type "{CLEAR_RESULTS_CONFIRMATION}" to confirm.',
        )

    election = db.get(Election, election_id)
    if election is None:
        raise HTTPException(status_code=404, detail="Election not found.")

    submission_ids = list(db.scalars(
        select(ResultSubmission.id).where(ResultSubmission.election_id == election_id)
    ).all())
    evidence_paths: list[str] = []
    counts = {
        "submissions": len(submission_ids),
        "party_results": 0,
        "evidence": 0,
        "reviews": 0,
        "flags": 0,
    }

    if submission_ids:
        evidence_paths = list(db.scalars(
            select(ResultEvidence.file_path).where(
                ResultEvidence.submission_id.in_(submission_ids)
            )
        ).all())
        counts["evidence"] = len(evidence_paths)
        counts["party_results"] = db.execute(
            delete(PartyResult).where(PartyResult.submission_id.in_(submission_ids))
        ).rowcount or 0
        counts["reviews"] = db.execute(
            delete(ResultReview).where(ResultReview.submission_id.in_(submission_ids))
        ).rowcount or 0
        counts["flags"] = db.execute(
            delete(ResultFlag).where(ResultFlag.submission_id.in_(submission_ids))
        ).rowcount or 0
        db.execute(
            delete(ResultEvidence).where(ResultEvidence.submission_id.in_(submission_ids))
        )
        db.execute(
            delete(ResultSubmission).where(ResultSubmission.id.in_(submission_ids))
        )

    db.add(AuditLog(
        user_id=admin.id,
        action="CLEAR_ELECTION_RESULTS",
        table_name="result_submissions",
        record_id=election.id,
        old_data={"election_name": election.name, **counts},
        new_data=None,
    ))
    db.commit()

    files_deleted = 0
    for stored_path in evidence_paths:
        try:
            evidence_path = Path(stored_path).resolve()
            if not evidence_path.is_relative_to(RESULT_UPLOAD_DIR):
                logger.warning("Skipped result evidence outside upload directory: %s", stored_path)
                continue
            existed = evidence_path.exists()
            evidence_path.unlink(missing_ok=True)
            files_deleted += int(existed)
        except OSError:
            logger.exception("Could not remove result evidence file: %s", stored_path)

    return {
        "message": f'Live result data for "{election.name}" was cleared.',
        "election_id": election.id,
        "deleted": {**counts, "evidence_files": files_deleted},
    }


@router.post(
    "/api/agent-assignments",
    response_model=AgentAssignmentResponse,
    status_code=status.HTTP_201_CREATED,
)
def assign_agent(
    payload: AgentAssignmentCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    polling_unit = db.get(
        PollingUnit,
        payload.polling_unit_id,
    )

    if polling_unit is None:
        raise HTTPException(
            status_code=404,
            detail="Polling unit not found.",
        )

    if polling_unit.state.strip().lower() != "rivers":
        raise HTTPException(
            status_code=403,
            detail="Only Rivers State polling units are supported.",
        )

    agent = db.get(User, payload.agent_id)

    if agent is None:
        raise HTTPException(
            status_code=404,
            detail="Agent account not found.",
        )

    if not agent.is_active:
        raise HTTPException(
            status_code=403,
            detail="Cannot assign an inactive account.",
        )

    if agent.role != "agent":
        raise HTTPException(
            status_code=403,
            detail="The selected user must have the agent role.",
        )

    existing = db.scalar(
        select(AgentAssignment).where(
            AgentAssignment.polling_unit_id == payload.polling_unit_id,
        )
    )

    if existing is not None:
        raise HTTPException(
            status_code=409,
            detail="This polling unit already has a permanent agent.",
        )

    assignment = AgentAssignment(
        election_id=None,
        polling_unit_id=payload.polling_unit_id,
        agent_id=payload.agent_id,
    )

    try:
        db.add(assignment)
        db.commit()
        db.refresh(assignment)

    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="This agent assignment already exists.",
        )

    return AgentAssignmentResponse(
        id=assignment.id,
        election_id=assignment.election_id,
        polling_unit_id=assignment.polling_unit_id,
        agent_id=assignment.agent_id,
        message="Agent permanently assigned to this polling unit for all elections.",
    )
