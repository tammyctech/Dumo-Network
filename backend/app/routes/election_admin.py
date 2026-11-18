import logging
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import delete, func, select, text
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
from ..services.agent_integrity import validate_assignment
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


def _reset_result_submission_sequence(db: Session) -> int:
    """Align PostgreSQL's sequence with the remaining rows and return the next ID."""
    highest_id = db.scalar(select(func.max(ResultSubmission.id)))
    next_id = (highest_id or 0) + 1
    if db.bind is not None and db.bind.dialect.name == "postgresql":
        sequence_name = db.scalar(text(
            "SELECT pg_get_serial_sequence('result_submissions', 'id')"
        ))
        if sequence_name:
            db.execute(
                text("SELECT setval(CAST(:sequence_name AS regclass), :value, :is_called)"),
                {
                    "sequence_name": sequence_name,
                    "value": highest_id or 1,
                    "is_called": highest_id is not None,
                },
            )
    return next_id


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

    # DELETE does not rewind PostgreSQL sequences. Flush the removals first,
    # then align the sequence with the highest submission that still exists.
    db.flush()
    next_submission_id = _reset_result_submission_sequence(db)

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
        "next_submission_id": next_submission_id,
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

    validate_assignment(db, agent=agent, unit=polling_unit)

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
            detail="This agent or polling-unit assignment conflicts with existing data.",
        )

    return AgentAssignmentResponse(
        id=assignment.id,
        election_id=assignment.election_id,
        polling_unit_id=assignment.polling_unit_id,
        agent_id=assignment.agent_id,
        message="Agent permanently assigned to this polling unit for all elections.",
    )
