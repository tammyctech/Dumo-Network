import csv
import io
import re
import secrets
import string
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session
from email_validator import EmailNotValidError, validate_email

from app.models import AgentAssignment, User
from app.utils.phone import normalize_nigerian_phone
from app.services.agent_integrity import polling_unit_capacity
from app.services.electoral_lookup import PollingUnitDirectory, display_polling_unit_number

MAX_AGENT_FILE_SIZE = 10 * 1024 * 1024
HEADERS = [
    "Full Name", "Phone Number", "LGA", "Ward", "Polling Unit Number",
    "Polling Unit Code", "Polling Unit Name", "Email Address",
]


def _key(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip()).casefold()


def _cell(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value).strip()


def parse_agent_file(content: bytes, filename: str) -> list[dict[str, str]]:
    suffix = filename.lower().rsplit(".", 1)[-1]
    if suffix == "csv":
        try:
            text = content.decode("utf-8-sig")
        except UnicodeDecodeError as exc:
            raise ValueError("CSV files must use UTF-8 encoding.") from exc
        rows = list(csv.DictReader(io.StringIO(text)))
    elif suffix == "xlsx":
        try:
            from openpyxl import load_workbook
            sheet = load_workbook(io.BytesIO(content), read_only=True, data_only=True).active
        except Exception as exc:
            raise ValueError("The Excel workbook could not be read.") from exc
        values = sheet.iter_rows()
        headers = [_cell(cell.value) for cell in next(values, ())]
        rows = []
        for cells in values:
            values_for_row = []
            for header, cell in zip(headers, cells):
                value = _cell(cell.value)
                if _key(header) == "polling unit number" and isinstance(cell.value, (int, float)):
                    numeric_format = str(cell.number_format or "")
                    if numeric_format and set(numeric_format) == {"0"}:
                        value = str(int(cell.value)).zfill(len(numeric_format))
                values_for_row.append(value)
            rows.append(dict(zip(headers, values_for_row)))
    else:
        raise ValueError("Upload a .csv or .xlsx file.")

    if not rows:
        raise ValueError("The uploaded file has no agent records.")
    present = {_key(header) for header in rows[0].keys() if header}
    required = {_key(value) for value in HEADERS[:5]}
    missing = required - present
    if missing:
        raise ValueError("Missing required columns: " + ", ".join(sorted(missing)))
    return [{_key(k): _cell(v) for k, v in row.items() if k} for row in rows]


def validate_agents(db: Session, records: list[dict[str, str]]) -> dict:
    directory = PollingUnitDirectory(db)
    assignment_counts = dict(db.execute(
        select(AgentAssignment.polling_unit_id, func.count(AgentAssignment.id))
        .join(User, User.id == AgentAssignment.agent_id)
        .where(User.is_active.is_(True))
        .group_by(AgentAssignment.polling_unit_id)
    ).all())
    assignments_by_agent = dict(db.execute(select(AgentAssignment.agent_id, AgentAssignment.polling_unit_id)).all())
    existing_users = {u.phone_number: u for u in db.scalars(select(User).where(User.phone_number.is_not(None))).all()}
    seen_phones: set[str] = set()
    planned_unit_counts: dict[int, int] = {}
    output = []

    for row_number, row in enumerate(records, 2):
        errors: list[str] = []
        name = row.get("full name", "").strip()
        lga, ward = row.get("lga", ""), row.get("ward", "")
        number = row.get("polling unit number", "")
        code = row.get("polling unit code", "")
        if len(name) < 2:
            errors.append("Full name is required.")
        try:
            phone = normalize_nigerian_phone(row.get("phone number", ""))
        except ValueError as exc:
            phone = None
            errors.append(str(exc))
        if phone and phone in seen_phones:
            errors.append("Phone number is duplicated in this file.")
        if phone:
            seen_phones.add(phone)
        if not lga or not ward or not number:
            errors.append("LGA, ward, and polling-unit number are required.")

        unit = None
        try:
            match = directory.lookup(lga=lga, ward=ward, polling_unit_number=number,
                polling_unit_code=code, polling_unit_name=row.get("polling unit name", ""))
            unit = match.unit
            lga, ward, number = match.lga, match.ward.name if match.ward else unit.ward, display_polling_unit_number(number)
            code = unit.code
        except ValueError as exc:
            errors.append(str(exc))
        user = existing_users.get(phone) if phone else None
        already_assigned = bool(user and unit and assignments_by_agent.get(user.id) == unit.id)
        if unit and not already_assigned and assignment_counts.get(unit.id, 0) >= polling_unit_capacity(unit):
            errors.append("This polling unit already has a permanent agent and has reached its maximum number of agents.")
        elif unit and planned_unit_counts.get(unit.id, 0) >= polling_unit_capacity(unit):
            errors.append("This polling unit is duplicated in this file and has reached its maximum number of agents.")

        if user and user.role not in {"agent"}:
            errors.append("This phone number belongs to a non-agent account.")
        elif user and user.id in assignments_by_agent and not already_assigned:
            errors.append("This agent already has a polling-unit assignment.")
        email = row.get("email address", "").lower()
        if email:
            try:
                email = validate_email(email, check_deliverability=False).normalized
            except EmailNotValidError:
                errors.append("Email address is invalid.")
            if not user:
                email_owner = db.scalar(select(User).where(User.email == email))
                if email_owner:
                    if email_owner.role == "agent":
                        errors.append("Email address belongs to an existing agent account. Review that account before reuse.")
                    else:
                        errors.append("Email address belongs to an existing non-agent account. Review and convert that account in User Management before reuse.")

        if unit and not errors:
            planned_unit_counts[unit.id] = planned_unit_counts.get(unit.id, 0) + 1

        output.append({
            "row_number": row_number, "full_name": name, "phone_number": phone,
            "lga": lga, "ward": ward, "polling_unit_number": number,
            "polling_unit_code": code, "polling_unit_name": row.get("polling unit name", ""),
            "email": email, "polling_unit_id": unit.id if unit else None,
            "existing_account": bool(user), "already_assigned": already_assigned,
            "errors": errors, "valid": not errors,
        })
    valid = sum(row["valid"] for row in output)
    return {"total_records": len(output), "valid_records": valid, "invalid_records": len(output) - valid,
            "can_import": valid > 0, "rows": output}


def temporary_password() -> str:
    alphabet = string.ascii_letters + string.digits + "!@#$%"
    while True:
        value = "".join(secrets.choice(alphabet) for _ in range(16))
        if any(c.islower() for c in value) and any(c.isupper() for c in value) and any(c.isdigit() for c in value):
            return value
