import csv
import io
import json
import logging
import os
import re
import unicodedata
from html import escape
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from fastapi.routing import APIRoute
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import SessionLocal, get_db
from app.models import AgentAssignment, AgentEmailDelivery, AgentImport, AgentImportRow, Election, PollingUnit, User
from app.security import hash_password, require_admin
from app.services.email_service import send_system_email
from app.imports.agent_service import (
    HEADERS, MAX_AGENT_FILE_SIZE, parse_agent_file, validate_agents,
)

logger = logging.getLogger(__name__)
DEFAULT_AGENT_PASSWORD = os.getenv("DEFAULT_AGENT_PASSWORD", "12345")


def _send_assignment_emails(notifications: list[dict[str, str]]) -> None:
    """Deliver personalized bulk-import emails after the HTTP response is sent."""
    login_url = f"{os.getenv('FRONTEND_URL', 'http://localhost:5173').rstrip('/')}/login"
    for item in notifications:
        temporary_password = item.get("temporary_password")
        password_line = f"Temporary password: {temporary_password}\n" if temporary_password else "Password: Use your existing account password.\n"
        password_html = f"<strong>Temporary password:</strong> {escape(temporary_password)}<br>" if temporary_password else "<strong>Password:</strong> Use your existing account password.<br>"
        plain = f"""Hello {item['full_name']},

You have been registered as a Dumo Youth Network polling-unit agent and assigned to a permanent polling unit.

Your details:
Name: {item['full_name']}
Phone / login ID: {item['phone_number']}
{password_line}
Polling-unit assignment:
LGA: {item['lga']}
Ward: {item['ward']}
Polling unit: {item['polling_unit_code']} - {item['polling_unit_name']}

This assignment applies to all current and future elections.
Login: {login_url}
"""
        html = f"""<h2 style="color:#047857">Polling-unit assignment</h2>
<p>Hello {escape(item['full_name'])},</p><p>You have been registered as a Dumo Youth Network polling-unit agent and assigned to a permanent polling unit.</p>
<div style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:12px;padding:18px;margin:16px 0"><strong>Your details</strong><br>Name: {escape(item['full_name'])}<br><strong>Phone / login ID:</strong> {escape(item['phone_number'])}<br>{password_html}</div>
<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:18px;margin:16px 0"><strong>Polling-unit assignment</strong><br>LGA: {escape(item['lga'])}<br>Ward: {escape(item['ward'])}<br>Polling unit: {escape(item['polling_unit_code'])} &middot; {escape(item['polling_unit_name'])}</div>
<p>This assignment applies to <strong>all current and future elections</strong>.</p><p><a href="{escape(login_url)}">Log in to your account</a></p>"""
        try:
            sent, error = send_system_email(recipient=item["email"], subject="Your Dumo polling-unit assignment and login details", plain_text=plain, html=html)
            delivery_id = int(item.get("delivery_id", "0"))
            if delivery_id:
                with SessionLocal() as delivery_db:
                    delivery = delivery_db.get(AgentEmailDelivery, delivery_id)
                    if delivery and delivery.status != "sent":
                        delivery.attempts += 1
                        delivery.status = "sent" if sent else "failed"
                        delivery.last_error = None if sent else (error or "Delivery failed.")[:500]
                        delivery.sent_at = datetime.now(timezone.utc) if sent else None
                        delivery_db.commit()
            if not sent:
                logger.warning("Bulk assignment email was not sent to agent %s: %s", item["agent_id"], error)
        except Exception:
            logger.exception("Unexpected bulk assignment email failure for agent %s", item["agent_id"])


def placeholder_email(full_name: str, phone_number: str, used_emails: set[str]) -> str:
    ascii_name = unicodedata.normalize("NFKD", full_name).encode("ascii", "ignore").decode()
    local_part = re.sub(r"[^a-z0-9]+", ".", ascii_name.casefold()).strip(".") or "agent"
    local_part = local_part[:64].rstrip(".")
    candidate = f"{local_part}@dumo-network.vercel.app"
    if candidate not in used_emails:
        return candidate
    phone_suffix = re.sub(r"\D", "", phone_number)[-4:] or "agent"
    candidate = f"{local_part[:59].rstrip('.')}.{phone_suffix}@dumo-network.vercel.app"
    counter = 2
    while candidate in used_emails:
        suffix = f".{phone_suffix}.{counter}"
        candidate = f"{local_part[:64-len(suffix)].rstrip('.')}{suffix}@dumo-network.vercel.app"
        counter += 1
    return candidate


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


def _apply_polling_unit_overrides(
    db: Session,
    records: list[dict[str, str]],
    raw_overrides: str,
) -> list[dict[str, str]]:
    try:
        decoded = json.loads(raw_overrides or "{}")
        overrides = {int(row): int(unit) for row, unit in decoded.items()}
    except (TypeError, ValueError, json.JSONDecodeError) as exc:
        raise ValueError("Polling-unit changes are invalid. Revalidate the file and try again.") from exc
    if not overrides:
        return records
    units = {
        unit.id: unit
        for unit in db.scalars(
            select(PollingUnit).where(
                PollingUnit.id.in_(overrides.values()),
                PollingUnit.state.ilike("Rivers"),
            )
        ).all()
    }
    if len(units) != len(set(overrides.values())):
        raise ValueError("One or more replacement polling units were not found in Rivers State.")
    updated = [dict(record) for record in records]
    for row_number, unit_id in overrides.items():
        record_index = row_number - 2
        if record_index < 0 or record_index >= len(updated):
            raise ValueError(f"Spreadsheet row {row_number} was not found.")
        unit = units[unit_id]
        number_parts = re.findall(r"\d+", unit.code)
        updated[record_index].update({
            "lga": unit.lga,
            "ward": unit.ward,
            "polling unit number": number_parts[-1] if number_parts else unit.code,
            "polling unit code": unit.code,
            "polling unit name": unit.name,
        })
    return updated


@router.get("/template")
def template(_: User = Depends(require_admin)):
    stream = io.StringIO()
    writer = csv.writer(stream)
    writer.writerow(HEADERS)
    writer.writerow(["Ada Example", "08012345678", "Okrika", "Ward 9", "003", "", "", ""])
    return StreamingResponse(iter([stream.getvalue()]), media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="dumo-agent-import-template.csv"'})


@router.post("/preview")
async def preview(file: UploadFile = File(...), overrides: str = Form("{}"),
                  _: User = Depends(require_admin), db: Session = Depends(get_db)):
    try:
        records = parse_agent_file(await _read(file), file.filename or "")
        return validate_agents(db, _apply_polling_unit_overrides(db, records, overrides))
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


@router.post("/confirm")
async def confirm(background_tasks: BackgroundTasks, file: UploadFile = File(...), overrides: str = Form("{}"),
                  admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    try:
        records = parse_agent_file(await _read(file), file.filename or "")
        report = validate_agents(db, _apply_polling_unit_overrides(db, records, overrides))
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    if not report["valid_records"]:
        raise HTTPException(422, "No valid records are available to import.")

    history = AgentImport(administrator_id=admin.id, election_id=None,
        filename=(file.filename or "upload")[:255], total_records=report["total_records"],
        failed_records=report["invalid_records"])
    db.add(history)
    db.flush()
    credentials = []
    email_notifications: list[dict[str, str]] = []
    email_notifications_skipped = 0
    registered = assigned = 0
    valid_rows = [row for row in report["rows"] if row["valid"]]
    phones = {row["phone_number"] for row in valid_rows}
    existing_users = {
        user.phone_number: user
        for user in db.scalars(select(User).where(User.phone_number.in_(phones))).all()
    }
    has_new_users = any(row["phone_number"] not in existing_users for row in valid_rows)
    used_emails = set(db.scalars(select(User.email)).all())
    # All new accounts share one administrator-configured temporary password.
    # Hash it once for the batch to avoid a proxy timeout, and force every agent
    # to replace it immediately after their first login.
    default_password_hash = hash_password(DEFAULT_AGENT_PASSWORD) if has_new_users else ""
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
            email = row["email"] or placeholder_email(row["full_name"], row["phone_number"], used_emails)
            if row["email"] and email in used_emails:
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
        db.add(AgentAssignment(election_id=None, polling_unit_id=row["polling_unit_id"], agent_id=user.id))
        unit = db.get(PollingUnit, row["polling_unit_id"])
        if unit and not user.email.casefold().endswith((".invalid", "@dumo-network.vercel.app")):
            delivery = AgentEmailDelivery(import_id=history.id, agent_id=user.id, recipient=user.email)
            db.add(delivery)
            db.flush()
            email_notifications.append({
                "agent_id": str(user.id), "delivery_id": str(delivery.id), "email": user.email, "full_name": user.full_name,
                "phone_number": user.phone_number or "Not provided",
                "temporary_password": DEFAULT_AGENT_PASSWORD if created else "",
                "lga": unit.lga, "ward": unit.ward, "polling_unit_code": unit.code,
                "polling_unit_name": unit.name,
            })
        else:
            email_notifications_skipped += 1
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
    daily_batch_limit = max(1, min(int(os.getenv("GMAIL_DAILY_BATCH_SIZE", "450")), 500))
    scheduled_notifications = email_notifications[:daily_batch_limit]
    if scheduled_notifications:
        background_tasks.add_task(_send_assignment_emails, scheduled_notifications)
    return {"import_id": history.id, "registered_agents": registered, "assigned_agents": assigned,
            "failed_records": history.failed_records, "credentials": credentials,
            "email_notifications_queued": len(scheduled_notifications),
            "email_notifications_pending": len(email_notifications) - len(scheduled_notifications),
            "email_notifications_skipped": email_notifications_skipped,
            "credential_notice": "All new agents must change the shared temporary password after first login."}


@router.get("")
def history(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    records = db.execute(select(AgentImport, User, Election).join(User, AgentImport.administrator_id == User.id)
        .outerjoin(Election, AgentImport.election_id == Election.id).order_by(AgentImport.created_at.desc())).all()
    return [{"id": item.id, "import_date": item.created_at, "administrator": admin.full_name,
             "filename": item.filename, "election": election.name if election else "All elections", "total_records": item.total_records,
             "registered_agents": item.registered_agents, "assigned_agents": item.assigned_agents,
             "skipped_records": item.skipped_records, "failed_records": item.failed_records,
             "email_delivery": {status: count for status, count in db.execute(
                 select(AgentEmailDelivery.status, func.count(AgentEmailDelivery.id)).where(
                     AgentEmailDelivery.import_id == item.id).group_by(AgentEmailDelivery.status)
             ).all()}}
            for item, admin, election in records]


@router.delete("")
def clear_history(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    """Delete import audit records without deleting agents or assignments."""
    row_result = db.execute(delete(AgentImportRow))
    import_result = db.execute(delete(AgentImport))
    db.commit()
    return {
        "message": "Bulk agent import history cleared.",
        "imports_deleted": import_result.rowcount or 0,
        "rows_deleted": row_result.rowcount or 0,
    }


@router.post("/emails/retry")
def retry_assignment_emails(
    background_tasks: BackgroundTasks,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    limit = max(1, min(int(os.getenv("GMAIL_DAILY_BATCH_SIZE", "450")), 500))
    rows = db.execute(
        select(AgentEmailDelivery, AgentImportRow, User, PollingUnit)
        .join(AgentImportRow, (AgentImportRow.import_id == AgentEmailDelivery.import_id) & (AgentImportRow.agent_id == AgentEmailDelivery.agent_id))
        .join(User, User.id == AgentEmailDelivery.agent_id)
        .join(PollingUnit, PollingUnit.id == AgentImportRow.polling_unit_id)
        .where(AgentEmailDelivery.status.in_(("queued", "failed")))
        .order_by(AgentEmailDelivery.id)
        .limit(limit)
    ).all()
    notifications = []
    for delivery, import_row, user, unit in rows:
        delivery.status = "queued"
        notifications.append({
            "agent_id": str(user.id), "delivery_id": str(delivery.id), "email": delivery.recipient,
            "full_name": user.full_name, "phone_number": user.phone_number or "Not provided",
            "temporary_password": DEFAULT_AGENT_PASSWORD if import_row.message == "New account created" else "",
            "lga": unit.lga, "ward": unit.ward, "polling_unit_code": unit.code, "polling_unit_name": unit.name,
        })
    db.commit()
    if notifications:
        background_tasks.add_task(_send_assignment_emails, notifications)
    remaining = db.scalar(select(func.count(AgentEmailDelivery.id)).where(AgentEmailDelivery.status.in_(("queued", "failed")))) or 0
    return {"scheduled": len(notifications), "remaining": max(0, remaining - len(notifications))}


@router.get("/{import_id}/errors")
def errors(import_id: int, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    rows = db.scalars(select(AgentImportRow).where(AgentImportRow.import_id == import_id,
        AgentImportRow.status == "failed").order_by(AgentImportRow.row_number)).all()
    stream = io.StringIO()
    writer = csv.writer(stream); writer.writerow(["Row", "Phone Number", "Error"])
    writer.writerows((row.row_number, row.phone_number or "", row.message or "") for row in rows)
    return StreamingResponse(iter([stream.getvalue()]), media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="agent-import-{import_id}-errors.csv"'})
