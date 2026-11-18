from collections import Counter, defaultdict

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import AgentAssignment, PollingUnit, User
from app.security import require_admin
from app.services.agent_integrity import polling_unit_capacity
from app.utils.phone import normalize_nigerian_phone

router = APIRouter(prefix="/api/admin/data-quality", tags=["Agent Data Quality"])


@router.get("")
def data_quality(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    rows = db.execute(
        select(User, AgentAssignment, PollingUnit)
        .outerjoin(AgentAssignment, AgentAssignment.agent_id == User.id)
        .outerjoin(PollingUnit, PollingUnit.id == AgentAssignment.polling_unit_id)
        .where(User.role == "agent")
        .order_by(User.id, AgentAssignment.id)
    ).all()
    agent_counts = Counter(user.id for user, assignment, _unit in rows if assignment)
    unit_agents: dict[int, list[int]] = defaultdict(list)
    phone_agents: dict[str, set[int]] = defaultdict(set)
    invalid = set()
    for user, assignment, _unit in rows:
        if assignment and user.is_active:
            unit_agents[assignment.polling_unit_id].append(user.id)
        try:
            phone_agents[normalize_nigerian_phone(user.phone_number or "")].add(user.id)
        except ValueError:
            invalid.add(user.id)
    duplicate_phone_ids = {item for values in phone_agents.values() if len(values) > 1 for item in values}
    conflicts = []
    seen = set()
    for user, assignment, unit in rows:
        kinds = []
        if user.id in invalid: kinds.append("Invalid phone number")
        if user.id in duplicate_phone_ids: kinds.append("Duplicate normalized phone number")
        if agent_counts[user.id] > 1: kinds.append("Agent assigned to multiple polling units")
        if unit and len(unit_agents[unit.id]) > polling_unit_capacity(unit): kinds.append("Polling unit over capacity")
        key = (user.id, assignment.id if assignment else None)
        if kinds and key not in seen:
            seen.add(key)
            conflicts.append({
                "agent_id": user.id, "assignment_id": assignment.id if assignment else None,
                "full_name": user.full_name, "phone_number": user.phone_number,
                "lga": unit.lga if unit else None, "ward": unit.ward if unit else None,
                "polling_unit_code": unit.code if unit else None, "conflicts": kinds,
            })
    return {
        "summary": {"conflict_rows": len(conflicts), "invalid_phone_agents": len(invalid),
            "duplicate_phone_agents": len(duplicate_phone_ids),
            "agents_with_multiple_assignments": sum(value > 1 for value in agent_counts.values()),
            "over_capacity_polling_units": sum(len(ids) > polling_unit_capacity(db.get(PollingUnit, unit_id)) for unit_id, ids in unit_agents.items())},
        "conflicts": conflicts,
        "resolution_notice": "Review source records before correcting phones, reassigning, or removing an assignment. No conflict is resolved automatically.",
    }
