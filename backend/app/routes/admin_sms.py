import logging

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import SessionLocal, get_db
from ..models import AuditLog, User
from ..security import require_admin
from ..services.organization_service import sms_sender_name
from ..services.sms_service import send_sms
from ..utils.phone import normalize_nigerian_phone


router = APIRouter(prefix="/api/admin/sms", tags=["Admin SMS"])
logger = logging.getLogger(__name__)


class SmsSendRequest(BaseModel):
    message: str = Field(min_length=1, max_length=1000)
    send_to_all: bool = False
    user_ids: list[int] = Field(default_factory=list, max_length=5000)
    model_config = ConfigDict(extra="forbid")


def _valid_phone(phone_number: str | None) -> str | None:
    if not phone_number:
        return None
    try:
        return normalize_nigerian_phone(phone_number)
    except ValueError:
        return None


def _deliver_sms(recipients: list[str], message: str, sender: str | None, admin_id: int) -> None:
    sent = failed = 0
    for phone_number in recipients:
        try:
            delivered, _ = send_sms(recipient=phone_number, message=message, sender_name=sender)
        except Exception:
            logger.exception("Unexpected SMS delivery failure")
            delivered = False
        sent += int(delivered)
        failed += int(not delivered)
    with SessionLocal() as db:
        db.add(AuditLog(
            user_id=admin_id,
            action="COMPLETE_BULK_SMS",
            table_name="users",
            record_id=admin_id,
            old_data=None,
            new_data={"recipient_count": len(recipients), "sent": sent, "failed": failed},
        ))
        db.commit()


@router.get("/recipients")
def list_sms_recipients(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    users = db.scalars(
        select(User).where(User.is_active.is_(True)).order_by(User.full_name, User.id)
    ).all()
    recipients = []
    for user in users:
        phone_number = _valid_phone(user.phone_number)
        if phone_number:
            recipients.append({
                "id": user.id,
                "full_name": user.full_name,
                "phone_number": phone_number,
                "role": user.role,
            })
    return {"recipients": recipients, "count": len(recipients)}


@router.post("/send", status_code=202)
def send_admin_sms(
    payload: SmsSendRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    message = payload.message.strip()
    if not message:
        raise HTTPException(422, "Enter a message to send.")
    if not payload.send_to_all and not payload.user_ids:
        raise HTTPException(422, "Select at least one recipient or choose send to all.")

    query = select(User).where(User.is_active.is_(True))
    if not payload.send_to_all:
        query = query.where(User.id.in_(set(payload.user_ids)))
    users = db.scalars(query.order_by(User.id)).all()
    recipients = list(dict.fromkeys(
        phone for user in users if (phone := _valid_phone(user.phone_number))
    ))
    if not recipients:
        raise HTTPException(422, "None of the selected active users has a valid phone number.")

    sender = sms_sender_name(db)
    db.add(AuditLog(
        user_id=admin.id,
        action="QUEUE_BULK_SMS",
        table_name="users",
        record_id=admin.id,
        old_data=None,
        new_data={
            "recipient_count": len(recipients),
            "send_to_all": payload.send_to_all,
            "message_length": len(message),
        },
    ))
    db.commit()
    background_tasks.add_task(_deliver_sms, recipients, message, sender, admin.id)
    return {"queued": len(recipients), "message": f"SMS queued for {len(recipients)} recipient(s)."}
