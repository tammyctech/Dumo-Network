from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import AgentAssignment, PollingUnit, User


def polling_unit_capacity(unit: PollingUnit) -> int:
    return 2 if unit.lga.strip().casefold() == "tai" else 1


def active_assignment_count(db: Session, polling_unit_id: int, *, exclude_id: int | None = None) -> int:
    statement = (
        select(func.count(AgentAssignment.id))
        .join(User, User.id == AgentAssignment.agent_id)
        .where(AgentAssignment.polling_unit_id == polling_unit_id, User.is_active.is_(True))
    )
    if exclude_id is not None:
        statement = statement.where(AgentAssignment.id != exclude_id)
    return int(db.scalar(statement) or 0)


def validate_assignment(
    db: Session,
    *,
    agent: User,
    unit: PollingUnit,
    exclude_assignment_id: int | None = None,
    registered_lga: str | None = None,
) -> None:
    """Validate while holding the polling-unit row lock on PostgreSQL.

    Locking one stable parent row serializes competing inserts for the same
    unit. Database constraints/triggers remain the final protection.
    """
    locked_unit = db.scalar(select(PollingUnit).where(PollingUnit.id == unit.id).with_for_update())
    if locked_unit is None:
        raise HTTPException(404, "Polling unit not found.")
    if locked_unit.state.strip().casefold() != "rivers":
        raise HTTPException(422, "Select a valid Rivers State polling unit.")
    if agent.role != "agent" or not agent.is_active:
        raise HTTPException(403, "The selected user must be an active agent.")

    existing_query = select(AgentAssignment.id).where(AgentAssignment.agent_id == agent.id)
    if exclude_assignment_id is not None:
        existing_query = existing_query.where(AgentAssignment.id != exclude_assignment_id)
    existing = db.scalar(existing_query)
    if existing is not None:
        raise HTTPException(409, "This agent already has a polling-unit assignment.")

    if registered_lga and registered_lga.strip().casefold() != locked_unit.lga.strip().casefold():
        raise HTTPException(409, "An agent cannot be assigned outside their registered LGA.")

    if active_assignment_count(db, locked_unit.id, exclude_id=exclude_assignment_id) >= polling_unit_capacity(locked_unit):
        raise HTTPException(409, "This polling unit has reached its maximum number of agents.")

