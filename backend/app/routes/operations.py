from datetime import datetime, timezone
import logging
import os
from pathlib import Path
from typing import Literal
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import (
    AgentAssignment, AuditLog, Election, Incident, IncidentVideo, PollingUnit, ResultFlag,
    ResultReview, ResultSubmission, User,
)
from ..security import get_current_user
from ..services.email_service import send_bulk_system_email
from ..services.organization_service import admin_notification_recipients, email_sender_name

router = APIRouter(prefix="/api/operations", tags=["Election Operations"])
logger = logging.getLogger(__name__)

ReviewStatus = Literal["under_review", "verified", "disputed", "correction_requested"]
IncidentSeverity = Literal["low", "medium", "high", "critical"]
IncidentStatus = Literal["open", "investigating", "resolved", "closed"]
INCIDENT_VIDEO_DIR = Path("uploads/incident_videos").resolve()
MAX_INCIDENT_VIDEO_SIZE = 25 * 1024 * 1024
ALLOWED_VIDEO_TYPES = {"video/mp4": ".mp4", "video/webm": ".webm", "video/quicktime": ".mov"}


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


def _notify_admins_of_incident(
    db: Session,
    *,
    election: Election,
    unit: PollingUnit | None,
    incident: Incident,
    reporter: User | None = None,
    reporter_name: str | None = None,
    reporter_phone: str | None = None,
) -> None:
    recipients = admin_notification_recipients(db)
    if not recipients:
        return
    location = (
        f"LGA: {unit.lga}\nWard: {unit.ward}\nPolling unit: {unit.code} - {unit.name}"
        if unit else "Polling unit: Not specified"
    )
    resolved_reporter_name = reporter_name or (reporter.full_name if reporter else "Site visitor")
    resolved_reporter_phone = reporter_phone or (reporter.phone_number if reporter else None)
    body = (
        "A new incident report has been submitted.\n\n"
        f"Reported by: {resolved_reporter_name}\n"
        f"Reporter phone: {resolved_reporter_phone or 'Not provided'}\n"
        f"Election: {election.name}\n"
        f"{location}\n"
        f"Category: {incident.category}\n"
        f"Severity: {incident.severity.upper()}\n"
        f"Status: {incident.status}\n\n"
        f"Description:\n{incident.description}\n\n"
        f"Incident ID: {incident.id}"
    )
    try:
        sent, failed, error = send_bulk_system_email(
            recipients=recipients,
            subject=f"{incident.severity.upper()} incident: {incident.category}",
            body=body,
            sender_name=email_sender_name(db),
        )
        if error or failed:
            logger.warning(
                "Incident %s email notification incomplete: sent=%s failed=%s error=%s",
                incident.id, sent, failed, error,
            )
    except Exception:
        logger.exception("Unexpected incident notification failure for incident %s", incident.id)


async def _save_incident_videos(db: Session, incident: Incident, files: list[UploadFile]) -> list[IncidentVideo]:
    if len(files) > 3:
        raise HTTPException(422, "Upload no more than 3 videos per incident.")
    saved: list[IncidentVideo] = []
    created_paths: list[Path] = []
    try:
        for file in files:
            if not file.filename:
                continue
            if file.content_type not in ALLOWED_VIDEO_TYPES:
                raise HTTPException(400, "Videos must be MP4, WebM, or MOV files.")
            content = await file.read(MAX_INCIDENT_VIDEO_SIZE + 1)
            if not content:
                raise HTTPException(400, "An uploaded video is empty.")
            if len(content) > MAX_INCIDENT_VIDEO_SIZE:
                raise HTTPException(413, "Each video must not exceed 25 MB.")
            valid = (
                (file.content_type in {"video/mp4", "video/quicktime"} and len(content) > 11 and content[4:8] == b"ftyp")
                or (file.content_type == "video/webm" and content.startswith(b"\x1aE\xdf\xa3"))
            )
            if not valid:
                raise HTTPException(400, "File contents do not match the selected video type.")
            INCIDENT_VIDEO_DIR.mkdir(parents=True, exist_ok=True, mode=0o700)
            destination = INCIDENT_VIDEO_DIR / f"{uuid4().hex}{ALLOWED_VIDEO_TYPES[file.content_type]}"
            with open(destination, "xb") as output:
                output.write(content)
            os.chmod(destination, 0o600)
            created_paths.append(destination)
            video = IncidentVideo(
                incident_id=incident.id, file_path=str(destination),
                original_filename=Path(file.filename).name[:255], content_type=file.content_type,
                file_size=len(content),
            )
            db.add(video)
            saved.append(video)
        db.commit()
        for video in saved:
            db.refresh(video)
        return saved
    except Exception:
        db.rollback()
        for path in created_paths:
            path.unlink(missing_ok=True)
        raise
    finally:
        for file in files:
            await file.close()


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
        ))
        if assigned_election is None:
            raise HTTPException(status_code=403, detail="You are not assigned to this election.")
    unit = None
    if payload.polling_unit_id:
        unit = db.get(PollingUnit, payload.polling_unit_id)
        if unit is None or unit.state.lower() != "rivers":
            raise HTTPException(status_code=404, detail="Rivers State polling unit not found.")
        if user.role == "agent":
            assignment = db.scalar(select(AgentAssignment.id).where(
                AgentAssignment.agent_id == user.id,
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
    _notify_admins_of_incident(
        db,
        reporter_name=user.full_name,
        reporter_phone=user.phone_number,
        election=election,
        unit=unit,
        incident=incident,
    )
    return {"message": "Incident reported.", "incident_id": incident.id}


@router.post("/incidents/{incident_id}/videos", status_code=status.HTTP_201_CREATED)
async def upload_incident_videos(
    incident_id: int, files: list[UploadFile] = File(...), db: Session = Depends(get_db),
    user: User = Depends(require_operations_user),
):
    incident = db.get(Incident, incident_id)
    if incident is None:
        raise HTTPException(404, "Incident not found.")
    if user.role != "admin" and incident.reported_by != user.id:
        raise HTTPException(403, "You cannot add video to this incident.")
    videos = await _save_incident_videos(db, incident, files)
    return {"message": "Incident video uploaded.", "video_ids": [item.id for item in videos]}


@router.get("/incidents/{incident_id}/videos/{video_id}")
def view_incident_video(
    incident_id: int, video_id: int, db: Session = Depends(get_db),
    user: User = Depends(require_operations_user),
):
    incident = db.get(Incident, incident_id)
    video = db.get(IncidentVideo, video_id)
    if incident is None or video is None or video.incident_id != incident.id:
        raise HTTPException(404, "Incident video not found.")
    if user.role != "admin" and incident.reported_by != user.id:
        raise HTTPException(403, "You cannot view this incident video.")
    path = Path(video.file_path).resolve()
    if INCIDENT_VIDEO_DIR not in path.parents or not path.is_file():
        raise HTTPException(404, "Incident video file not found.")
    return FileResponse(path, media_type=video.content_type, filename=video.original_filename)


@router.get("/public/incidents/options")
def public_incident_options(db: Session = Depends(get_db)):
    elections = db.scalars(
        select(Election).where(Election.state == "Rivers").order_by(Election.election_date.desc())
    ).all()
    units = db.scalars(
        select(PollingUnit).where(PollingUnit.state == "Rivers").order_by(PollingUnit.lga, PollingUnit.ward, PollingUnit.code)
    ).all()
    return {
        "elections": [{"id": item.id, "name": item.name} for item in elections],
        "polling_units": [{"id": item.id, "name": item.name, "code": item.code, "lga": item.lga, "ward": item.ward} for item in units],
    }


@router.post("/public/incidents", status_code=status.HTTP_201_CREATED)
async def create_public_incident(
    election_id: int = Form(...), polling_unit_id: int = Form(...),
    reporter_name: str = Form(..., min_length=2, max_length=150),
    reporter_phone: str = Form(..., min_length=7, max_length=30),
    category: str = Form(..., min_length=2, max_length=80),
    severity: IncidentSeverity = Form("medium"),
    description: str = Form(..., min_length=5, max_length=3000),
    files: list[UploadFile] = File(...), db: Session = Depends(get_db),
):
    election = db.get(Election, election_id)
    unit = db.get(PollingUnit, polling_unit_id)
    if election is None or (election.state or "").casefold() != "rivers":
        raise HTTPException(404, "Rivers State election not found.")
    if unit is None or (unit.state or "").casefold() != "rivers":
        raise HTTPException(404, "Rivers State polling unit not found.")
    incident = Incident(
        election_id=election.id, polling_unit_id=unit.id, reported_by=None,
        reporter_name=reporter_name.strip(), reporter_phone=reporter_phone.strip(),
        category=category.strip(), severity=severity, description=description.strip(),
    )
    db.add(incident)
    db.commit()
    db.refresh(incident)
    try:
        videos = await _save_incident_videos(db, incident, files)
    except Exception:
        db.delete(incident)
        db.commit()
        raise
    _notify_admins_of_incident(
        db, reporter_name=incident.reporter_name or "Site visitor",
        reporter_phone=incident.reporter_phone, election=election, unit=unit, incident=incident,
    )
    return {"message": "Incident report submitted.", "incident_id": incident.id, "videos_uploaded": len(videos)}


@router.get("/incidents")
def list_incidents(election_id: int | None = None, db: Session = Depends(get_db),
                   user: User = Depends(require_operations_user)):
    query = select(Incident).order_by(Incident.created_at.desc())
    if election_id is not None:
        query = query.where(Incident.election_id == election_id)
    if user.role == "agent":
        query = query.where(Incident.reported_by == user.id)
    rows = db.scalars(query.limit(200)).all()
    video_rows = db.execute(
        select(IncidentVideo.incident_id, IncidentVideo.id, IncidentVideo.original_filename)
        .where(IncidentVideo.incident_id.in_([row.id for row in rows]))
    ).all() if rows else []
    videos_by_incident: dict[int, list[dict]] = {}
    for incident_id, video_id, filename in video_rows:
        videos_by_incident.setdefault(incident_id, []).append({"id": video_id, "filename": filename})
    return {"incidents": [{"id": row.id, "election_id": row.election_id,
                            "polling_unit_id": row.polling_unit_id,
                            "category": row.category, "severity": row.severity,
                            "status": row.status, "description": row.description,
                            "resolution_notes": row.resolution_notes,
                            "reporter_name": row.reporter_name,
                            "videos": videos_by_incident.get(row.id, []),
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
