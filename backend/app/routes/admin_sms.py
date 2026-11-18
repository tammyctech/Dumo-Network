import logging
import os

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import SessionLocal, get_db
from ..models import AgentAssignment, AuditLog, PollingUnit, User
from ..security import require_admin
from ..services.organization_service import sms_sender_name
from ..services.sms_service import send_sms
from ..utils.phone import normalize_nigerian_phone


router = APIRouter(prefix="/api/admin/sms", tags=["Admin SMS"])
logger = logging.getLogger(__name__)


class SmsSendRequest(BaseModel):
    message: str = Field(default="", max_length=1000)
    template_key: str | None = None
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


def _deliver_sms(deliveries: list[tuple[str, str]], sender: str | None, admin_id: int) -> None:
    sent = failed = 0
    for phone_number, message in deliveries:
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
            new_data={"recipient_count": len(deliveries), "sent": sent, "failed": failed},
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
    if payload.template_key not in {None, "assignment_login"}:
        raise HTTPException(422, "Choose a valid SMS template.")
    if not payload.template_key and not message:
        raise HTTPException(422, "Enter a message to send.")
    if not payload.send_to_all and not payload.user_ids:
        raise HTTPException(422, "Select at least one recipient or choose send to all.")

    query = select(User).where(User.is_active.is_(True))
    if not payload.send_to_all:
        query = query.where(User.id.in_(set(payload.user_ids)))
    users = db.scalars(query.order_by(User.id)).all()
    users_by_phone = {
        phone: user for user in users if (phone := _valid_phone(user.phone_number))
    }
    if not users_by_phone:
        raise HTTPException(422, "None of the selected active users has a valid phone number.")

    deliveries: list[tuple[str, str]] = []
    if payload.template_key == "assignment_login":
        assignments = db.execute(
            select(AgentAssignment.agent_id, PollingUnit)
            .join(PollingUnit, PollingUnit.id == AgentAssignment.polling_unit_id)
            .where(AgentAssignment.agent_id.in_([user.id for user in users_by_phone.values()]))
        ).all()
        units_by_agent = {agent_id: unit for agent_id, unit in assignments}
        login_url = f"{os.getenv('FRONTEND_URL', 'http://localhost:5173').rstrip('/')}/login"
        for phone, user in users_by_phone.items():
            unit = units_by_agent.get(user.id)
            assignment = (
                f"{unit.code}, {unit.name}, {unit.ward}, {unit.lga} LGA"
                if unit else "No polling unit is currently assigned"
            )
            personalized = (
                f"Hello {user.full_name}. Your Dumo Youth Network polling unit: {assignment}. "
                f"Login phone: {phone}. Sign in: {login_url}. "
                "Use Forgot password on the login page if you cannot remember your password."
            )
            deliveries.append((phone, personalized))
    else:
        deliveries = [(phone, message) for phone in users_by_phone]

    sender = sms_sender_name(db)
    db.add(AuditLog(
        user_id=admin.id,
        action="QUEUE_BULK_SMS",
        table_name="users",
        record_id=admin.id,
        old_data=None,
        new_data={
            "recipient_count": len(deliveries),
            "send_to_all": payload.send_to_all,
            "message_length": len(message) if not payload.template_key else None,
            "template_key": payload.template_key,
        },
    ))
    db.commit()
    background_tasks.add_task(_deliver_sms, deliveries, sender, admin.id)
    return {"queued": len(deliveries), "message": f"SMS queued for {len(deliveries)} recipient(s)."}
