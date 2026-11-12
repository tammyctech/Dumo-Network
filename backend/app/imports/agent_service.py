import csv
import io
import re
import secrets
import string
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session
from email_validator import EmailNotValidError, validate_email

from app.models import AgentAssignment, PollingUnit, User
from app.utils.phone import normalize_nigerian_phone

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


def _polling_number_matches(code: str, number: str) -> bool:
    code_parts = re.findall(r"\d+", code)
    return bool(code_parts and code_parts[-1] == number)


def validate_agents(db: Session, records: list[dict[str, str]]) -> dict:
    units = db.scalars(select(PollingUnit).where(PollingUnit.state.ilike("Rivers"))).all()
    units_by_code = {_key(unit.code): unit for unit in units}
    units_by_location: dict[tuple[str, str], list[PollingUnit]] = {}
    for unit in units:
        units_by_location.setdefault((_key(unit.lga), _key(unit.ward)), []).append(unit)
    assignments = {item.polling_unit_id: item for item in db.scalars(select(AgentAssignment)).all()}
    existing_users = {u.phone_number: u for u in db.scalars(select(User).where(User.phone_number.is_not(None))).all()}
    seen_phones: set[str] = set()
    seen_units: set[int] = set()
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

        candidates = units_by_location.get((_key(lga), _key(ward)), [])
        if code:
            # Polling-unit codes are globally unique. Spreadsheets commonly use
            # numbered ward labels (for example, "Ward 1") while the database
            # stores the official ward name (for example, "ABUA I"). Resolve an
            # explicitly supplied code first so that this naming difference does
            # not reject the correct polling unit.
            coded_unit = units_by_code.get(_key(code))
            matches = [coded_unit] if coded_unit and _key(coded_unit.lga) == _key(lga) else []
        else:
            matches = [u for u in candidates if _polling_number_matches(u.code, number)]
        unit = matches[0] if len(matches) == 1 else None
        if not unit:
            detail = "not found" if not matches else "is ambiguous; provide Polling Unit Code"
            errors.append(f"Polling Unit {number} was {detail} in {ward}, {lga} LGA.")
        elif unit.id in assignments:
            errors.append("This polling unit already has a permanent agent.")
        elif unit.id in seen_units:
            errors.append("This polling unit is duplicated in this file.")
        else:
            seen_units.add(unit.id)

        user = existing_users.get(phone) if phone else None
        if user and user.role not in {"agent"}:
            errors.append("This phone number belongs to a non-agent account.")
        email = row.get("email address", "").lower()
        if email:
            try:
                email = validate_email(email, check_deliverability=False).normalized
            except EmailNotValidError:
                errors.append("Email address is invalid.")
            if not user and db.scalar(select(User.id).where(User.email == email)):
                errors.append("Email address is already registered.")

        output.append({
            "row_number": row_number, "full_name": name, "phone_number": phone,
            "lga": lga, "ward": ward, "polling_unit_number": number,
            "polling_unit_code": code, "polling_unit_name": row.get("polling unit name", ""),
            "email": email, "polling_unit_id": unit.id if unit else None,
            "existing_account": bool(user), "errors": errors, "valid": not errors,
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
