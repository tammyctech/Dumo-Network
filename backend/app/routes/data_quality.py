from collections import Counter, defaultdict

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import AgentAssignment, PollingUnit, User, Ward
from app.security import require_admin
from app.services.agent_integrity import polling_unit_capacity
from app.utils.phone import normalize_nigerian_phone
from app.services.electoral_lookup import normalize_lga
from app.wards.routes import RIVERS_LGAS

router = APIRouter(prefix="/api/admin/data-quality", tags=["Agent Data Quality"])


@router.get("")
def data_quality(
    lga: str | None = Query(default=None),
    ward_number: int | None = Query(default=None, ge=1),
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
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
    units = db.scalars(select(PollingUnit).where(PollingUnit.state.ilike("Rivers"))).all()
    wards = db.scalars(select(Ward).where(Ward.state.ilike("Rivers"))).all()
    assignment_counts = dict(db.execute(
        select(AgentAssignment.polling_unit_id, func.count(AgentAssignment.id))
        .join(User, User.id == AgentAssignment.agent_id)
        .where(User.is_active.is_(True)).group_by(AgentAssignment.polling_unit_id)
    ).all())
    ward_keys = {(ward.lga.strip().casefold(), ward.name.strip().casefold()) for ward in wards}
    invalid_lga_units = [unit for unit in units if unit.lga.strip().casefold() not in {name.casefold() for name in RIVERS_LGAS}]
    missing_ward_units = [unit for unit in units if (unit.lga.strip().casefold(), unit.ward.strip().casefold()) not in ward_keys]
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
    lga_coverage = []
    for official_lga in RIVERS_LGAS:
        lga_units = [unit for unit in units if unit.lga.strip().casefold() == official_lga.casefold()]
        lga_wards = [ward for ward in wards if ward.lga.strip().casefold() == official_lga.casefold()]
        assigned_agents = sum(assignment_counts.get(unit.id, 0) for unit in lga_units)
        occupied = sum(assignment_counts.get(unit.id, 0) > 0 for unit in lga_units)
        total_slots = sum(polling_unit_capacity(unit) for unit in lga_units)
        lga_coverage.append({"lga": official_lga, "total_wards": len(lga_wards),
            "total_polling_units": len(lga_units), "assigned_agents": assigned_agents,
            "occupied_polling_units": occupied, "vacant_polling_units": len(lga_units)-occupied,
            "available_slots": max(0, total_slots-assigned_agents),
            "coverage_percentage": round(100*occupied/len(lga_units), 2) if lga_units else 0})

    selected_lga = None
    if lga:
        try: selected_lga = normalize_lga(lga)
        except ValueError as exc: raise HTTPException(422, str(exc)) from exc
    ward_coverage = []
    polling_unit_coverage = []
    if selected_lga:
        selected_wards = sorted((ward for ward in wards if ward.lga.strip().casefold()==selected_lga.casefold()), key=lambda item:item.ward_number)
        for ward in selected_wards:
            ward_units = [unit for unit in units if unit.lga.strip().casefold()==selected_lga.casefold() and unit.ward.strip().casefold()==ward.name.strip().casefold()]
            assigned = sum(assignment_counts.get(unit.id,0) for unit in ward_units)
            occupied = sum(assignment_counts.get(unit.id,0)>0 for unit in ward_units)
            ward_coverage.append({"ward_number":ward.ward_number,"ward_name":ward.name,
                "total_polling_units":len(ward_units),"assigned_agents":assigned,
                "occupied_polling_units":occupied,"vacant_polling_units":len(ward_units)-occupied,
                "coverage_percentage":round(100*occupied/len(ward_units),2) if ward_units else 0})
            if ward_number == ward.ward_number:
                for unit in sorted(ward_units,key=lambda item:item.code):
                    assigned_count=assignment_counts.get(unit.id,0);capacity=polling_unit_capacity(unit)
                    polling_unit_coverage.append({"id":unit.id,"code":unit.code,"name":unit.name,
                        "assigned_agents":assigned_count,"capacity":capacity,
                        "available_slots":max(0,capacity-assigned_count),
                        "status":"Full" if assigned_count>=capacity else "Available"})

    return {
        "summary": {"conflict_rows": len(conflicts), "invalid_phone_agents": len(invalid),
            "duplicate_phone_agents": len(duplicate_phone_ids),
            "agents_with_multiple_assignments": sum(value > 1 for value in agent_counts.values()),
            "over_capacity_polling_units": sum(len(ids) > polling_unit_capacity(db.get(PollingUnit, unit_id)) for unit_id, ids in unit_agents.items()),
            "missing_ward_references": len(missing_ward_units), "invalid_lga_references": len(invalid_lga_units)},
        "conflicts": conflicts,
        "lga_coverage": lga_coverage,
        "ward_coverage": ward_coverage,
        "polling_unit_coverage": polling_unit_coverage,
        "resolution_notice": "Review source records before correcting phones, reassigning, or removing an assignment. No conflict is resolved automatically.",
    }
