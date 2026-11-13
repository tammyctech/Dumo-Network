from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from sqlalchemy import delete, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import (
    AgentApplication, AgentAssignment, AgentImportRow, AgentInvitation, AuditLog,
    Incident, PartyResult, PushSubscription, ResultEvidence, ResultFlag,
    ResultReview, ResultSubmission, User,
)
from app.security import get_current_user
from app.utils.phone import normalize_nigerian_phone


router = APIRouter(
    prefix="/api/admin/users",
    tags=["User Management"],
)


# ==========================================
# REQUEST SCHEMA
# ==========================================

class UserRoleUpdate(BaseModel):
    role: str


class UserUpdate(BaseModel):
    full_name: str = Field(min_length=2, max_length=150)
    email: EmailStr
    phone_number: str | None = Field(default=None, max_length=30)
    role: str
    is_active: bool
    model_config = ConfigDict(extra="forbid")


class DeleteAllAgentsRequest(BaseModel):
    confirmation: str
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
            detail="Account is inactive.",
        )

    if current_user.role != "admin":
        raise HTTPException(
            status_code=403,
            detail="Administrator access required.",
        )

    return current_user


# ==========================================
# USER RESPONSE HELPER
# ==========================================

def serialize_user(user: User):
    return {
        "id": user.id,
        "full_name": user.full_name,
        "email": user.email,
        "phone_number": user.phone_number,
        "role": user.role,
        "is_active": user.is_active,
    }


def delete_users_and_dependencies(db: Session, user_ids: list[int]) -> int:
    if not user_ids:
        return 0
    submission_ids = list(db.scalars(
        select(ResultSubmission.id).where(ResultSubmission.agent_id.in_(user_ids))
    ).all())
    if submission_ids:
        db.execute(delete(PartyResult).where(PartyResult.submission_id.in_(submission_ids)))
        db.execute(delete(ResultEvidence).where(ResultEvidence.submission_id.in_(submission_ids)))
        db.execute(delete(ResultReview).where(ResultReview.submission_id.in_(submission_ids)))
        db.execute(delete(ResultFlag).where(ResultFlag.submission_id.in_(submission_ids)))
    db.execute(delete(ResultReview).where(ResultReview.reviewer_id.in_(user_ids)))
    db.execute(update(ResultFlag).where(ResultFlag.resolved_by.in_(user_ids)).values(resolved_by=None))
    db.execute(delete(ResultSubmission).where(ResultSubmission.agent_id.in_(user_ids)))
    db.execute(update(Incident).where(Incident.assigned_to.in_(user_ids)).values(assigned_to=None))
    db.execute(delete(Incident).where(Incident.reported_by.in_(user_ids)))
    db.execute(delete(AgentAssignment).where(AgentAssignment.agent_id.in_(user_ids)))
    db.execute(delete(AgentInvitation).where(AgentInvitation.agent_id.in_(user_ids)))
    db.execute(delete(PushSubscription).where(PushSubscription.user_id.in_(user_ids)))
    db.execute(update(AgentImportRow).where(AgentImportRow.agent_id.in_(user_ids)).values(agent_id=None))
    db.execute(update(AgentApplication).where(AgentApplication.agent_id.in_(user_ids)).values(agent_id=None))
    db.execute(update(AgentApplication).where(AgentApplication.reviewed_by.in_(user_ids)).values(reviewed_by=None))
    db.execute(delete(AuditLog).where(AuditLog.user_id.in_(user_ids)))
    result = db.execute(delete(User).where(User.id.in_(user_ids)))
    return result.rowcount or 0


# ==========================================
# GET ALL USERS
# ==========================================

@router.get("")
def list_users(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    users = db.scalars(
        select(User).where(User.role.in_(("admin", "agent"))).order_by(User.id.desc())
    ).all()

    return {
        "total": len(users),
        "users": [
            serialize_user(user)
            for user in users
        ],
    }


# ==========================================
# UPDATE USER ROLE
# ==========================================

@router.patch("/{user_id}/role")
def update_user_role(
    user_id: int,
    payload: UserRoleUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    allowed_roles = {"agent"}

    new_role = payload.role.strip().lower()

    if new_role not in allowed_roles:
        raise HTTPException(
            status_code=400,
            detail="Role must be agent.",
        )

    user = db.get(User, user_id)

    if not user:
        raise HTTPException(
            status_code=404,
            detail="User not found.",
        )

    if user.id == admin.id:
        raise HTTPException(
            status_code=403,
            detail="You cannot change your own role.",
        )

    if user.role == "admin":
        raise HTTPException(
            status_code=403,
            detail="Administrator roles cannot be changed here.",
        )

    old_role = user.role

    if old_role == new_role:
        return {
            "message": "User already has this role.",
            "user": serialize_user(user),
        }

    user.role = new_role

    audit_log = AuditLog(
        user_id=admin.id,
        action="UPDATE_USER_ROLE",
        table_name="users",
        record_id=user.id,
        old_data={"role": old_role},
        new_data={"role": new_role},
    )

    db.add(audit_log)

    try:
        db.commit()
        db.refresh(user)

    except Exception:
        db.rollback()
        raise

    return {
        "message": "User role updated successfully.",
        "user": serialize_user(user),
    }


@router.patch("/{user_id}")
def update_user(
    user_id: int,
    payload: UserUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(404, "User not found.")
    if user.role == "admin" or user.id == admin.id:
        raise HTTPException(403, "Administrator accounts cannot be edited here.")
    role = payload.role.strip().lower()
    if role != "agent":
        raise HTTPException(422, "Role must be agent.")
    phone = None
    if payload.phone_number and payload.phone_number.strip():
        try:
            phone = normalize_nigerian_phone(payload.phone_number)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc
    old_data = serialize_user(user)
    user.full_name = payload.full_name.strip()
    user.email = str(payload.email).strip().lower()
    user.phone_number = phone
    user.role = role
    user.is_active = payload.is_active
    user.session_version += 1
    db.add(AuditLog(user_id=admin.id, action="UPDATE_USER", table_name="users",
                    record_id=user.id, old_data=old_data, new_data=serialize_user(user)))
    try:
        db.commit(); db.refresh(user)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, "That email address or phone number is already in use.") from exc
    return {"message": "User updated successfully.", "user": serialize_user(user)}


@router.delete("/agents")
def delete_all_agents(
    payload: DeleteAllAgentsRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    if payload.confirmation != "DELETE ALL AGENTS":
        raise HTTPException(400, "Type DELETE ALL AGENTS to confirm.")
    agent_ids = list(db.scalars(select(User.id).where(User.role == "agent")).all())
    deleted = delete_users_and_dependencies(db, agent_ids)
    db.add(AuditLog(user_id=admin.id, action="DELETE_ALL_AGENTS", table_name="users",
                    record_id=0, old_data={"agent_count": deleted}, new_data=None))
    db.commit()
    return {"message": f"Deleted {deleted} polling-unit agents.", "deleted": deleted}


@router.delete("/{user_id}")
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(404, "User not found.")
    if user.id == admin.id or user.role == "admin":
        raise HTTPException(403, "Administrator accounts cannot be deleted here.")
    snapshot = serialize_user(user)
    deleted = delete_users_and_dependencies(db, [user.id])
    db.add(AuditLog(user_id=admin.id, action="DELETE_USER", table_name="users",
                    record_id=user_id, old_data=snapshot, new_data=None))
    db.commit()
    return {"message": "User deleted successfully.", "deleted": deleted}
