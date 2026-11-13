import os
import logging
from html import escape

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, ConfigDict, EmailStr, Field

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import AgentApplication, AgentAssignment, PollingUnit, User
from ..utils.phone import normalize_nigerian_phone

from ..schemas import (
    UserResponse,
    TokenResponse,
    UserProfileUpdate,
    ChangePasswordRequest,
)

from ..security import (
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    decode_refresh_token,
    create_password_reset_token,
    decode_password_reset_token,
    get_current_user,
)
from ..services.email_service import send_system_email


# ==========================================
# AUTHENTICATION ROUTER
# ==========================================

router = APIRouter(
    prefix="/api/auth",
    tags=["Authentication"],
)
logger = logging.getLogger(__name__)


def _send_first_login_welcome_email(db: Session, user: User) -> None:
    assignment = db.execute(
        select(AgentAssignment, PollingUnit)
        .join(PollingUnit, AgentAssignment.polling_unit_id == PollingUnit.id)
        .where(AgentAssignment.agent_id == user.id)
        .order_by(AgentAssignment.id)
    ).first()
    if assignment:
        _, unit = assignment
        location_text = (
            f"LGA: {unit.lga}\nWard: {unit.ward}\n"
            f"Polling unit: {unit.code} - {unit.name}"
        )
        location_html = (
            f"<strong>LGA:</strong> {escape(unit.lga)}<br>"
            f"<strong>Ward:</strong> {escape(unit.ward)}<br>"
            f"<strong>Polling unit:</strong> {escape(unit.code)} &middot; {escape(unit.name)}"
        )
    else:
        location_text = "Your polling-unit assignment will appear on your dashboard when it is available."
        location_html = escape(location_text)
    login_url = f"{os.getenv('FRONTEND_URL', 'http://localhost:5173').rstrip('/')}/login"
    plain = f"""Hello {user.full_name},

Welcome to the Dumo Youth Network Election Monitoring System. Your account setup is complete.

Your permanent assignment:
{location_text}

This assignment covers all current and future elections. Please submit accurate results promptly, report incidents through the Incident Centre, and keep your password private.

Sign in: {login_url}
"""
    html = f"""<h2 style="color:#047857">Welcome to Dumo Youth Network</h2>
<p>Hello {escape(user.full_name)},</p><p>Your account setup is complete. You can now use the Election Monitoring System.</p>
<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:18px"><strong>Your permanent assignment</strong><br>{location_html}</div>
<p>Your assignment covers <strong>all current and future elections</strong>.</p>
<ul><li>Submit accurate polling-unit results promptly.</li><li>Report incidents through the Incident Centre.</li><li>Keep your password private and never share your account.</li></ul>
<p><a href="{escape(login_url)}" style="display:inline-block;background:#047857;color:white;text-decoration:none;border-radius:10px;padding:12px 20px;font-weight:bold">Go to login</a></p>"""
    try:
        sent, error = send_system_email(
            recipient=user.email,
            subject="Welcome to Dumo Youth Network Election Monitoring",
            plain_text=plain,
            html=html,
        )
        if not sent:
            logger.warning("Welcome email was not sent to user %s: %s", user.id, error)
    except Exception:
        logger.exception("Unexpected welcome email failure for user %s", user.id)


class ForgotPasswordRequest(BaseModel):
    email: EmailStr
    model_config = ConfigDict(extra="forbid")


class ResetPasswordRequest(BaseModel):
    token: str = Field(min_length=20)
    new_password: str = Field(min_length=8, max_length=128)
    confirm_password: str = Field(min_length=8, max_length=128)
    model_config = ConfigDict(extra="forbid")


class RefreshTokenRequest(BaseModel):
    refresh_token: str = Field(min_length=20)
    model_config = ConfigDict(extra="forbid")


@router.post("/forgot-password")
def forgot_password(payload: ForgotPasswordRequest, db: Session = Depends(get_db)):
    generic = {"message": "If an active account uses that email, a password-reset link has been sent."}
    user = db.scalar(select(User).where(User.email == str(payload.email).strip().lower()))
    if user is None or not user.is_active or user.role not in {"admin", "agent"}:
        return generic
    token = create_password_reset_token(user.id, user.session_version)
    reset_url = f"{os.getenv('FRONTEND_URL', 'http://localhost:5173').rstrip('/')}/reset-password?token={token}"
    safe_name = escape(user.full_name)
    sent, _ = send_system_email(
        recipient=user.email,
        subject="Reset your Dumo Network password",
        plain_text=f"Hello {user.full_name},\n\nUse this link within 30 minutes to reset your password:\n{reset_url}\n\nIf you did not request this, ignore this email.",
        html=f'<p>Hello {safe_name},</p><p>Use the button below within 30 minutes to reset your password.</p><p><a href="{escape(reset_url)}">Reset password</a></p><p>If you did not request this, ignore this email.</p>',
    )
    if not sent:
        return generic
    return generic


@router.post("/reset-password")
def reset_password(payload: ResetPasswordRequest, db: Session = Depends(get_db)):
    if payload.new_password != payload.confirm_password:
        raise HTTPException(422, "New passwords do not match")
    try:
        user_id, version = decode_password_reset_token(payload.token)
    except ValueError as exc:
        raise HTTPException(400, "This password-reset link is invalid or has expired.") from exc
    user = db.get(User, user_id)
    if user is None or not user.is_active or user.session_version != version:
        raise HTTPException(400, "This password-reset link is invalid or has expired.")
    if verify_password(payload.new_password, user.hashed_password):
        raise HTTPException(400, "New password must be different from the current password")
    user.hashed_password = hash_password(payload.new_password)
    user.must_change_password = False
    user.session_version += 1
    db.commit()
    return {"message": "Password reset successfully. You can now sign in."}


@router.post("/refresh", response_model=TokenResponse)
def refresh_session(payload: RefreshTokenRequest, db: Session = Depends(get_db)):
    try:
        user_id, version = decode_refresh_token(payload.refresh_token)
    except ValueError as exc:
        raise HTTPException(401, "Invalid or expired session") from exc
    user = db.get(User, user_id)
    if (
        user is None
        or not user.is_active
        or user.role not in {"admin", "agent"}
        or user.session_version != version
    ):
        raise HTTPException(401, "Invalid or expired session")
    return {
        "access_token": create_access_token(user.id, user.session_version),
        "refresh_token": create_refresh_token(user.id, user.session_version),
        "token_type": "bearer",
    }


# ==========================================
# LOGIN USER
# ==========================================

@router.post(
    "/login",
    response_model=TokenResponse,
)
def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    """
    Authenticate a user and return an access token.
    """

    identifier = form_data.username.strip()
    user = None
    pending_application = None
    try:
        phone = normalize_nigerian_phone(identifier)
        user = db.scalar(select(User).where(User.phone_number == phone))
        pending_application = db.scalar(
            select(AgentApplication.id).where(
                AgentApplication.phone_number == phone,
                AgentApplication.status == "pending",
            )
        )
    except ValueError:
        email = identifier.lower()
        user = db.scalar(select(User).where(User.email == email))
        pending_application = db.scalar(
            select(AgentApplication.id).where(
                AgentApplication.email == email,
                AgentApplication.status == "pending",
            )
        )

    if user is None:
        if pending_application is not None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your agent account has not been approved by the admin yet.",
            )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email/phone number or password",
        )

    if not verify_password(
        form_data.password,
        user.hashed_password,
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email/phone number or password",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is inactive",
        )

    if user.role not in {"admin", "agent"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account type is no longer supported.",
        )

    return {
        "access_token": create_access_token(user.id, user.session_version),
        "refresh_token": create_refresh_token(user.id, user.session_version),
        "token_type": "bearer",
    }


# ==========================================
# GET CURRENT USER PROFILE
# ==========================================

@router.get(
    "/me",
    response_model=UserResponse,
)
def get_profile(
    current_user: User = Depends(get_current_user),
):
    """
    Return the authenticated user's profile.
    """

    return current_user


# ==========================================
# UPDATE CURRENT USER PROFILE
# ==========================================

@router.patch(
    "/me",
    response_model=UserResponse,
)
def update_profile(
    profile_data: UserProfileUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Update the authenticated user's profile.

    Only full_name and phone_number can be updated.
    """

    updates = profile_data.model_fields_set

    # --------------------------------------
    # UPDATE FULL NAME
    # --------------------------------------

    if "full_name" in updates:

        if profile_data.full_name is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Full name cannot be null",
            )

        full_name = profile_data.full_name.strip()

        if len(full_name) < 2:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    "Full name must contain at least "
                    "2 characters"
                ),
            )

        current_user.full_name = full_name

    # --------------------------------------
    # UPDATE PHONE NUMBER
    # --------------------------------------

    if "phone_number" in updates:

        phone_number = profile_data.phone_number

        if phone_number is not None:

            phone_number = phone_number.strip()

            if not phone_number:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Phone number cannot be empty",
                )

            if not phone_number.lstrip("+").isdigit():
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=(
                        "Phone number must contain only "
                        "digits or a leading +"
                    ),
                )

            if len(phone_number.lstrip("+")) < 7:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Phone number is too short",
                )

            if phone_number.count("+") > 1:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Phone number has an invalid format",
                )

        current_user.phone_number = phone_number

    # --------------------------------------
    # SAVE PROFILE CHANGES
    # --------------------------------------

    try:
        db.commit()

    except IntegrityError:
        db.rollback()

        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Phone number is already registered",
        )

    db.refresh(current_user)

    return current_user


# ==========================================
# CHANGE PASSWORD
# ==========================================

@router.post(
    "/change-password",
    status_code=status.HTTP_200_OK,
)
def change_password(
    password_data: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Allow an authenticated user to change
    their password securely.

    Requires:
    - Current password
    - New password
    - Confirm new password
    """

    first_login = current_user.must_change_password
    if first_login and password_data.email is None:
        raise HTTPException(422, "Enter your email address to complete first-time setup")
    if password_data.email is not None:
        email = str(password_data.email).strip().lower()
        owner = db.scalar(select(User.id).where(User.email == email, User.id != current_user.id))
        if owner is not None:
            raise HTTPException(409, "Email address is already registered")
        current_user.email = email

    # --------------------------------------
    # VERIFY CURRENT PASSWORD
    # --------------------------------------

    if not verify_password(
        password_data.current_password,
        current_user.hashed_password,
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect",
        )

    # --------------------------------------
    # CONFIRM NEW PASSWORD
    # --------------------------------------

    if (
        password_data.new_password
        != password_data.confirm_password
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="New passwords do not match",
        )

    # --------------------------------------
    # VALIDATE PASSWORD LENGTH
    # --------------------------------------

    if len(password_data.new_password) < 8:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "New password must contain at least "
                "8 characters"
            ),
        )

    # --------------------------------------
    # PREVENT PASSWORD REUSE
    # --------------------------------------

    if verify_password(
        password_data.new_password,
        current_user.hashed_password,
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "New password must be different "
                "from current password"
            ),
        )

    # --------------------------------------
    # HASH NEW PASSWORD
    # --------------------------------------

    new_password_hash = hash_password(
        password_data.new_password
    )

    current_user.hashed_password = new_password_hash
    current_user.must_change_password = False
    current_user.session_version += 1

    # --------------------------------------
    # SAVE NEW PASSWORD
    # --------------------------------------

    try:
        db.commit()

    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email address is already registered",
        )
    except Exception:
        db.rollback()

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to change password",
        )

    if first_login:
        _send_first_login_welcome_email(db, current_user)

    return {
        "message": "Password changed successfully. Please sign in again.",
    }
