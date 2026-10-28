from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import AgentInvitation, User
from ..schemas import AgentActivationRequest
from ..security import hash_password
from ..utils.invitations import hash_invitation_token


router = APIRouter(
    prefix="/api/agents",
    tags=["Agent Activation"],
)


@router.post("/activate")
def activate_agent(
    payload: AgentActivationRequest,
    db: Session = Depends(get_db),
):
    """
    Activate an administrator-created agent account.

    The invitation must:
    - Exist
    - Be unused
    - Be unexpired
    - Belong to an inactive agent
    """

    token_hash = hash_invitation_token(payload.token)

    # Lock the invitation row to prevent simultaneous activation.
    invitation = db.scalar(
        select(AgentInvitation)
        .where(AgentInvitation.token_hash == token_hash)
        .with_for_update()
    )

    if invitation is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired invitation.",
        )

    now = datetime.now(timezone.utc)

    if invitation.used_at is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This invitation has already been used.",
        )

    if invitation.expires_at <= now:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This invitation has expired.",
        )

    agent = db.get(User, invitation.agent_id, with_for_update=True)

    if agent is None or agent.role != "agent":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid agent account.",
        )

    if agent.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This account is already active.",
        )

    agent.hashed_password = hash_password(payload.password)
    agent.is_active = True

    invitation.used_at = now

    # Password update, activation and token use are atomic.
    db.commit()

    return {
        "message": (
            "Agent account activated successfully. "
            "You can now log in."
        )
    }