from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
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
            Election,
            PollingUnit,
        )
        .join(
            User,
            AgentAssignment.agent_id == User.id,
        )
        .join(
            Election,
            AgentAssignment.election_id == Election.id,
        )
        .join(
            PollingUnit,
            AgentAssignment.polling_unit_id == PollingUnit.id,
        )
        .where(
            Election.state == "Rivers",
            PollingUnit.state == "Rivers",
        )
        .order_by(AgentAssignment.id.desc())
    ).all()

    assignments = []

    for assignment, agent, election, unit in rows:
        assignments.append(
            {
                "id": assignment.id,
                "election": {
                    "id": election.id,
                    "name": election.name,
                },
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

    election = db.get(
        Election,
        assignment.election_id,
    )

    unit = db.get(
        PollingUnit,
        assignment.polling_unit_id,
    )

    if (
        not election
        or not unit
        or election.state != "Rivers"
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
            ResultSubmission.election_id
            == assignment.election_id,
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