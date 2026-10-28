from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User, AuditLog
from app.security import get_current_user


router = APIRouter(
    prefix="/api/admin/users",
    tags=["User Management"],
)


# ==========================================
# REQUEST SCHEMA
# ==========================================

class UserRoleUpdate(BaseModel):
    role: str


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
        "role": user.role,
        "is_active": user.is_active,
    }


# ==========================================
# GET ALL USERS
# ==========================================

@router.get("")
def list_users(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    users = db.scalars(
        select(User).order_by(User.id.desc())
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
    allowed_roles = {"agent", "observer"}

    new_role = payload.role.strip().lower()

    if new_role not in allowed_roles:
        raise HTTPException(
            status_code=400,
            detail="Role must be agent or observer.",
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