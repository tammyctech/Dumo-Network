from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import (
    AgentAssignment, AuditLog, Election, Incident, PollingUnit, ResultFlag,
    ResultReview, ResultSubmission, User,
)
from ..security import get_current_user

router = APIRouter(prefix="/api/operations", tags=["Election Operations"])

ReviewStatus = Literal["under_review", "verified", "disputed", "correction_requested"]
IncidentSeverity = Literal["low", "medium", "high", "critical"]
IncidentStatus = Literal["open", "investigating", "resolved", "closed"]


class ReviewInput(BaseModel):
    status: ReviewStatus
    notes: str | None = Field(default=None, max_length=2000)


class IncidentCreate(BaseModel):
    election_id: int = Field(gt=0)
    polling_unit_id: int | None = Field(default=None, gt=0)
    category: str = Field(min_length=2, max_length=80)
    severity: IncidentSeverity
    description: str = Field(min_length=5, max_length=3000)


class IncidentUpdate(BaseModel):
    status: IncidentStatus
    resolution_notes: str | None = Field(default=None, max_length=3000)
    assigned_to: int | None = Field(default=None, gt=0)


def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Administrator access required.")
    return user


def require_operations_user(user: User = Depends(get_current_user)) -> User:
    if user.role not in ("admin", "agent"):
        raise HTTPException(status_code=403, detail="Operations access required.")
    return user


def authorize_submission(db: Session, submission_id: int, user: User) -> ResultSubmission:
    submission = db.get(ResultSubmission, submission_id)
    if submission is None:
        raise HTTPException(status_code=404, detail="Result submission not found.")
    if user.role != "admin" and submission.agent_id != user.id:
        raise HTTPException(status_code=403, detail="You cannot access this submission.")
    return submission


@router.post("/results/{submission_id}/reviews")
def review_result(submission_id: int, payload: ReviewInput,
                  db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    submission = db.get(ResultSubmission, submission_id)
    if submission is None:
        raise HTTPException(status_code=404, detail="Result submission not found.")
    old_status = submission.verification_status
    submission.verification_status = payload.status
    review = ResultReview(submission_id=submission.id, reviewer_id=admin.id,
                          status=payload.status, notes=payload.notes)
    db.add(review)
    db.flush()
    db.add(AuditLog(user_id=admin.id, action="review_result",
                    table_name="result_submissions", record_id=submission.id,
                    old_data={"verification_status": old_status},
                    new_data={"verification_status": payload.status, "review_id": review.id}))
    db.commit()
    return {"message": "Result review recorded.", "submission_id": submission.id,
            "verification_status": submission.verification_status, "review_id": review.id}


@router.get("/results/{submission_id}/reviews")
def review_history(submission_id: int, db: Session = Depends(get_db),
                   user: User = Depends(require_operations_user)):
    authorize_submission(db, submission_id, user)
    rows = db.execute(
        select(ResultReview, User).join(User, User.id == ResultReview.reviewer_id)
        .where(ResultReview.submission_id == submission_id)
        .order_by(ResultReview.created_at.desc())
    ).all()
    return {"reviews": [{"id": review.id, "status": review.status,
                          "notes": review.notes, "created_at": review.created_at,
                          "reviewer": reviewer.full_name} for review, reviewer in rows]}


@router.get("/results/{submission_id}/flags")
def result_flags(submission_id: int, db: Session = Depends(get_db),
                 user: User = Depends(require_operations_user)):
    authorize_submission(db, submission_id, user)
    flags = db.scalars(select(ResultFlag).where(ResultFlag.submission_id == submission_id)
                       .order_by(ResultFlag.created_at.desc())).all()
    return {"flags": [{"id": item.id, "type": item.flag_type,
                        "severity": item.severity, "message": item.message,
                        "resolved_at": item.resolved_at} for item in flags]}


@router.post("/incidents", status_code=status.HTTP_201_CREATED)
def create_incident(payload: IncidentCreate, db: Session = Depends(get_db),
                    user: User = Depends(require_operations_user)):
    election = db.get(Election, payload.election_id)
    if election is None or election.state.lower() != "rivers":
        raise HTTPException(status_code=404, detail="Rivers State election not found.")
    if user.role == "agent" and payload.polling_unit_id is None:
        assigned_election = db.scalar(select(AgentAssignment.id).where(
            AgentAssignment.agent_id == user.id,
            AgentAssignment.election_id == payload.election_id,
        ))
        if assigned_election is None:
            raise HTTPException(status_code=403, detail="You are not assigned to this election.")
    if payload.polling_unit_id:
        unit = db.get(PollingUnit, payload.polling_unit_id)
        if unit is None or unit.state.lower() != "rivers":
            raise HTTPException(status_code=404, detail="Rivers State polling unit not found.")
        if user.role == "agent":
            assignment = db.scalar(select(AgentAssignment.id).where(
                AgentAssignment.agent_id == user.id,
                AgentAssignment.election_id == payload.election_id,
                AgentAssignment.polling_unit_id == payload.polling_unit_id,
            ))
            if assignment is None:
                raise HTTPException(status_code=403, detail="You are not assigned to this polling unit.")
    incident = Incident(election_id=payload.election_id,
                        polling_unit_id=payload.polling_unit_id,
                        reported_by=user.id, category=payload.category.strip(),
                        severity=payload.severity, description=payload.description.strip())
    db.add(incident)
    db.commit()
    db.refresh(incident)
    return {"message": "Incident reported.", "incident_id": incident.id}


@router.get("/incidents")
def list_incidents(election_id: int | None = None, db: Session = Depends(get_db),
                   user: User = Depends(require_operations_user)):
    query = select(Incident).order_by(Incident.created_at.desc())
    if election_id is not None:
        query = query.where(Incident.election_id == election_id)
    if user.role == "agent":
        query = query.where(Incident.reported_by == user.id)
    rows = db.scalars(query.limit(200)).all()
    return {"incidents": [{"id": row.id, "election_id": row.election_id,
                            "polling_unit_id": row.polling_unit_id,
                            "category": row.category, "severity": row.severity,
                            "status": row.status, "description": row.description,
                            "resolution_notes": row.resolution_notes,
                            "assigned_to": row.assigned_to,
                            "created_at": row.created_at, "updated_at": row.updated_at}
                           for row in rows]}


@router.patch("/incidents/{incident_id}")
def update_incident(incident_id: int, payload: IncidentUpdate,
                    db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    incident = db.get(Incident, incident_id)
    if incident is None:
        raise HTTPException(status_code=404, detail="Incident not found.")
    old_status = incident.status
    if payload.assigned_to is not None and db.get(User, payload.assigned_to) is None:
        raise HTTPException(status_code=404, detail="Assigned user not found.")
    incident.status = payload.status
    incident.resolution_notes = payload.resolution_notes
    incident.assigned_to = payload.assigned_to
    incident.updated_at = datetime.now(timezone.utc)
    db.add(AuditLog(user_id=admin.id, action="update_incident", table_name="incidents",
                    record_id=incident.id, old_data={"status": old_status},
                    new_data={"status": incident.status, "assigned_to": incident.assigned_to}))
    db.commit()
    return {"message": "Incident updated.", "incident_id": incident.id,
            "status": incident.status}
