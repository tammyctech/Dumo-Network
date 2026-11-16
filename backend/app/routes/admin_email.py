import logging
import os
from datetime import datetime, timedelta, timezone
from html import escape

import jwt
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..database import SessionLocal, get_db
from ..models import AgentAssignment, AgentWelcomeDelivery, EmailCampaign, EmailUnsubscribe, PollingUnit, User
from ..security import ALGORITHM, SECRET_KEY, require_admin
from ..services.email_service import send_bulk_system_email, send_system_email
from ..services.organization_service import email_sender_name


router = APIRouter(prefix="/api/admin/email", tags=["Admin Email"])
logger = logging.getLogger(__name__)
EMAIL_TEMPLATES = {
    "field_readiness": {"name": "Polling-unit readiness", "subject": "Prepare for polling-unit duty", "body": "Please review your polling-unit assignment, charge your phone, confirm your login works, and arrive with the materials required for your monitoring duty."},
    "result_reporting": {"name": "Result submission reminder", "subject": "Remember to submit complete polling-unit results", "body": "After counting, enter every party's votes carefully, confirm the totals, and upload a clear photograph of the result sheet before leaving your polling unit."},
    "security": {"name": "Account security reminder", "subject": "Keep your DYN monitoring account secure", "body": "Never share your password, verification information, or access to your monitoring account. Report suspicious activity to the Dumo Youth Network team immediately."},
    "civic_education": {"name": "Credible monitoring guidance", "subject": "A reminder about neutral election monitoring", "body": "Remain peaceful, factual, and non-partisan. Record only what you observe, protect voter privacy, and remember that agent-submitted results are unofficial."},
    "community": {"name": "Community mobilisation", "subject": "Help strengthen grassroots election monitoring", "body": "Tell responsible people in your LGA about Dumo Youth Network and encourage credible, peaceful participation in grassroots election monitoring."},
}
FREQUENCIES = {"once": None, "daily": timedelta(days=1), "weekly": timedelta(days=7), "monthly": timedelta(days=30)}


class BulkEmailRequest(BaseModel):
    subject: str = Field(min_length=2, max_length=150)
    body: str = Field(min_length=2, max_length=5000)
    model_config = ConfigDict(extra="forbid")


class WelcomeCampaignRequest(BaseModel):
    user_ids: list[int] = Field(min_length=1, max_length=5000)
    model_config = ConfigDict(extra="forbid")


class ScheduledCampaignRequest(BaseModel):
    template_key: str
    subject: str = Field(min_length=2, max_length=150)
    body: str = Field(min_length=2, max_length=5000)
    audience: str = "agents"
    frequency: str = "once"
    next_send_at: datetime
    model_config = ConfigDict(extra="forbid")


def _campaign_dict(item: EmailCampaign) -> dict:
    return {"id": item.id, "template_key": item.template_key, "subject": item.subject, "body": item.body,
        "audience": item.audience, "frequency": item.frequency, "status": item.status,
        "next_send_at": item.next_send_at.isoformat(), "last_sent_at": item.last_sent_at.isoformat() if item.last_sent_at else None,
        "total_sent": item.total_sent, "total_failed": item.total_failed, "total_skipped": item.total_skipped}


def _unsubscribe_token(user: User) -> str:
    return jwt.encode({"sub": str(user.id), "email": user.email, "type": "email_unsubscribe"}, SECRET_KEY, algorithm=ALGORITHM)


def _send_scheduled_campaign(campaign_id: int) -> None:
    with SessionLocal() as db:
        campaign = db.get(EmailCampaign, campaign_id)
        if not campaign:
            return
        query = select(User).where(User.is_active.is_(True))
        if campaign.audience == "agents": query = query.where(User.role == "agent")
        elif campaign.audience == "admins": query = query.where(User.role == "admin")
        users = db.scalars(query.order_by(User.id)).all()
        unsubscribed = set(db.scalars(select(EmailUnsubscribe.user_id)).all())
        sender = email_sender_name(db)
        base_url = os.getenv("BACKEND_PUBLIC_URL", os.getenv("FRONTEND_URL", "http://localhost:5173")).rstrip("/")
        sent = failed = skipped = 0
        for user in users:
            if user.id in unsubscribed or not _deliverable(user.email):
                skipped += 1; continue
            unsubscribe_url = f"{base_url}/api/admin/email/unsubscribe?token={_unsubscribe_token(user)}"
            plain = f"Hello {user.full_name},\n\n{campaign.body}\n\nUnsubscribe from optional DYN campaign emails: {unsubscribe_url}"
            safe_body = escape(campaign.body).replace("\n", "<br>")
            html = f'<p>Hello {escape(user.full_name)},</p><p>{safe_body}</p><p style="margin-top:28px;border-top:1px solid #e2e8f0;padding-top:16px;font-size:12px;color:#64748b">You are receiving an optional DYN campaign email. <a href="{escape(unsubscribe_url)}" style="color:#047857">Unsubscribe</a></p>'
            delivered, _ = send_system_email(recipient=user.email, subject=campaign.subject, plain_text=plain, html=html, sender_name=sender)
            sent += int(delivered); failed += int(not delivered)
        now = datetime.now(timezone.utc)
        campaign.total_sent += sent; campaign.total_failed += failed; campaign.total_skipped += skipped
        campaign.last_sent_at = now
        interval = FREQUENCIES[campaign.frequency]
        if interval is None: campaign.status = "completed"
        else: campaign.status = "active"; campaign.next_send_at = now + interval
        db.commit()


def process_due_email_campaigns() -> int:
    """Atomically claim due work; safe for the periodic application scheduler."""
    now = datetime.now(timezone.utc)
    with SessionLocal() as db:
        due = db.scalars(select(EmailCampaign).where(EmailCampaign.status == "active", EmailCampaign.next_send_at <= now).with_for_update(skip_locked=True).limit(10)).all()
        ids = [item.id for item in due]
        for item in due: item.status = "processing"
        db.commit()
    for campaign_id in ids: _send_scheduled_campaign(campaign_id)
    return len(ids)


@router.get("/templates")
def campaign_templates(_: User = Depends(require_admin)):
    return {"templates": [{"key": key, **value} for key, value in EMAIL_TEMPLATES.items()]}


@router.get("/campaigns")
def list_email_campaigns(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    return {"campaigns": [_campaign_dict(item) for item in db.scalars(select(EmailCampaign).order_by(EmailCampaign.id.desc()).limit(100)).all()]}


@router.post("/campaigns")
def create_email_campaign(payload: ScheduledCampaignRequest, background_tasks: BackgroundTasks, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    if payload.template_key not in EMAIL_TEMPLATES: raise HTTPException(422, "Choose a valid email template.")
    if payload.audience not in {"agents", "admins", "all"}: raise HTTPException(422, "Choose a valid audience.")
    if payload.frequency not in FREQUENCIES: raise HTTPException(422, "Choose a valid frequency.")
    when = payload.next_send_at.astimezone(timezone.utc)
    item = EmailCampaign(created_by=admin.id, template_key=payload.template_key, subject=payload.subject.strip(), body=payload.body.strip(), audience=payload.audience, frequency=payload.frequency, next_send_at=when)
    db.add(item); db.commit(); db.refresh(item)
    if when <= datetime.now(timezone.utc):
        item.status = "processing"; db.commit(); background_tasks.add_task(_send_scheduled_campaign, item.id)
    return _campaign_dict(item)


@router.patch("/campaigns/{campaign_id}/{action}")
def update_email_campaign(campaign_id: int, action: str, background_tasks: BackgroundTasks, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    item = db.get(EmailCampaign, campaign_id)
    if not item: raise HTTPException(404, "Email campaign not found.")
    if action == "pause": item.status = "paused"
    elif action == "resume": item.status = "active"
    elif action == "send-now": item.status = "processing"; background_tasks.add_task(_send_scheduled_campaign, item.id)
    else: raise HTTPException(422, "Unknown campaign action.")
    db.commit(); return _campaign_dict(item)


@router.get("/unsubscribe", response_class=HTMLResponse)
def unsubscribe_email(token: str, db: Session = Depends(get_db)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("type") != "email_unsubscribe": raise ValueError
        user = db.get(User, int(payload["sub"]))
        if not user or user.email.casefold() != str(payload.get("email", "")).casefold(): raise ValueError
    except (ValueError, KeyError, jwt.InvalidTokenError):
        raise HTTPException(400, "This unsubscribe link is invalid.")
    if not db.scalar(select(EmailUnsubscribe).where(EmailUnsubscribe.user_id == user.id)):
        db.add(EmailUnsubscribe(user_id=user.id, email=user.email)); db.commit()
    return """<!doctype html><html><body style='margin:0;background:#eef3ef;font-family:Arial;color:#0f172a'><main style='max-width:560px;margin:80px auto;background:white;padding:40px;border-radius:24px;text-align:center'><h1>You have been unsubscribed</h1><p>You will no longer receive optional DYN campaign emails. Essential account, assignment, and security messages may still be sent.</p></main></body></html>"""


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
    unsubscribed = set(db.scalars(select(EmailUnsubscribe.user_id)).all())
    recipients = [user for user in users if _deliverable(user.email) and user.id not in unsubscribed]
    skipped = len(users) - len(recipients)
    if not recipients:
        raise HTTPException(422, "No active users have a deliverable email address.")
    sender = email_sender_name(db); sent = failed = 0; error = None
    base_url = os.getenv("BACKEND_PUBLIC_URL", os.getenv("FRONTEND_URL", "http://localhost:5173")).rstrip("/")
    for user in recipients:
        unsubscribe_url = f"{base_url}/api/admin/email/unsubscribe?token={_unsubscribe_token(user)}"
        body = payload.body.strip(); safe_body = escape(body).replace("\n", "<br>")
        delivered, delivery_error = send_system_email(recipient=user.email, subject=payload.subject.strip(),
            plain_text=f"Hello {user.full_name},\n\n{body}\n\nUnsubscribe: {unsubscribe_url}",
            html=f'<p>Hello {escape(user.full_name)},</p><p>{safe_body}</p><p style="margin-top:28px;font-size:12px"><a href="{escape(unsubscribe_url)}">Unsubscribe from optional emails</a></p>', sender_name=sender)
        sent += int(delivered); failed += int(not delivered)
        if delivery_error: error = delivery_error
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
