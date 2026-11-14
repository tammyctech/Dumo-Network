import logging
import os
from datetime import datetime, timezone
from html import escape

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..database import SessionLocal, get_db
from ..models import AgentAssignment, AgentWelcomeDelivery, PollingUnit, User
from ..security import require_admin
from ..services.email_service import send_bulk_system_email, send_system_email
from ..services.organization_service import email_sender_name


router = APIRouter(prefix="/api/admin/email", tags=["Admin Email"])
logger = logging.getLogger(__name__)


class BulkEmailRequest(BaseModel):
    subject: str = Field(min_length=2, max_length=150)
    body: str = Field(min_length=2, max_length=5000)
    model_config = ConfigDict(extra="forbid")


class WelcomeCampaignRequest(BaseModel):
    user_ids: list[int] = Field(min_length=1, max_length=5000)
    model_config = ConfigDict(extra="forbid")


def _deliverable(email: str) -> bool:
    lowered = email.casefold()
    return not lowered.endswith(".invalid") and not lowered.endswith("@dumo-network.vercel.app")


def _send_welcome_emails(notifications: list[dict[str, str]], sender_name: str) -> None:
    login_url = f"{os.getenv('FRONTEND_URL', 'http://localhost:5173').rstrip('/')}/login"
    for item in notifications:
        plain = f"""Hello {item['full_name']},

Welcome to Dumo Youth Network. We are pleased to have you serving as a polling-unit agent.

Your polling-unit assignment:
LGA: {item['lga']}
Ward: {item['ward']}
Polling unit: {item['polling_unit_code']} - {item['polling_unit_name']}

Sign in to your account: {login_url}

Please tell responsible people around your LGA about the opportunity to become Dumo Youth Network polling-unit agents. Interested people can contact the Dumo Youth Network team for details.

Thank you for supporting credible grassroots election monitoring.
"""
        html = f"""<h2>Welcome to Dumo Youth Network</h2><p>Hello {escape(item['full_name'])},</p><p>We are pleased to have you serving as a polling-unit agent.</p><p><strong>Your polling-unit assignment</strong><br>LGA: {escape(item['lga'])}<br>Ward: {escape(item['ward'])}<br>Polling unit: {escape(item['polling_unit_code'])} &middot; {escape(item['polling_unit_name'])}</p><p>Account login: <a href="{escape(login_url)}">{escape(login_url)}</a></p><p>Please tell responsible people around your LGA about the opportunity to become Dumo Youth Network polling-unit agents. Interested people can contact the Dumo Youth Network team for details.</p><p>Thank you for supporting credible grassroots election monitoring.</p>"""
        try:
            sent, error = send_system_email(recipient=item["email"], subject="Your Dumo Youth Network polling-unit assignment", plain_text=plain, html=html, sender_name=sender_name)
        except Exception as exc:
            logger.exception("Welcome email failed for agent %s", item["agent_id"])
            sent, error = False, f"Email delivery error: {type(exc).__name__}."
        with SessionLocal() as delivery_db:
            delivery = delivery_db.get(AgentWelcomeDelivery, int(item["delivery_id"]))
            if delivery and delivery.status != "sent":
                delivery.attempts += 1
                delivery.status = "sent" if sent else "failed"
                delivery.last_error = None if sent else (error or "Delivery failed.")[:500]
                delivery.sent_at = datetime.now(timezone.utc) if sent else None
                delivery_db.commit()


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


@router.get("/welcome-agents/status")
def welcome_status(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    counts = dict(db.execute(select(AgentWelcomeDelivery.status, func.count(AgentWelcomeDelivery.id)).group_by(AgentWelcomeDelivery.status)).all())
    return {"sent": counts.get("sent", 0), "queued": counts.get("queued", 0), "failed": counts.get("failed", 0)}


@router.post("/welcome-agents")
def send_welcome_campaign(
    payload: WelcomeCampaignRequest,
    background_tasks: BackgroundTasks,
    resend_sent: bool = False,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    rows = db.execute(
        select(User, AgentAssignment, PollingUnit)
        .join(AgentAssignment, AgentAssignment.agent_id == User.id)
        .join(PollingUnit, PollingUnit.id == AgentAssignment.polling_unit_id)
        .where(User.is_active.is_(True), User.role == "agent", User.id.in_(set(payload.user_ids)), PollingUnit.state == "Rivers")
        .order_by(User.id)
    ).all()
    existing = {item.agent_id: item for item in db.scalars(select(AgentWelcomeDelivery)).all()}
    limit = max(1, min(int(os.getenv("GMAIL_DAILY_BATCH_SIZE", "450")), 500))
    notifications = []; already_sent = already_queued = missing_email = 0
    for agent, _, unit in rows:
        delivery = existing.get(agent.id)
        if delivery and delivery.status == "sent" and not resend_sent:
            already_sent += 1; continue
        if delivery and delivery.status == "queued":
            already_queued += 1; continue
        if not _deliverable(agent.email):
            missing_email += 1; continue
        if len(notifications) >= limit:
            continue
        if delivery is None:
            delivery = AgentWelcomeDelivery(agent_id=agent.id, recipient=agent.email)
            db.add(delivery); db.flush()
        else:
            delivery.status = "queued"; delivery.recipient = agent.email
        notifications.append({"delivery_id": str(delivery.id), "agent_id": str(agent.id), "email": agent.email,
            "full_name": agent.full_name, "lga": unit.lga, "ward": unit.ward,
            "polling_unit_code": unit.code, "polling_unit_name": unit.name})
    db.commit()
    if notifications:
        background_tasks.add_task(_send_welcome_emails, notifications, email_sender_name(db))
    eligible_unscheduled = max(0, len(rows) - already_sent - already_queued - missing_email - len(notifications))
    selected_agents = db.scalar(select(func.count(User.id)).where(
        User.is_active.is_(True), User.role == "agent", User.id.in_(set(payload.user_ids)))) or 0
    return {"queued": len(notifications), "already_sent": already_sent, "already_queued": already_queued, "missing_email": missing_email,
        "remaining": eligible_unscheduled, "missing_assignment": max(0, selected_agents - len(rows))}
