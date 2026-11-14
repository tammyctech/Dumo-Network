import logging
import os
from html import escape

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
    Ward,
)
from app.security import get_current_user
from app.services.email_service import send_system_email
from app.services.sms_service import send_sms
from app.services.organization_service import sms_sender_name


router = APIRouter(
    prefix="/api/admin/assignments",
    tags=["Agent Assignment Management"],
)
logger = logging.getLogger(__name__)


class ReassignRequest(BaseModel):
    polling_unit_id: int = Field(gt=0)
    model_config = ConfigDict(extra="forbid")


def _send_reassignment_email(agent: User, old_unit: PollingUnit, new_unit: PollingUnit) -> tuple[bool, str | None]:
    email = agent.email.casefold()
    if email.endswith(".invalid") or email.endswith("@dumo-network.vercel.app"):
        return False, "The agent has not added a deliverable email address."
    login_url = f"{os.getenv('FRONTEND_URL', 'http://localhost:5173').rstrip('/')}/login"
    plain = f"""Hello {agent.full_name},

Your permanent polling-unit assignment has been changed by an administrator.

Previous assignment:
LGA: {old_unit.lga}
Ward: {old_unit.ward}
Polling unit: {old_unit.code} - {old_unit.name}

New assignment:
LGA: {new_unit.lga}
Ward: {new_unit.ward}
Polling unit: {new_unit.code} - {new_unit.name}

Your new assignment applies to all current and future elections. Sign in to view your dashboard: {login_url}
"""
    html = f"""<h2 style="color:#047857">Polling-unit reassignment</h2>
<p>Hello {escape(agent.full_name)},</p><p>Your permanent polling-unit assignment has been changed by an administrator.</p>
<div style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:12px;padding:18px;margin:16px 0"><strong>Previous assignment</strong><br>LGA: {escape(old_unit.lga)}<br>Ward: {escape(old_unit.ward)}<br>Polling unit: {escape(old_unit.code)} &middot; {escape(old_unit.name)}</div>
<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:18px;margin:16px 0"><strong>New assignment</strong><br>LGA: {escape(new_unit.lga)}<br>Ward: {escape(new_unit.ward)}<br>Polling unit: {escape(new_unit.code)} &middot; {escape(new_unit.name)}</div>
<p>Your new assignment applies to <strong>all current and future elections</strong>.</p><p><a href="{escape(login_url)}">Go to login</a></p>"""
    try:
        return send_system_email(
            recipient=agent.email,
            subject="Your polling-unit assignment has changed",
            plain_text=plain,
            html=html,
        )
    except Exception as exc:
        logger.exception("Unexpected reassignment email failure for agent %s", agent.id)
        return False, f"Email delivery error: {type(exc).__name__}."


def _send_reassignment_sms(db: Session, agent: User, old_unit: PollingUnit, new_unit: PollingUnit) -> tuple[bool, str | None]:
    if not agent.phone_number:
        return False, "The agent does not have a phone number."
    return send_sms(
        recipient=agent.phone_number,
        message=(
            f"Hello {agent.full_name}, your Dumo polling-unit assignment changed from "
            f"{old_unit.lga}, {old_unit.ward}, {old_unit.code} to "
            f"{new_unit.lga}, {new_unit.ward}, {new_unit.code}. This applies to all elections."
        ), sender_name=sms_sender_name(db),
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
            User.role == "agent",
        )
        .order_by(AgentAssignment.id.desc())
    ).all()

    assignments = []
    ward_numbers = {
        (ward.lga.casefold(), ward.name.casefold()): ward.ward_number
        for ward in db.scalars(select(Ward).where(Ward.state == "Rivers")).all()
    }

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
                    "ward_number": ward_numbers.get((unit.lga.casefold(), unit.ward.casefold())),
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
    agent = db.get(User, assignment.agent_id)
    if old_unit is None or new_unit is None or agent is None:
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
    email_sent, email_error = _send_reassignment_email(agent, old_unit, new_unit)
    sms_sent, sms_error = _send_reassignment_sms(db, agent, old_unit, new_unit)
    return {
        "message": "Agent reassigned successfully for all elections.",
        "assignment_id": assignment.id,
        "polling_unit_id": new_unit.id,
        "email_sent": email_sent,
        "email_error": email_error,
        "sms_sent": sms_sent,
        "sms_error": sms_error,
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
