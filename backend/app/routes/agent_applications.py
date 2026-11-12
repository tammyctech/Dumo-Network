import os
import secrets

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import (
    AgentApplication,
    AgentApplicationLink,
    AgentAssignment,
    AgentInvitation,
    Election,
    PollingUnit,
    User,
)
from ..security import hash_password, require_admin
from ..utils.invitations import generate_invitation_token, hash_invitation_token
from ..utils.phone import normalize_nigerian_phone


router = APIRouter(tags=["Agent Applications"])
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173").rstrip("/")


class LinkCreate(BaseModel):
    election_id: int
    expires_in_days: int = Field(default=30, ge=1, le=180)
    model_config = ConfigDict(extra="forbid")


class ApplicationCreate(BaseModel):
    full_name: str = Field(min_length=2, max_length=150)
    phone_number: str = Field(min_length=7, max_length=30)
    email: EmailStr
    polling_unit_id: int
    model_config = ConfigDict(extra="forbid")


class ReviewRequest(BaseModel):
    notes: str | None = Field(default=None, max_length=1000)
    model_config = ConfigDict(extra="forbid")


def _active_link(db: Session, token: str, *, lock: bool = False) -> AgentApplicationLink:
    query = select(AgentApplicationLink).where(AgentApplicationLink.token == token)
    if lock:
        query = query.with_for_update()
    link = db.scalar(query)
    now = datetime.now(timezone.utc)
    if link is None or not link.is_active or link.expires_at <= now:
        raise HTTPException(404, "This application link is invalid, closed, or expired.")
    return link


def _application_row(db: Session, item: AgentApplication) -> dict:
    link = db.get(AgentApplicationLink, item.link_id)
    election = db.get(Election, link.election_id) if link else None
    unit = db.get(PollingUnit, item.polling_unit_id)
    return {
        "id": item.id,
        "full_name": item.full_name,
        "phone_number": item.phone_number,
        "email": item.email,
        "status": item.status,
        "admin_notes": item.admin_notes,
        "created_at": item.created_at,
        "reviewed_at": item.reviewed_at,
        "election": {"id": election.id, "name": election.name} if election else None,
        "polling_unit": {
            "id": unit.id,
            "code": unit.code,
            "name": unit.name,
            "lga": unit.lga,
            "ward": unit.ward,
        } if unit else None,
    }


@router.post("/api/admin/agent-application-links", status_code=status.HTTP_201_CREATED)
def create_link(payload: LinkCreate, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    election = db.get(Election, payload.election_id)
    if election is None:
        raise HTTPException(404, "Election not found.")
    item = AgentApplicationLink(
        token=secrets.token_urlsafe(24),
        election_id=election.id,
        created_by=admin.id,
        expires_at=datetime.now(timezone.utc) + timedelta(days=payload.expires_in_days),
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return {
        "id": item.id,
        "election": {"id": election.id, "name": election.name},
        "url": f"{FRONTEND_URL}/apply/agent/{item.token}",
        "is_active": item.is_active,
        "expires_at": item.expires_at,
        "created_at": item.created_at,
        "application_count": 0,
    }


@router.get("/api/admin/agent-application-links")
def list_links(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    items = db.scalars(select(AgentApplicationLink).order_by(AgentApplicationLink.id.desc())).all()
    counts = dict(db.execute(
        select(AgentApplication.link_id, func.count(AgentApplication.id)).group_by(AgentApplication.link_id)
    ).all())
    elections = {item.id: item for item in db.scalars(select(Election)).all()}
    return [{
        "id": item.id,
        "election": {
            "id": elections[item.election_id].id,
            "name": elections[item.election_id].name,
        },
        "url": f"{FRONTEND_URL}/apply/agent/{item.token}",
        "is_active": item.is_active,
        "expires_at": item.expires_at,
        "created_at": item.created_at,
        "application_count": counts.get(item.id, 0),
    } for item in items if item.election_id in elections]


@router.patch("/api/admin/agent-application-links/{link_id}/close")
def close_link(link_id: int, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    item = db.get(AgentApplicationLink, link_id)
    if item is None:
        raise HTTPException(404, "Application link not found.")
    item.is_active = False
    db.commit()
    return {"message": "Application link closed."}


@router.get("/api/agent-applications/{token}")
def public_form(token: str, db: Session = Depends(get_db)):
    link = _active_link(db, token)
    election = db.get(Election, link.election_id)
    lgas = db.scalars(
        select(PollingUnit.lga).where(PollingUnit.state.ilike("Rivers")).distinct().order_by(PollingUnit.lga)
    ).all()
    return {
        "election": {"id": election.id, "name": election.name, "election_date": election.election_date},
        "expires_at": link.expires_at,
        "lgas": lgas,
    }


@router.get("/api/agent-applications/{token}/polling-units")
def public_polling_units(token: str, lga: str = Query(min_length=2, max_length=100), db: Session = Depends(get_db)):
    _active_link(db, token)
    units = db.scalars(
        select(PollingUnit)
        .where(PollingUnit.state.ilike("Rivers"), func.lower(PollingUnit.lga) == lga.strip().lower())
        .order_by(PollingUnit.ward, PollingUnit.code)
    ).all()
    return [{"id": unit.id, "code": unit.code, "name": unit.name, "ward": unit.ward} for unit in units]


@router.post("/api/agent-applications/{token}", status_code=status.HTTP_201_CREATED)
def submit_application(token: str, payload: ApplicationCreate, db: Session = Depends(get_db)):
    link = _active_link(db, token, lock=True)
    unit = db.get(PollingUnit, payload.polling_unit_id)
    if unit is None or unit.state.casefold() != "rivers":
        raise HTTPException(422, "Select a valid Rivers State polling unit.")
    try:
        phone = normalize_nigerian_phone(payload.phone_number)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    item = AgentApplication(
        link_id=link.id,
        polling_unit_id=unit.id,
        full_name=payload.full_name.strip(),
        phone_number=phone,
        email=str(payload.email).strip().lower(),
    )
    db.add(item)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, "This phone number has already applied through this link.") from exc
    return {"message": "Application submitted. An administrator must approve it before you become an agent."}


@router.get("/api/admin/agent-applications")
def list_applications(
    application_status: str | None = Query(default=None, alias="status"),
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    query = select(AgentApplication).order_by(AgentApplication.id.desc())
    if application_status in {"pending", "approved", "rejected"}:
        query = query.where(AgentApplication.status == application_status)
    return [_application_row(db, item) for item in db.scalars(query).all()]


@router.post("/api/admin/agent-applications/{application_id}/approve")
def approve_application(
    application_id: int,
    payload: ReviewRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    item = db.scalar(select(AgentApplication).where(AgentApplication.id == application_id).with_for_update())
    if item is None:
        raise HTTPException(404, "Application not found.")
    if item.status != "pending":
        raise HTTPException(409, "This application has already been reviewed.")
    link = db.get(AgentApplicationLink, item.link_id)
    if link is None:
        raise HTTPException(409, "The application link no longer exists.")
    if db.scalar(select(User.id).where((User.email == item.email) | (User.phone_number == item.phone_number))):
        raise HTTPException(409, "An account already uses this email address or phone number.")
    if db.scalar(select(AgentAssignment.id).where(
        AgentAssignment.election_id == link.election_id,
        AgentAssignment.polling_unit_id == item.polling_unit_id,
    )):
        raise HTTPException(409, "This polling unit already has an agent for the selected election.")

    activation_token = generate_invitation_token()
    expires_at = datetime.now(timezone.utc) + timedelta(hours=24)
    agent = User(
        full_name=item.full_name,
        email=item.email,
        phone_number=item.phone_number,
        hashed_password=hash_password(secrets.token_urlsafe(48)),
        role="agent",
        is_active=False,
    )
    db.add(agent)
    db.flush()
    db.add_all([
        AgentAssignment(election_id=link.election_id, polling_unit_id=item.polling_unit_id, agent_id=agent.id),
        AgentInvitation(agent_id=agent.id, token_hash=hash_invitation_token(activation_token), expires_at=expires_at),
    ])
    item.status = "approved"
    item.admin_notes = payload.notes.strip() if payload.notes else None
    item.reviewed_by = admin.id
    item.reviewed_at = datetime.now(timezone.utc)
    item.agent_id = agent.id
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, "The account or polling-unit assignment conflicts with existing data.") from exc
    return {
        "message": "Application approved. Send the activation link to the new agent.",
        "activation_url": f"{FRONTEND_URL}/activate-agent#token={activation_token}",
        "invitation_expires_at": expires_at,
    }


@router.post("/api/admin/agent-applications/{application_id}/reject")
def reject_application(
    application_id: int,
    payload: ReviewRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    item = db.scalar(select(AgentApplication).where(AgentApplication.id == application_id).with_for_update())
    if item is None:
        raise HTTPException(404, "Application not found.")
    if item.status != "pending":
        raise HTTPException(409, "This application has already been reviewed.")
    item.status = "rejected"
    item.admin_notes = payload.notes.strip() if payload.notes else None
    item.reviewed_by = admin.id
    item.reviewed_at = datetime.now(timezone.utc)
    db.commit()
    return {"message": "Application rejected."}
