import os
import secrets

from datetime import datetime, timedelta, timezone

from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import AgentInvitation, User
from ..schemas import (
    AgentCreate,
    AgentCreatedResponse,
    AgentResponse,
)
from ..security import hash_password, require_admin
from ..utils.invitations import (
    generate_invitation_token,
    hash_invitation_token,
)


load_dotenv()

router = APIRouter(
    prefix="/api/admin/agents",
    tags=["Admin - Agents"],
)

# Configure this to match the address agents will use.
FRONTEND_URL = os.getenv(
    "FRONTEND_URL",
    "http://localhost:5173",
).rstrip("/")


# ============================================================
# CREATE AGENT AND ACTIVATION INVITATION
# ============================================================

@router.post(
    "",
    response_model=AgentCreatedResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_agent(
    payload: AgentCreate,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    """
    Create an inactive agent and a one-time activation invitation.

    Only administrators may access this endpoint.
    """

    full_name = payload.full_name.strip()
    email = str(payload.email).strip().lower()
    phone_number = payload.phone_number

    if len(full_name) < 2:
        raise HTTPException(
            status_code=422,
            detail="Full name must contain at least 2 characters.",
        )

    existing_email = db.scalar(
        select(User).where(User.email == email)
    )

    if existing_email is not None:
        raise HTTPException(
            status_code=409,
            detail="An account with this email already exists.",
        )

    existing_phone = db.scalar(
        select(User).where(User.phone_number == phone_number)
    )

    if existing_phone is not None:
        raise HTTPException(
            status_code=409,
            detail="An account with this phone number already exists.",
        )

    # Generate an unknown password.
    # The agent will replace it during activation.
    unusable_password = secrets.token_urlsafe(48)

    # Generate a secure invitation.
    invitation_token = generate_invitation_token()
    invitation_hash = hash_invitation_token(invitation_token)

    expires_at = datetime.now(timezone.utc) + timedelta(hours=24)

    agent = User(
        full_name=full_name,
        email=email,
        phone_number=phone_number,
        hashed_password=hash_password(unusable_password),
        role="agent",
        is_active=False,
    )

    try:
        db.add(agent)

        # Obtain the new agent ID without committing yet.
        db.flush()

        invitation = AgentInvitation(
            agent_id=agent.id,
            token_hash=invitation_hash,
            expires_at=expires_at,
        )

        db.add(invitation)

        # Both records are committed together.
        db.commit()

        db.refresh(agent)

    except IntegrityError:
        db.rollback()

        raise HTTPException(
            status_code=409,
            detail="An account with this email or phone number already exists.",
        )

    except Exception:
        db.rollback()
        raise

    activation_url = (
        f"{FRONTEND_URL}/activate-agent"
        f"#token={invitation_token}"
    )

    return AgentCreatedResponse(
        id=agent.id,
        full_name=agent.full_name,
        email=agent.email,
        phone_number=agent.phone_number,
        role=agent.role,
        is_active=agent.is_active,
        activation_url=activation_url,
        invitation_expires_at=expires_at,
    )


# ============================================================
# LIST REGISTERED AGENTS
# ============================================================

@router.get(
    "",
    response_model=list[AgentResponse],
)
def list_agents(
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    """
    List registered agents.

    Restricted to administrators because
    responses contain agents' phone numbers.
    """

    agents = db.scalars(
        select(User)
        .where(User.role == "agent")
        .order_by(User.id.desc())
    ).all()

    return agents