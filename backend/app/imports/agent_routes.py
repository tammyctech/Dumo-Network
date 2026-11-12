import csv
import io
import logging
import os

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from fastapi.routing import APIRoute
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import AgentAssignment, AgentImport, AgentImportRow, Election, User
from app.security import hash_password, require_admin
from app.imports.agent_service import (
    HEADERS, MAX_AGENT_FILE_SIZE, parse_agent_file, validate_agents,
)

logger = logging.getLogger(__name__)
DEFAULT_AGENT_PASSWORD = os.getenv("DEFAULT_AGENT_PASSWORD", "12345")


class AgentImportRoute(APIRoute):
    """Keep unexpected import failures visible to cross-origin admin clients."""

    def get_route_handler(self):
        handler = super().get_route_handler()

        async def safe_handler(request):
            try:
                return await handler(request)
            except HTTPException:
                raise
            except Exception as exc:
                logger.exception(
                    "Bulk agent import request failed",
                    extra={"path": request.url.path},
                )
                raise HTTPException(
                    status_code=500,
                    detail=(
                        "The server could not process this agent file. "
                        "Please retry; if it continues, report whether this happened "
                        "during validation or confirmation."
                    ),
                ) from exc

        return safe_handler


router = APIRouter(
    prefix="/api/admin/agent-imports",
    tags=["Bulk Agent Registration"],
    route_class=AgentImportRoute,
)


async def _read(file: UploadFile) -> bytes:
    if not file.filename:
        raise HTTPException(400, "A filename is required.")
    content = await file.read(MAX_AGENT_FILE_SIZE + 1)
    if not content or len(content) > MAX_AGENT_FILE_SIZE:
        raise HTTPException(413 if content else 400, "The file is empty or exceeds 10 MB.")
    return content


@router.get("/template")
def template(_: User = Depends(require_admin)):
    stream = io.StringIO()
    writer = csv.writer(stream)
    writer.writerow(HEADERS)
    writer.writerow(["Ada Example", "08012345678", "Okrika", "Ward 9", "003", "", "", ""])
    return StreamingResponse(iter([stream.getvalue()]), media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="dumo-agent-import-template.csv"'})


@router.post("/preview")
async def preview(election_id: int = Form(...), file: UploadFile = File(...),
                  _: User = Depends(require_admin), db: Session = Depends(get_db)):
    try:
        return validate_agents(db, parse_agent_file(await _read(file), file.filename or ""), election_id)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


@router.post("/confirm")
async def confirm(election_id: int = Form(...), file: UploadFile = File(...),
                  admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    try:
        report = validate_agents(db, parse_agent_file(await _read(file), file.filename or ""), election_id)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    if not report["valid_records"]:
        raise HTTPException(422, "No valid records are available to import.")

    history = AgentImport(administrator_id=admin.id, election_id=election_id,
        filename=(file.filename or "upload")[:255], total_records=report["total_records"],
        failed_records=report["invalid_records"])
    db.add(history)
    db.flush()
    credentials = []
    registered = assigned = 0
    valid_rows = [row for row in report["rows"] if row["valid"]]
    phones = {row["phone_number"] for row in valid_rows}
    existing_users = {
        user.phone_number: user
        for user in db.scalars(select(User).where(User.phone_number.in_(phones))).all()
    }
    candidate_emails = {
        row["email"] or f"{row['phone_number'][1:]}@agents.dumo.invalid"
        for row in valid_rows
        if row["phone_number"] not in existing_users
    }
    used_emails = set(db.scalars(select(User.email).where(User.email.in_(candidate_emails))).all())
    # All new accounts share one administrator-configured temporary password.
    # Hash it once for the batch to avoid a proxy timeout, and force every agent
    # to replace it immediately after their first login.
    default_password_hash = hash_password(DEFAULT_AGENT_PASSWORD) if candidate_emails else ""
    planned: list[tuple[dict, User, bool]] = []

    for row in report["rows"]:
        if not row["valid"]:
            db.add(AgentImportRow(import_id=history.id, row_number=row["row_number"], status="failed",
                phone_number=row["phone_number"], polling_unit_id=row["polling_unit_id"],
                message=" ".join(row["errors"])[:500]))
            continue
        user = existing_users.get(row["phone_number"])
        created = False
        if user is None:
            email = row["email"] or f"{row['phone_number'][1:]}@agents.dumo.invalid"
            if email in used_emails:
                row["errors"] = ["Email address is already registered."]
                history.failed_records += 1
                db.add(AgentImportRow(import_id=history.id, row_number=row["row_number"], status="failed",
                    phone_number=row["phone_number"], polling_unit_id=row["polling_unit_id"], message=row["errors"][0]))
                continue
            used_emails.add(email)
            user = User(full_name=row["full_name"], email=email, phone_number=row["phone_number"],
                hashed_password=default_password_hash, role="agent", is_active=True, must_change_password=True)
            db.add(user)
            registered += 1
            created = True
        planned.append((row, user, created))

    # Assign database IDs to all new users in one round trip.
    db.flush()
    for row, user, created in planned:
        if created:
            credentials.append({
                "full_name": user.full_name,
                "phone_number": user.phone_number,
                "temporary_password": DEFAULT_AGENT_PASSWORD,
            })
        db.add(AgentAssignment(election_id=election_id, polling_unit_id=row["polling_unit_id"], agent_id=user.id))
        assigned += 1
        db.add(AgentImportRow(import_id=history.id, row_number=row["row_number"], status="imported",
            phone_number=row["phone_number"], agent_id=user.id, polling_unit_id=row["polling_unit_id"],
            message="New account created" if created else "Existing agent assigned"))
    history.registered_agents = registered
    history.assigned_agents = assigned
    history.skipped_records = report["total_records"] - assigned - history.failed_records
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, "The data changed after preview. Preview the file again.") from exc
    return {"import_id": history.id, "registered_agents": registered, "assigned_agents": assigned,
            "failed_records": history.failed_records, "credentials": credentials,
            "credential_notice": "All new agents must change the shared temporary password after first login."}


@router.get("")
def history(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    records = db.execute(select(AgentImport, User, Election).join(User, AgentImport.administrator_id == User.id)
        .join(Election, AgentImport.election_id == Election.id).order_by(AgentImport.created_at.desc())).all()
    return [{"id": item.id, "import_date": item.created_at, "administrator": admin.full_name,
             "filename": item.filename, "election": election.name, "total_records": item.total_records,
             "registered_agents": item.registered_agents, "assigned_agents": item.assigned_agents,
             "skipped_records": item.skipped_records, "failed_records": item.failed_records}
            for item, admin, election in records]


@router.get("/{import_id}/errors")
def errors(import_id: int, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    rows = db.scalars(select(AgentImportRow).where(AgentImportRow.import_id == import_id,
        AgentImportRow.status == "failed").order_by(AgentImportRow.row_number)).all()
    stream = io.StringIO()
    writer = csv.writer(stream); writer.writerow(["Row", "Phone Number", "Error"])
    writer.writerows((row.row_number, row.phone_number or "", row.message or "") for row in rows)
    return StreamingResponse(iter([stream.getvalue()]), media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="agent-import-{import_id}-errors.csv"'})
