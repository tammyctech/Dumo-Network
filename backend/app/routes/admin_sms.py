import logging
import os
from uuid import uuid4

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

VOTE_AWARENESS_MESSAGE = """YOUR FUTURE IS WORTH MORE THAN ₦5,000 OR ₦10,000!

Dear Dumo Youth Network Members, as we approach the 2027 elections, remember that selling your vote means risking years of good governance for temporary financial gain. Your vote is your voice, your power, and your future. Say NO to vote buying. Together, let's build a better Rivers State.

Tell someone to tell someone to vote Chief Dumo Lulu-Briggs come February 6, 2027.

Tamunotonye Adokiye Emmanuel
Coordinator, DYN"""


class SmsSendRequest(BaseModel):
    message: str = Field(default="", max_length=1000)
    template_key: str | None = None
    send_to_all: bool = False
    lga: str | None = Field(default=None, max_length=100)
    user_ids: list[int] = Field(default_factory=list, max_length=5000)
    phone_numbers: list[str] = Field(default_factory=list, max_length=100)
    model_config = ConfigDict(extra="forbid")


def _valid_phone(phone_number: str | None) -> str | None:
    if not phone_number:
        return None


def _assignment_login_message(
    *, full_name: str, phone: str, polling_unit: PollingUnit | None, login_url: str,
    must_change_password: bool, default_password: str,
) -> str:
    first_name = full_name.strip().split(maxsplit=1)[0] if full_name.strip() else "Agent"
    password = (
        f"Temp password {default_password}."
        if must_change_password
        else "Use your current password."
    )
    locations = []
    if polling_unit:
        locations = [
            f"PU {polling_unit.code}, {polling_unit.ward}, {polling_unit.lga} LGA",
            f"PU {polling_unit.code}, {polling_unit.lga} LGA",
            f"PU {polling_unit.code}",
        ]
    else:
        locations = ["No PU assigned"]
    for location in locations:
        message = f"Dear {first_name}, You've been assigned to {location}. Login {phone} at {login_url}. {password}"
        if len(message) <= 160:
            return message
    # The final variant is normally well below one GSM segment. Keep the link
    # and login credentials intact if an unusually long deployment URL is used.
    return f"Dear {first_name}, You've been assigned to {locations[-1]}. Login {phone} at {login_url}. {password}"
    try:
        return normalize_nigerian_phone(phone_number)
    except ValueError:
        return None


def _deliver_sms(
    deliveries: list[tuple[str, str]],
    sender: str | None,
    admin_id: int,
    audit_data: dict,
) -> None:
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
            new_data={**audit_data, "sent": sent, "failed": failed},
        ))
        db.commit()


@router.get("/recipients")
def list_sms_recipients(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    users = db.scalars(
        select(User).where(User.is_active.is_(True)).order_by(User.full_name, User.id)
    ).all()
    assignments = db.execute(
        select(AgentAssignment.agent_id, PollingUnit.lga)
        .join(PollingUnit, PollingUnit.id == AgentAssignment.polling_unit_id)
    ).all()
    lga_by_user = {agent_id: lga for agent_id, lga in assignments}
    recipients = []
    for user in users:
        phone_number = _valid_phone(user.phone_number)
        if phone_number:
            recipients.append({
                "id": user.id,
                "full_name": user.full_name,
                "phone_number": phone_number,
                "role": user.role,
                "lga": lga_by_user.get(user.id),
            })
    return {"recipients": recipients, "count": len(recipients)}


@router.get("/history")
def list_sms_history(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    logs = db.scalars(
        select(AuditLog)
        .where(AuditLog.action.in_(["QUEUE_BULK_SMS", "COMPLETE_BULK_SMS"]))
        .order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
        .limit(200)
    ).all()
    def history_item(log: AuditLog, data: dict, status: str) -> dict:
        return {
            "id": log.id,
            "created_at": log.created_at,
            "lga": data.get("lga"),
            "send_to_all": bool(data.get("send_to_all")),
            "recipient_count": data.get("recipient_count", 0),
            "sent": data.get("sent"),
            "failed": data.get("failed"),
            "template_key": data.get("template_key"),
            "external_recipient_count": data.get("external_recipient_count", 0),
            "status": status,
        }

    history: list[dict] = []
    seen_campaigns: set[str] = set()
    legacy_queues: list[AuditLog] = []
    legacy_completions: list[AuditLog] = []
    for log in logs:
        data = log.new_data or {}
        campaign_id = data.get("campaign_id")
        if not campaign_id:
            if log.action == "QUEUE_BULK_SMS":
                legacy_queues.append(log)
            else:
                legacy_completions.append(log)
            continue
        if campaign_id in seen_campaigns:
            continue
        seen_campaigns.add(campaign_id)
        status = "completed" if log.action == "COMPLETE_BULK_SMS" else "queued"
        history.append(history_item(log, data, status))

    # Campaign IDs were added after SMS auditing was already in use. Pair the
    # older queue and completion rows by administrator, recipient count and
    # timing so one actual send does not appear twice in history.
    used_completion_ids: set[int] = set()
    for queued in legacy_queues:
        queued_data = queued.new_data or {}
        candidates = [
            completed for completed in legacy_completions
            if completed.id not in used_completion_ids
            and completed.user_id == queued.user_id
            and (completed.new_data or {}).get("recipient_count") == queued_data.get("recipient_count")
            and completed.created_at >= queued.created_at
            and (completed.created_at - queued.created_at).total_seconds() <= 21600
        ]
        if candidates:
            completed = min(candidates, key=lambda item: item.created_at - queued.created_at)
            used_completion_ids.add(completed.id)
            merged_data = {**queued_data, **(completed.new_data or {})}
            history.append(history_item(queued, merged_data, "completed"))
        else:
            history.append(history_item(queued, queued_data, "queued"))

    for completed in legacy_completions:
        if completed.id not in used_completion_ids:
            history.append(history_item(completed, completed.new_data or {}, "completed"))

    history.sort(key=lambda item: (item["created_at"], item["id"]), reverse=True)
    history = history[:50]
    return {"history": history, "count": len(history)}


@router.post("/send", status_code=202)
def send_admin_sms(
    payload: SmsSendRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    message = payload.message.strip()
    if payload.template_key not in {None, "assignment_login", "vote_awareness"}:
        raise HTTPException(422, "Choose a valid SMS template.")
    if payload.template_key == "vote_awareness":
        message = VOTE_AWARENESS_MESSAGE
    if not payload.template_key and not message:
        raise HTTPException(422, "Enter a message to send.")
    if not payload.send_to_all and not payload.user_ids and not payload.phone_numbers:
        raise HTTPException(422, "Select a recipient, enter a phone number, or choose send to all.")
    if payload.template_key == "assignment_login" and payload.phone_numbers:
        raise HTTPException(422, "The login details template can only be sent to registered users.")

    external_phones: list[str] = []
    invalid_phones: list[str] = []
    for raw_phone in payload.phone_numbers:
        phone = _valid_phone(raw_phone)
        if phone:
            external_phones.append(phone)
        else:
            invalid_phones.append(raw_phone)
    if invalid_phones:
        raise HTTPException(422, "Enter a valid Nigerian mobile phone number.")

    query = select(User).where(User.is_active.is_(True))
    selected_lga = payload.lga.strip() if payload.lga else None
    if payload.send_to_all and selected_lga:
        query = (
            query.join(AgentAssignment, AgentAssignment.agent_id == User.id)
            .join(PollingUnit, PollingUnit.id == AgentAssignment.polling_unit_id)
            .where(PollingUnit.lga == selected_lga)
        )
    if not payload.send_to_all:
        query = query.where(User.id.in_(set(payload.user_ids)))
    users = db.scalars(query.order_by(User.id)).all()
    users_by_phone = {
        phone: user for user in users if (phone := _valid_phone(user.phone_number))
    }
    if not users_by_phone and not external_phones:
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
        default_password = os.getenv("DEFAULT_AGENT_PASSWORD", "12345")
        for phone, user in users_by_phone.items():
            unit = units_by_agent.get(user.id)
            personalized = _assignment_login_message(
                full_name=user.full_name,
                phone=phone,
                polling_unit=unit,
                login_url=login_url,
                must_change_password=user.must_change_password,
                default_password=default_password,
            )
            deliveries.append((phone, personalized))
    else:
        # A number may have been entered manually while also belonging to a
        # selected user. Dict keys keep each normalized number to one delivery.
        recipient_phones = dict.fromkeys([*users_by_phone, *external_phones])
        deliveries = [(phone, message) for phone in recipient_phones]

    sender = sms_sender_name(db)
    audit_data = {
        "campaign_id": str(uuid4()),
        "recipient_count": len(deliveries),
        "send_to_all": payload.send_to_all,
        "lga": selected_lga,
        "message_length": len(message) if not payload.template_key else None,
        "template_key": payload.template_key,
        "external_recipient_count": len(set(external_phones)),
    }

    # Deliver small sends in the request so the administrator gets Termii's
    # actual result instead of a misleading "queued" response. Large batches
    # remain asynchronous to avoid request timeouts.
    if len(deliveries) <= 10:
        sent = failed = 0
        errors: list[str] = []
        for phone_number, delivery_message in deliveries:
            try:
                delivered, delivery_error = send_sms(
                    recipient=phone_number,
                    message=delivery_message,
                    sender_name=sender,
                )
            except Exception:
                logger.exception("Unexpected SMS delivery failure")
                delivered, delivery_error = False, "Unexpected SMS delivery failure."
            sent += int(delivered)
            failed += int(not delivered)
            if delivery_error and delivery_error not in errors:
                errors.append(delivery_error)
        db.add(AuditLog(
            user_id=admin.id,
            action="COMPLETE_BULK_SMS",
            table_name="users",
            record_id=admin.id,
            old_data=None,
            new_data={**audit_data, "sent": sent, "failed": failed},
        ))
        db.commit()
        if not sent:
            raise HTTPException(502, errors[0] if errors else "Termii did not accept the SMS.")
        response_message = f"SMS sent to {sent} recipient(s)."
        if failed:
            response_message += f" {failed} failed: {errors[0] if errors else 'unknown provider error'}"
        return {"queued": 0, "sent": sent, "failed": failed, "message": response_message}

    db.add(AuditLog(
        user_id=admin.id,
        action="QUEUE_BULK_SMS",
        table_name="users",
        record_id=admin.id,
        old_data=None,
        new_data=audit_data,
    ))
    db.commit()
    background_tasks.add_task(_deliver_sms, deliveries, sender, admin.id, audit_data)
    return {"queued": len(deliveries), "message": f"SMS queued for {len(deliveries)} recipient(s)."}
