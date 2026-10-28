from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import (
    User,
    Election,
    PollingUnit,
    AgentAssignment,
)
from app.security import get_current_user


router = APIRouter(
    prefix="/api/agent",
    tags=["Agent Assignments"],
)


@router.get("/assignments")
def get_my_assignments(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Return elections and polling units assigned
    to the currently authenticated agent.
    """

    if not current_user.is_active:
        raise HTTPException(
            status_code=403,
            detail="Your account is inactive.",
        )

    if current_user.role != "agent":
        raise HTTPException(
            status_code=403,
            detail="Only agents can access their assignments.",
        )

    statement = (
        select(
            AgentAssignment,
            Election,
            PollingUnit,
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
            AgentAssignment.agent_id == current_user.id,
            Election.state == "Rivers",
            PollingUnit.state == "Rivers",
        )
        .order_by(
            Election.election_date.desc(),
            PollingUnit.lga,
            PollingUnit.ward,
            PollingUnit.name,
        )
    )

    records = db.execute(statement).all()

    assignments = []

    for assignment, election, polling_unit in records:
        assignments.append(
            {
                "assignment_id": assignment.id,
                "election": {
                    "id": election.id,
                    "name": election.name,
                    "election_date": election.election_date,
                },
                "polling_unit": {
                    "id": polling_unit.id,
                    "code": polling_unit.code,
                    "name": polling_unit.name,
                    "lga": polling_unit.lga,
                    "ward": polling_unit.ward,
                    "state": polling_unit.state,
                },
            }
        )

    return {
        "state": "Rivers",
        "data_type": "unofficial_agent_submitted",
        "total_assignments": len(assignments),
        "assignments": assignments,
    }