from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import User
from ..security import require_admin
from ..services.email_service import send_bulk_system_email
from ..services.organization_service import email_sender_name


router = APIRouter(prefix="/api/admin/email", tags=["Admin Email"])


class BulkEmailRequest(BaseModel):
    subject: str = Field(min_length=2, max_length=150)
    body: str = Field(min_length=2, max_length=5000)
    model_config = ConfigDict(extra="forbid")


def _deliverable(email: str) -> bool:
    lowered = email.casefold()
    return not lowered.endswith(".invalid") and not lowered.endswith("@dumo-network.vercel.app")


@router.post("/send-all")
def send_all_users(
    payload: BulkEmailRequest,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    users = db.scalars(
        select(User).where(
            User.is_active.is_(True),
            User.role.in_(("admin", "agent")),
        ).order_by(User.id)
    ).all()
    recipients = [(user.email, user.full_name) for user in users if _deliverable(user.email)]
    skipped = len(users) - len(recipients)
    if not recipients:
        raise HTTPException(422, "No active users have a deliverable email address.")
    sent, failed, error = send_bulk_system_email(
        recipients=recipients,
        subject=payload.subject.strip(),
        body=payload.body.strip(),
        sender_name=email_sender_name(db),
    )
    return {"message": "Email campaign processed.", "target_users": len(users), "sent": sent, "failed": failed, "skipped": skipped, "error": error}
