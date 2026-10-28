from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import (
    User,
    Election,
    PollingUnit,
    AgentAssignment,
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
    election = db.get(Election, payload.election_id)

    if election is None:
        raise HTTPException(
            status_code=404,
            detail="Election not found.",
        )

    if election.state.strip().lower() != "rivers":
        raise HTTPException(
            status_code=403,
            detail="Only Rivers State elections are supported.",
        )

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
            AgentAssignment.election_id == payload.election_id,
            AgentAssignment.polling_unit_id == payload.polling_unit_id,
            AgentAssignment.agent_id == payload.agent_id,
        )
    )

    if existing is not None:
        raise HTTPException(
            status_code=409,
            detail="This agent already has this assignment.",
        )

    assignment = AgentAssignment(
        election_id=payload.election_id,
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
        message="Agent assigned successfully.",
    )