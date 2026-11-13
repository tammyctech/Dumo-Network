from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import (
    User,
    Election,
    PollingUnit,
    AgentAssignment,
    ResultSubmission,
)
from app.security import get_current_user


router = APIRouter(
    prefix="/api/admin/assignments",
    tags=["Agent Assignment Management"],
)


class ReassignRequest(BaseModel):
    polling_unit_id: int = Field(gt=0)
    model_config = ConfigDict(extra="forbid")


# ==========================================
# ADMIN AUTHORIZATION
# ==========================================

def require_admin(
    current_user: User = Depends(get_current_user),
):
    if not current_user.is_active:
        raise HTTPException(
            status_code=403,
            detail="Your account is inactive.",
        )

    if current_user.role != "admin":
        raise HTTPException(
            status_code=403,
            detail="Administrator access required.",
        )

    return current_user


# ==========================================
# LIST ASSIGNMENTS
# ==========================================

@router.get("")
def list_assignments(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    rows = db.execute(
        select(
            AgentAssignment,
            User,
            PollingUnit,
        )
        .join(
            User,
            AgentAssignment.agent_id == User.id,
        )
        .join(
            PollingUnit,
            AgentAssignment.polling_unit_id == PollingUnit.id,
        )
        .where(
            PollingUnit.state == "Rivers",
        )
        .order_by(AgentAssignment.id.desc())
    ).all()

    assignments = []

    for assignment, agent, unit in rows:
        assignments.append(
            {
                "id": assignment.id,
                "scope": "All elections",
                "agent": {
                    "id": agent.id,
                    "full_name": agent.full_name,
                    "email": agent.email,
                    "role": agent.role,
                    "is_active": agent.is_active,
                },
                "polling_unit": {
                    "id": unit.id,
                    "code": unit.code,
                    "name": unit.name,
                    "lga": unit.lga,
                    "ward": unit.ward,
                },
            }
        )

    return {
        "state": "Rivers",
        "total": len(assignments),
        "assignments": assignments,
    }


# ==========================================
# REASSIGN AGENT
# ==========================================

@router.patch("/{assignment_id}")
def reassign_agent(
    assignment_id: int,
    payload: ReassignRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    assignment = db.get(AgentAssignment, assignment_id)
    if assignment is None:
        raise HTTPException(404, "Assignment not found.")
    old_unit = db.get(PollingUnit, assignment.polling_unit_id)
    new_unit = db.get(PollingUnit, payload.polling_unit_id)
    if old_unit is None or new_unit is None:
        raise HTTPException(404, "Polling unit not found.")
    if old_unit.state.casefold() != "rivers" or new_unit.state.casefold() != "rivers":
        raise HTTPException(403, "Only Rivers State assignments can be managed.")
    if assignment.polling_unit_id == new_unit.id:
        return {"message": "Agent is already assigned to this polling unit.", "assignment_id": assignment.id}
    existing_submission = db.scalar(select(ResultSubmission.id).where(
        ResultSubmission.polling_unit_id == assignment.polling_unit_id,
        ResultSubmission.agent_id == assignment.agent_id,
    ))
    if existing_submission is not None:
        raise HTTPException(409, "This assignment has an existing result submission and cannot be reassigned.")
    occupied = db.scalar(select(AgentAssignment.id).where(
        AgentAssignment.polling_unit_id == new_unit.id,
        AgentAssignment.id != assignment.id,
    ))
    if occupied is not None:
        raise HTTPException(409, "The selected polling unit already has a permanent agent.")
    assignment.polling_unit_id = new_unit.id
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, "The selected polling unit already has a permanent agent.") from exc
    return {
        "message": "Agent reassigned successfully for all elections.",
        "assignment_id": assignment.id,
        "polling_unit_id": new_unit.id,
    }


# ==========================================
# REMOVE ASSIGNMENT
# ==========================================

@router.delete("/{assignment_id}")
def remove_assignment(
    assignment_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    assignment = db.get(
        AgentAssignment,
        assignment_id,
    )

    if not assignment:
        raise HTTPException(
            status_code=404,
            detail="Assignment not found.",
        )

    unit = db.get(
        PollingUnit,
        assignment.polling_unit_id,
    )

    if (
        not unit
        or unit.state != "Rivers"
    ):
        raise HTTPException(
            status_code=403,
            detail="Only Rivers State assignments can be managed.",
        )

    # Do not remove an assignment that has already
    # been used to submit election results.
    #
    # This protects the relationship between an
    # agent and their submitted polling-unit results.

    existing_submission = db.scalar(
        select(ResultSubmission.id).where(
            ResultSubmission.polling_unit_id
            == assignment.polling_unit_id,
            ResultSubmission.agent_id
            == assignment.agent_id,
        )
    )

    if existing_submission is not None:
        raise HTTPException(
            status_code=409,
            detail=(
                "This assignment has an existing result submission "
                "and cannot be deleted."
            ),
        )

    db.delete(assignment)

    try:
        db.commit()
    except Exception:
        db.rollback()
        raise

    return {
        "message": "Agent assignment removed successfully.",
        "assignment_id": assignment_id,
    }
