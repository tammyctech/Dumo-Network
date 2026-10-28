import csv
import io
from collections import Counter

from sqlalchemy.orm import Session

from app.models import Ward
from app.wards.routes import RIVERS_LGAS


# ============================================================
# 1. CSV CONFIGURATION
# ============================================================

REQUIRED_COLUMNS = {
    "state",
    "lga",
    "ward_number",
    "ward_name",
}

MAX_FILE_SIZE = 5 * 1024 * 1024
MAX_ROWS = 10000


# ============================================================
# 2. RIVERS STATE LGA NAME NORMALIZATION
# ============================================================

# Alternative names commonly found in CSV files.
# Each maps to the canonical LGA name used by Dumo Network.

LGA_ALIASES = {
    "abua odual": "Abua/Odual",
    "akuku toru": "Akuku-Toru",
    "asari toru": "Asari-Toru",
    "obio akpor": "Obio/Akpor",
    "ogba egbema ndoni": "Ogba/Egbema/Ndoni",
    "ogu bolo": "Ogu/Bolo",
    "opobo nkoro": "Opobo/Nkoro",
}


def normalize_lga_name(lga: str) -> str:
    """
    Normalize recognized alternative LGA names.

    Examples:
        Abua Odual -> Abua/Odual
        Akuku Toru -> Akuku-Toru
        Obio Akpor -> Obio/Akpor

    Unknown names are not automatically accepted.
    They must still pass validation against RIVERS_LGAS.
    """

    cleaned = " ".join(lga.strip().split())

    return LGA_ALIASES.get(
        cleaned.casefold(),
        cleaned,
    )


# ============================================================
# 3. READ AND VALIDATE WARD CSV
# ============================================================

def parse_ward_csv(content: bytes):
    """
    Read and validate an uploaded ward CSV.

    Required columns:
        state
        lga
        ward_number
        ward_name

    Returns:
        records: Valid ward records
        errors: Validation errors
    """

    # --------------------------------------------------------
    # CHECK FILE CONTENT
    # --------------------------------------------------------

    if not content:
        raise ValueError(
            "The uploaded CSV file is empty."
        )

    if len(content) > MAX_FILE_SIZE:
        raise ValueError(
            "CSV file must not exceed 5 MB."
        )

    # --------------------------------------------------------
    # DECODE CSV
    # --------------------------------------------------------

    try:
        decoded = content.decode("utf-8-sig")

    except UnicodeDecodeError as exc:
        raise ValueError(
            "CSV file must use UTF-8 encoding."
        ) from exc

    # --------------------------------------------------------
    # READ CSV HEADERS
    # --------------------------------------------------------

    reader = csv.DictReader(
        io.StringIO(decoded)
    )

    if not reader.fieldnames:
        raise ValueError(
            "CSV file has no header row."
        )

    headers = [
        header.strip()
        for header in reader.fieldnames
    ]

    if len(headers) != len(set(headers)):
        raise ValueError(
            "CSV contains duplicate column headers."
        )

    missing = REQUIRED_COLUMNS - set(headers)

    if missing:
        raise ValueError(
            "Missing required columns: "
            + ", ".join(sorted(missing))
        )

    # Use cleaned headers when reading each row.
    reader.fieldnames = headers

    # --------------------------------------------------------
    # PREPARE VALIDATION
    # --------------------------------------------------------

    records = []
    errors = []

    seen = set()
    seen_names = set()

    # Canonical LGA lookup
    lga_lookup = {
        lga.casefold(): lga
        for lga in RIVERS_LGAS
    }

    # --------------------------------------------------------
    # PROCESS CSV ROWS
    # --------------------------------------------------------

    for line_number, row in enumerate(
        reader,
        start=2,
    ):

        # Maximum allowed records
        if line_number > MAX_ROWS + 1:
            raise ValueError(
                f"CSV exceeds the maximum of "
                f"{MAX_ROWS} data rows."
            )

        # Detect additional unexpected columns
        if None in row:
            errors.append({
                "row": line_number,
                "error": (
                    "Row contains more values "
                    "than the header."
                ),
            })
            continue

        # Clean row values
        row = {
            key.strip(): (value or "").strip()
            for key, value in row.items()
        }

        state = row["state"]
        raw_lga = row["lga"]
        ward_name = row["ward_name"]
        raw_number = row["ward_number"]

        # ----------------------------------------------------
        # VALIDATE STATE
        # ----------------------------------------------------

        if state.casefold() != "rivers":
            errors.append({
                "row": line_number,
                "error": "State must be Rivers.",
            })
            continue

        # ----------------------------------------------------
        # NORMALIZE AND VALIDATE LGA
        # ----------------------------------------------------

        normalized_lga = normalize_lga_name(
            raw_lga
        )

        lga = lga_lookup.get(
            normalized_lga.casefold()
        )

        if not lga:
            errors.append({
                "row": line_number,
                "error": f"Invalid LGA: {raw_lga}",
            })
            continue

        # ----------------------------------------------------
        # VALIDATE WARD NUMBER
        # ----------------------------------------------------

        if not raw_number.isascii() or not raw_number.isdecimal():
            errors.append({
                "row": line_number,
                "error": (
                    "Ward number must be "
                    "a positive integer."
                ),
            })
            continue

        ward_number = int(raw_number)

        if ward_number < 1 or ward_number > 100:
            errors.append({
                "row": line_number,
                "error": (
                    "Ward number must be "
                    "between 1 and 100."
                ),
            })
            continue

        # ----------------------------------------------------
        # VALIDATE WARD NAME
        # ----------------------------------------------------

        if not ward_name:
            errors.append({
                "row": line_number,
                "error": (
                    "Ward name cannot be empty."
                ),
            })
            continue

        if len(ward_name) > 100:
            errors.append({
                "row": line_number,
                "error": (
                    "Ward name exceeds "
                    "100 characters."
                ),
            })
            continue

        # ----------------------------------------------------
        # CHECK DUPLICATE WARD NUMBER
        # ----------------------------------------------------

        key = (
            lga,
            ward_number,
        )

        name_key = (
            lga,
            ward_name.casefold(),
        )

        if key in seen:
            errors.append({
                "row": line_number,
                "error": (
                    f"Duplicate ward number "
                    f"{ward_number} for {lga}."
                ),
            })
            continue

        # ----------------------------------------------------
        # CHECK DUPLICATE WARD NAME
        # ----------------------------------------------------

        if name_key in seen_names:
            errors.append({
                "row": line_number,
                "error": (
                    f"Duplicate ward name "
                    f"'{ward_name}' for {lga}."
                ),
            })
            continue

        # ----------------------------------------------------
        # REGISTER VALID RECORD
        # ----------------------------------------------------

        seen.add(key)
        seen_names.add(name_key)

        records.append({
            "row": line_number,
            "state": "Rivers",
            "lga": lga,
            "ward_number": ward_number,
            "ward_name": ward_name,
        })

    return records, errors


# ============================================================
# 4. VALIDATE AGAINST POSTGRESQL
# ============================================================

def validate_ward_import(
    db: Session,
    records: list,
    errors: list,
):
    """
    Compare uploaded ward records against PostgreSQL.

    Detects:
        - Existing identical wards
        - Conflicting ward numbers
        - Conflicting ward names

    Returns a validation report.

    This function does not modify the database.
    """

    # --------------------------------------------------------
    # LOAD EXISTING WARDS
    # --------------------------------------------------------

    existing_wards = (
        db.query(Ward)
        .filter(Ward.state == "Rivers")
        .all()
    )

    # Lookup by LGA and ward number
    existing_by_number = {
        (
            ward.lga,
            ward.ward_number,
        ): ward
        for ward in existing_wards
    }

    # Lookup by LGA and ward name
    existing_by_name = {
        (
            ward.lga,
            ward.name.casefold(),
        ): ward
        for ward in existing_wards
    }

    ready = []
    skipped = []

    # Include errors already found during CSV parsing.
    conflicts = list(errors)

    # --------------------------------------------------------
    # CHECK EACH UPLOADED RECORD
    # --------------------------------------------------------

    for record in records:

        key = (
            record["lga"],
            record["ward_number"],
        )

        name_key = (
            record["lga"],
            record["ward_name"].casefold(),
        )

        existing = existing_by_number.get(key)

        # ----------------------------------------------------
        # WARD NUMBER ALREADY EXISTS
        # ----------------------------------------------------

        if existing:

            if (
                existing.name.casefold()
                == record["ward_name"].casefold()
            ):

                skipped.append({
                    "row": record["row"],
                    "reason": "Ward already exists.",
                    "lga": record["lga"],
                    "ward_number": record["ward_number"],
                })

            else:

                conflicts.append({
                    "row": record["row"],
                    "error": (
                        f"Ward number "
                        f"{record['ward_number']} "
                        f"already exists in "
                        f"{record['lga']} "
                        f"as '{existing.name}'."
                    ),
                })

            continue

        # ----------------------------------------------------
        # WARD NAME ALREADY EXISTS
        # ----------------------------------------------------

        name_match = existing_by_name.get(
            name_key
        )

        if name_match:

            conflicts.append({
                "row": record["row"],
                "error": (
                    f"Ward name "
                    f"'{record['ward_name']}' "
                    f"already exists in "
                    f"{record['lga']} "
                    f"with ward number "
                    f"{name_match.ward_number}."
                ),
            })

            continue

        # ----------------------------------------------------
        # READY FOR IMPORT
        # ----------------------------------------------------

        ready.append(record)

    # --------------------------------------------------------
    # BUILD VALIDATION REPORT
    # --------------------------------------------------------

    return {
        "total_rows": len(records) + len(errors),
        "ready_count": len(ready),
        "skipped_count": len(skipped),
        "error_count": len(conflicts),
        "ready": ready,
        "skipped": skipped,
        "errors": conflicts,
        "by_lga": dict(
            Counter(
                record["lga"]
                for record in ready
            )
        ),
    }