import csv
import io

from sqlalchemy.orm import Session

from app.models import Ward, PollingUnit
from app.imports.service import normalize_lga_name
from app.wards.routes import RIVERS_LGAS


REQUIRED_COLUMNS = {
    "state",
    "lga",
    "ward_number",
    "ward_name",
    "code",
    "name",
}


def parse_electoral_csv(content: bytes):
    records = []
    errors = []

    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        return [], ["CSV must be UTF-8 encoded."]

    reader = csv.DictReader(io.StringIO(text))

    if not reader.fieldnames:
        return [], ["CSV is empty."]

    headers = [header.strip() for header in reader.fieldnames]

    if len(headers) != len(set(headers)):
        return [], ["CSV contains duplicate column headers."]

    missing = REQUIRED_COLUMNS - set(headers)

    if missing:
        return [], [
            f"Missing columns: {', '.join(sorted(missing))}"
        ]

    reader.fieldnames = headers

    for row_number, row in enumerate(reader, start=2):
        try:
            if None in row:
                raise ValueError("Too many columns.")

            state = (row["state"] or "").strip()
            lga = normalize_lga_name(
                (row["lga"] or "").strip()
            )
            ward_number = int(row["ward_number"])
            ward_name = (row["ward_name"] or "").strip()
            code = (row["code"] or "").strip()
            name = (row["name"] or "").strip()

            if state.casefold() != "rivers":
                raise ValueError("State must be Rivers.")

            if lga not in RIVERS_LGAS:
                raise ValueError(f"Invalid Rivers State LGA: {lga}")

            if ward_number <= 0:
                raise ValueError("Ward number must be positive.")

            if not ward_name or not code or not name:
                raise ValueError("Required fields cannot be empty.")

            if len(ward_name) > 100:
                raise ValueError("Ward name exceeds 100 characters.")

            if len(code) > 50:
                raise ValueError("Polling-unit code exceeds 50 characters.")

            if len(name) > 200:
                raise ValueError("Polling-unit name exceeds 200 characters.")

            records.append({
                "state": "Rivers",
                "lga": lga,
                "ward_number": ward_number,
                "ward_name": ward_name,
                "code": code,
                "name": name,
                "row_number": row_number,
            })

        except (ValueError, TypeError) as exc:
            errors.append(f"Row {row_number}: {exc}")

    return records, errors


def validate_electoral_import(
    records: list[dict],
    db: Session,
):
    errors = []
    new_wards = {}
    new_units = {}
    skipped_units = 0

    existing_wards = {
        (ward.state, ward.lga, ward.ward_number): ward
        for ward in db.query(Ward).all()
    }

    existing_units = {
        unit.code: unit
        for unit in db.query(PollingUnit).all()
    }

    ward_names = {}

    for ward in existing_wards.values():
        ward_names[
            (ward.state, ward.lga, ward.name.casefold())
        ] = ward.ward_number

    for record in records:
        row_number = record["row_number"]

        ward_key = (
            record["state"],
            record["lga"],
            record["ward_number"],
        )

        ward_name_key = (
            record["state"],
            record["lga"],
            record["ward_name"].casefold(),
        )

        existing_ward = existing_wards.get(ward_key)

        if existing_ward:
            if existing_ward.name.casefold() != record["ward_name"].casefold():
                errors.append(
                    f"Row {row_number}: Ward number "
                    f"{record['ward_number']} already has "
                    f"a different name."
                )

        elif ward_key in new_wards:
            previous = new_wards[ward_key]

            if previous["ward_name"].casefold() != record["ward_name"].casefold():
                errors.append(
                    f"Row {row_number}: Conflicting ward names "
                    f"for ward number {record['ward_number']}."
                )

        else:
            new_wards[ward_key] = record

        previous_number = ward_names.get(ward_name_key)

        if (
            previous_number is not None
            and previous_number != record["ward_number"]
        ):
            errors.append(
                f"Row {row_number}: Ward name "
                f"'{record['ward_name']}' is assigned "
                f"to multiple ward numbers."
            )

        ward_names[ward_name_key] = record["ward_number"]

        code = record["code"]

        if code in existing_units:
            unit = existing_units[code]

            if (
                unit.name != record["name"]
                or unit.state != record["state"]
                or unit.lga != record["lga"]
                or unit.ward.casefold() != record["ward_name"].casefold()
            ):
                errors.append(
                    f"Row {row_number}: Polling-unit code "
                    f"{code} conflicts with an existing record."
                )
            else:
                skipped_units += 1

        elif code in new_units:
            previous = new_units[code]

            if (
                previous["name"] != record["name"]
                or previous["lga"] != record["lga"]
                or previous["ward_name"].casefold()
                != record["ward_name"].casefold()
            ):
                errors.append(
                    f"Row {row_number}: Duplicate polling-unit "
                    f"code {code} has conflicting details."
                )
            else:
                skipped_units += 1

        else:
            new_units[code] = record

    return {
        "total_rows": len(records),
        "new_wards": len(new_wards),
        "new_polling_units": len(new_units),
        "skipped_polling_units": skipped_units,
        "errors": errors,
        "valid": len(errors) == 0,
    }


def import_electoral_records(
    records: list[dict],
    db: Session,
):
    preview = validate_electoral_import(records, db)

    if not preview["valid"]:
        raise ValueError("Electoral register contains validation errors.")

    existing_ward_keys = {
        (ward.state, ward.lga, ward.ward_number)
        for ward in db.query(Ward).all()
    }

    existing_unit_codes = {
        unit.code
        for unit in db.query(PollingUnit).all()
    }

    created_wards = 0
    created_units = 0

    try:
        for record in records:
            ward_key = (
                record["state"],
                record["lga"],
                record["ward_number"],
            )

            if ward_key not in existing_ward_keys:
                db.add(Ward(
                    state=record["state"],
                    lga=record["lga"],
                    ward_number=record["ward_number"],
                    name=record["ward_name"],
                ))

                existing_ward_keys.add(ward_key)
                created_wards += 1

            if record["code"] not in existing_unit_codes:
                db.add(PollingUnit(
                    state=record["state"],
                    lga=record["lga"],
                    ward=record["ward_name"],
                    code=record["code"],
                    name=record["name"],
                ))

                existing_unit_codes.add(record["code"])
                created_units += 1

        db.commit()

    except Exception:
        db.rollback()
        raise

    return {
        "message": "Electoral register imported successfully.",
        "created_wards": created_wards,
        "created_polling_units": created_units,
    }