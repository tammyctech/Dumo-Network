from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    UploadFile,
)

from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from app.database import get_db
from app.models import Ward
from app.security import require_admin

# Existing ward importer
from app.imports.service import (
    MAX_FILE_SIZE,
    parse_ward_csv,
    validate_ward_import,
)

# New unified electoral register importer
from app.imports.electoral_service import (
    parse_electoral_csv,
    validate_electoral_import,
    import_electoral_records,
)


# ============================================================
# ROUTER CONFIGURATION
# ============================================================

router = APIRouter(
    prefix="/api/admin/import",
    tags=["Bulk Import"],
    dependencies=[Depends(require_admin)],
)


# ============================================================
# SHARED CSV UPLOAD VALIDATION
# ============================================================

async def read_csv_upload(file: UploadFile) -> bytes:
    """
    Validate and read a CSV upload.

    Maximum file size: 5 MB.
    """

    if (
        not file.filename
        or not file.filename.lower().endswith(".csv")
    ):
        raise HTTPException(
            status_code=400,
            detail="Please upload a CSV file.",
        )

    content = await file.read(MAX_FILE_SIZE + 1)

    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail="CSV file exceeds the 5 MB limit.",
        )

    if not content:
        raise HTTPException(
            status_code=400,
            detail="The uploaded CSV file is empty.",
        )

    return content


# ============================================================
# EXISTING WARD IMPORT VALIDATION
# ============================================================

def prepare_ward_import(
    content: bytes,
    db: Session,
):
    """
    Parse and validate a ward CSV before importing.
    """

    try:
        records, errors = parse_ward_csv(content)

    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        ) from exc

    return validate_ward_import(
        db=db,
        records=records,
        errors=errors,
    )


# ============================================================
# 1. PREVIEW WARD IMPORT
# ============================================================

@router.post("/wards/preview")
async def preview_ward_import(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """
    Preview a ward CSV without modifying the database.
    """

    content = await read_csv_upload(file)

    report = prepare_ward_import(content, db)

    return {
        "message": "Ward CSV validation completed.",
        "can_import": report["error_count"] == 0,
        **report,
    }


# ============================================================
# 2. SAVE WARD IMPORT
# ============================================================

@router.post("/wards")
async def import_wards(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """
    Import validated ward records into PostgreSQL.
    """

    content = await read_csv_upload(file)

    report = prepare_ward_import(content, db)

    if report["error_count"] > 0:
        raise HTTPException(
            status_code=422,
            detail={
                "message": (
                    "Import rejected. Correct all errors "
                    "before uploading again."
                ),
                "errors": report["errors"],
            },
        )

    wards = [
        Ward(
            state=record["state"],
            lga=record["lga"],
            ward_number=record["ward_number"],
            name=record["ward_name"],
        )
        for record in report["ready"]
    ]

    try:
        db.add_all(wards)
        db.commit()

    except IntegrityError:
        db.rollback()

        raise HTTPException(
            status_code=409,
            detail=(
                "Database conflict detected. "
                "Preview the file again before importing."
            ),
        )

    except Exception:
        db.rollback()
        raise

    return {
        "message": "Ward import completed successfully.",
        "imported": len(wards),
        "already_existing": report["skipped_count"],
        "errors": 0,
        "by_lga": report["by_lga"],
    }


# ============================================================
# UNIFIED ELECTORAL REGISTER IMPORT
# ============================================================

def prepare_electoral_import(
    content: bytes,
    db: Session,
):
    """
    Parse and validate wards and polling units together.
    """

    try:
        records, errors = parse_electoral_csv(content)

    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        ) from exc

    if errors:
        return records, {
            "valid": False,
            "can_import": False,
            "total_rows": len(records),
            "new_wards": 0,
            "new_polling_units": 0,
            "skipped_polling_units": 0,
            "errors": errors,
        }

    if not records:
        return records, {
            "valid": False,
            "can_import": False,
            "total_rows": 0,
            "new_wards": 0,
            "new_polling_units": 0,
            "skipped_polling_units": 0,
            "errors": ["CSV contains no records."],
        }

    report = validate_electoral_import(
        records=records,
        db=db,
    )

    report["can_import"] = report["valid"]

    return records, report


# ============================================================
# 3. PREVIEW UNIFIED ELECTORAL REGISTER
# ============================================================

@router.post("/electoral-register/preview")
async def preview_electoral_register(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """
    Preview wards and polling units from a single CSV.

    No database changes are made.
    """

    content = await read_csv_upload(file)

    records, report = prepare_electoral_import(
        content=content,
        db=db,
    )

    return {
        "message": "Electoral register validation completed.",
        **report,
    }


# ============================================================
# 4. IMPORT UNIFIED ELECTORAL REGISTER
# ============================================================

@router.post("/electoral-register")
async def upload_electoral_register(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """
    Import wards and polling units together.

    Existing records are reused when their details match.
    Conflicting records are rejected.
    """

    content = await read_csv_upload(file)

    records, report = prepare_electoral_import(
        content=content,
        db=db,
    )

    if not report["valid"]:
        raise HTTPException(
            status_code=422,
            detail={
                "message": (
                    "Electoral register import rejected. "
                    "Correct all validation errors first."
                ),
                "errors": report["errors"],
            },
        )

    try:
        result = import_electoral_records(
            records=records,
            db=db,
        )

    except IntegrityError:
        db.rollback()

        raise HTTPException(
            status_code=409,
            detail=(
                "Database conflict detected. "
                "Preview the electoral register again."
            ),
        )

    except ValueError as exc:
        db.rollback()

        raise HTTPException(
            status_code=422,
            detail=str(exc),
        ) from exc

    except Exception:
        db.rollback()
        raise

    return {
        **result,
        "total_rows": report["total_rows"],
        "skipped_polling_units": report[
            "skipped_polling_units"
        ],
        "errors": 0,
    }