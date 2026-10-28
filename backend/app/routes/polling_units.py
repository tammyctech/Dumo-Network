from fastapi import APIRouter, Depends, HTTPException, Query, status

from sqlalchemy import select, func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import PollingUnit, Ward, User, AuditLog

from ..schemas import (
    PollingUnitCreate,
    PollingUnitResponse,
    PollingUnitUpdate,
)

from ..security import get_current_user, require_role


# ============================================================
# ROUTER
# ============================================================

router = APIRouter(
    prefix="/api/polling-units",
    tags=["Polling Units"],
)


# ============================================================
# VALIDATE REGISTERED WARD
# ============================================================

def validate_registered_ward(
    db: Session,
    state: str,
    lga: str,
    ward: str,
) -> None:

    if state != "Rivers":
        raise HTTPException(
            status_code=400,
            detail="Only Rivers State polling units are supported",
        )

    registered = db.scalar(
        select(Ward.id).where(
            Ward.state == "Rivers",
            Ward.lga == lga,
            Ward.name == ward,
        )
    )

    if registered is None:
        raise HTTPException(
            status_code=400,
            detail=(
                "The selected ward is not registered "
                "under this Rivers State LGA"
            ),
        )


# ============================================================
# CREATE POLLING UNIT
# ADMIN ONLY
# ============================================================

@router.post(
    "/",
    response_model=PollingUnitResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_polling_unit(
    polling_unit: PollingUnitCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):

    data = polling_unit.model_dump()

    # Clean string values
    data = {
        key: value.strip() if isinstance(value, str) else value
        for key, value in data.items()
    }

    # Validate state, LGA, and ward
    validate_registered_ward(
        db,
        data["state"],
        data["lga"],
        data["ward"],
    )

    # Prevent duplicate polling unit codes
    existing = db.scalar(
        select(PollingUnit.id).where(
            PollingUnit.code == data["code"]
        )
    )

    if existing is not None:
        raise HTTPException(
            status_code=409,
            detail="A polling unit with this code already exists",
        )

    new_unit = PollingUnit(**data)

    try:
        db.add(new_unit)
        db.flush()

        # Audit log
        db.add(
            AuditLog(
                user_id=current_user.id,
                action="CREATE",
                table_name="polling_units",
                record_id=new_unit.id,
                old_data=None,
                new_data=data,
            )
        )

        db.commit()

    except IntegrityError:
        db.rollback()

        raise HTTPException(
            status_code=409,
            detail=(
                "Polling unit code or database "
                "constraint conflict"
            ),
        )

    except Exception:
        db.rollback()
        raise

    db.refresh(new_unit)

    return new_unit


# ============================================================
# GET ALL POLLING UNITS
# EXISTING ENDPOINT - PRESERVED
# ============================================================

@router.get(
    "/",
    response_model=list[PollingUnitResponse],
)
def get_polling_units(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):

    units = db.scalars(
        select(PollingUnit).order_by(PollingUnit.id)
    ).all()

    return units


# ============================================================
# POLLING UNIT STATISTICS
# ============================================================

@router.get("/summary")
def polling_units_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):

    # Total polling units
    total_polling_units = db.scalar(
        select(func.count(PollingUnit.id))
    ) or 0

    # Number of LGAs containing polling units
    total_lgas = db.scalar(
        select(
            func.count(
                func.distinct(PollingUnit.lga)
            )
        )
    ) or 0

    # Count unique LGA + ward combinations
    distinct_wards = (
        select(
            PollingUnit.lga,
            PollingUnit.ward,
        )
        .distinct()
        .subquery()
    )

    total_wards = db.scalar(
        select(func.count()).select_from(distinct_wards)
    ) or 0

    return {
        "total_polling_units": total_polling_units,
        "total_lgas": total_lgas,
        "total_wards": total_wards,
    }


# ============================================================
# POLLING UNIT DIRECTORY
# SEARCH + FILTER + PAGINATION
# ============================================================

@router.get("/directory")
def polling_units_directory(
    lga: str | None = None,
    ward: str | None = None,
    search: str | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):

    query = select(PollingUnit)

    # Filter by LGA
    if lga:
        query = query.where(
            PollingUnit.lga == lga.strip()
        )

    # Filter by ward
    if ward:
        query = query.where(
            PollingUnit.ward == ward.strip()
        )

    # Search polling unit records
    if search and search.strip():

        search_term = f"%{search.strip()}%"

        query = query.where(
            or_(
                PollingUnit.code.ilike(search_term),
                PollingUnit.name.ilike(search_term),
                PollingUnit.lga.ilike(search_term),
                PollingUnit.ward.ilike(search_term),
            )
        )

    # Count matching records
    count_query = select(func.count()).select_from(
        query.subquery()
    )

    total = db.scalar(count_query) or 0

    # Pagination
    offset = (page - 1) * page_size

    units = db.scalars(
        query.order_by(
            PollingUnit.lga,
            PollingUnit.ward,
            PollingUnit.code,
            PollingUnit.id,
        )
        .offset(offset)
        .limit(page_size)
    ).all()

    total_pages = (
        (total + page_size - 1) // page_size
    )

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
        "polling_units": [
            {
                "id": unit.id,
                "code": unit.code,
                "name": unit.name,
                "state": unit.state,
                "lga": unit.lga,
                "ward": unit.ward,
            }
            for unit in units
        ],
    }


# ============================================================
# GET REGISTERED WARDS FOR AN LGA
# ============================================================

@router.get("/wards")
def get_polling_unit_wards(
    lga: str = Query(min_length=1),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):

    registered_wards = db.scalars(
        select(Ward.name)
        .where(
            Ward.state == "Rivers",
            Ward.lga == lga.strip(),
        )
        .order_by(Ward.ward_number)
    ).all()

    return {
        "lga": lga,
        "wards": list(registered_wards),
    }


# ============================================================
# UPDATE POLLING UNIT
# ADMIN ONLY
# ============================================================

@router.patch(
    "/{polling_unit_id}",
    response_model=PollingUnitResponse,
)
def update_polling_unit(
    polling_unit_id: int,
    update_data: PollingUnitUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):

    # Lock record while updating
    unit = db.scalar(
        select(PollingUnit)
        .where(PollingUnit.id == polling_unit_id)
        .with_for_update()
    )

    if unit is None:
        raise HTTPException(
            status_code=404,
            detail="Polling unit not found",
        )

    changes = update_data.model_dump(
        exclude_unset=True
    )

    if not changes:
        raise HTTPException(
            status_code=400,
            detail="No fields provided for update",
        )

    if any(value is None for value in changes.values()):
        raise HTTPException(
            status_code=422,
            detail="Polling unit fields cannot be null",
        )

    # Clean string values
    changes = {
        key: value.strip() if isinstance(value, str) else value
        for key, value in changes.items()
    }

    # Detect actual changes
    actual_changes = {
        field: value
        for field, value in changes.items()
        if getattr(unit, field) != value
    }

    if not actual_changes:
        raise HTTPException(
            status_code=400,
            detail="No changes detected",
        )

    # Validate new ward if location is modified
    validate_registered_ward(
        db,
        actual_changes.get("state", unit.state),
        actual_changes.get("lga", unit.lga),
        actual_changes.get("ward", unit.ward),
    )

    # Preserve previous values for audit log
    previous_data = {
        field: getattr(unit, field)
        for field in actual_changes
    }

    # Apply updates
    for field, value in actual_changes.items():
        setattr(unit, field, value)

    try:

        db.add(
            AuditLog(
                user_id=current_user.id,
                action="UPDATE",
                table_name="polling_units",
                record_id=unit.id,
                old_data=previous_data,
                new_data=actual_changes,
            )
        )

        db.commit()

    except IntegrityError:
        db.rollback()

        raise HTTPException(
            status_code=409,
            detail=(
                "Polling unit update conflicts "
                "with an existing record or database constraint"
            ),
        )

    except Exception:
        db.rollback()
        raise

    db.refresh(unit)

    return unit