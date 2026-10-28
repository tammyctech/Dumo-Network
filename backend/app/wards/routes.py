from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Ward, PollingUnit
from app.security import require_admin


# ============================================================
# DUMO YOUTH NETWORK
# WARD MANAGEMENT API
# ============================================================

router = APIRouter(
    prefix="/api/wards",
    tags=["Ward Management"],
)


# ============================================================
# RIVERS STATE LOCAL GOVERNMENT AREAS
# ============================================================

RIVERS_LGAS = [
    "Abua/Odual",
    "Ahoada East",
    "Ahoada West",
    "Akuku-Toru",
    "Andoni",
    "Asari-Toru",
    "Bonny",
    "Degema",
    "Eleme",
    "Emohua",
    "Etche",
    "Gokana",
    "Ikwerre",
    "Khana",
    "Obio/Akpor",
    "Ogba/Egbema/Ndoni",
    "Ogu/Bolo",
    "Okrika",
    "Omuma",
    "Opobo/Nkoro",
    "Oyigbo",
    "Port Harcourt",
    "Tai",
]


# ============================================================
# SCHEMAS
# ============================================================

class WardGenerateRequest(BaseModel):
    lga: str = Field(min_length=1)
    number_of_wards: int = Field(ge=1, le=100)


# ============================================================
# HELPER FUNCTIONS
# ============================================================

def validate_lga(lga: str) -> str:
    """
    Validate and return the canonical LGA name.
    """

    cleaned = lga.strip()

    for valid_lga in RIVERS_LGAS:
        if valid_lga.casefold() == cleaned.casefold():
            return valid_lga

    raise HTTPException(
        status_code=400,
        detail="Invalid Rivers State LGA",
    )


def get_polling_unit_query(
    db: Session,
    ward: Ward,
):
    """
    Find polling units belonging to a ward.

    The current PollingUnit model stores the ward name
    as a string rather than a ward_id foreign key.
    """

    return db.query(PollingUnit).filter(
        func.lower(func.trim(PollingUnit.state))
        == ward.state.strip().lower(),

        func.lower(func.trim(PollingUnit.lga))
        == ward.lga.strip().lower(),

        func.lower(func.trim(PollingUnit.ward))
        == ward.name.strip().lower(),
    )


def serialize_ward(
    db: Session,
    ward: Ward,
):
    """
    Convert a ward record into an API response.
    """

    polling_unit_count = (
        get_polling_unit_query(db, ward)
        .count()
    )

    return {
        "id": ward.id,
        "state": ward.state,
        "lga": ward.lga,
        "ward_number": ward.ward_number,
        "name": ward.name,
        "polling_unit_count": polling_unit_count,
    }


# ============================================================
# 1. GET ALL RIVERS STATE LGAS
# ============================================================

@router.get("/lgas")
def get_rivers_lgas():

    return {
        "state": "Rivers",
        "total_lgas": len(RIVERS_LGAS),
        "lgas": RIVERS_LGAS,
    }


# ============================================================
# 2. WARD MANAGEMENT SUMMARY
# ============================================================

@router.get("/summary")
def get_ward_summary(
    db: Session = Depends(get_db),
):

    total_wards = (
        db.query(Ward)
        .filter(Ward.state == "Rivers")
        .count()
    )

    registered_lgas = (
        db.query(
            func.count(func.distinct(Ward.lga))
        )
        .filter(Ward.state == "Rivers")
        .scalar()
        or 0
    )

    total_polling_units = (
        db.query(PollingUnit)
        .filter(PollingUnit.state == "Rivers")
        .count()
    )

    return {
        "state": "Rivers",
        "total_lgas": len(RIVERS_LGAS),
        "registered_lgas": registered_lgas,
        "total_wards": total_wards,
        "total_polling_units": total_polling_units,
    }


# ============================================================
# 3. GET WARD REGISTRATION COUNTS
# ============================================================

@router.get("/counts")
def get_ward_counts(
    db: Session = Depends(get_db),
):

    results = []

    for lga in RIVERS_LGAS:

        registered_wards = (
            db.query(Ward)
            .filter(
                Ward.state == "Rivers",
                Ward.lga == lga,
            )
            .count()
        )

        polling_units = (
            db.query(PollingUnit)
            .filter(
                PollingUnit.state == "Rivers",
                PollingUnit.lga == lga,
            )
            .count()
        )

        results.append({
            "lga": lga,
            "registered_wards": registered_wards,
            "polling_units": polling_units,
            "status": (
                "Registered"
                if registered_wards > 0
                else "Not Registered"
            ),
        })

    return {
        "state": "Rivers",
        "total_lgas": len(RIVERS_LGAS),
        "registration_counts": results,
    }


# ============================================================
# 4. GET ALL WARDS FOR AN LGA
# ============================================================

@router.get("")
def get_wards(
    lga: str = Query(...),
    search: str | None = Query(None),
    db: Session = Depends(get_db),
):

    canonical_lga = validate_lga(lga)

    query = db.query(Ward).filter(
        Ward.state == "Rivers",
        Ward.lga == canonical_lga,
    )

    if search and search.strip():

        search_text = search.strip()

        filters = [
            Ward.name.ilike(f"%{search_text}%"),
        ]

        if search_text.isdigit():
            filters.append(
                Ward.ward_number == int(search_text)
            )

        query = query.filter(or_(*filters))

    wards = (
        query
        .order_by(Ward.ward_number.asc())
        .all()
    )

    return {
        "state": "Rivers",
        "lga": canonical_lga,
        "total_wards": len(wards),
        "wards": [
            serialize_ward(db, ward)
            for ward in wards
        ],
    }


# ============================================================
# 5. GET WARD DETAILS AND POLLING UNITS
# ============================================================

@router.get("/details/{ward_id}")
def get_ward_details(
    ward_id: int,
    db: Session = Depends(get_db),
):

    ward = (
        db.query(Ward)
        .filter(
            Ward.id == ward_id,
            Ward.state == "Rivers",
        )
        .first()
    )

    if not ward:
        raise HTTPException(
            status_code=404,
            detail="Ward not found",
        )

    polling_units = (
        get_polling_unit_query(db, ward)
        .order_by(PollingUnit.code.asc())
        .all()
    )

    return {
        "id": ward.id,
        "state": ward.state,
        "lga": ward.lga,
        "ward_number": ward.ward_number,
        "name": ward.name,
        "polling_unit_count": len(polling_units),
        "polling_units": [
            {
                "id": unit.id,
                "code": unit.code,
                "name": unit.name,
                "state": unit.state,
                "lga": unit.lga,
                "ward": unit.ward,
            }
            for unit in polling_units
        ],
    }


# ============================================================
# 6. GET ALL WARDS ACROSS RIVERS STATE
# ============================================================

@router.get("/all")
def get_all_wards(
    lga: str | None = Query(None),
    search: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    db: Session = Depends(get_db),
):

    query = db.query(Ward).filter(
        Ward.state == "Rivers"
    )

    if lga:
        canonical_lga = validate_lga(lga)

        query = query.filter(
            Ward.lga == canonical_lga
        )

    if search and search.strip():

        search_text = search.strip()

        filters = [
            Ward.name.ilike(f"%{search_text}%"),
            Ward.lga.ilike(f"%{search_text}%"),
        ]

        if search_text.isdigit():
            filters.append(
                Ward.ward_number == int(search_text)
            )

        query = query.filter(or_(*filters))

    total = query.count()

    wards = (
        query
        .order_by(
            Ward.lga.asc(),
            Ward.ward_number.asc(),
        )
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    return {
        "state": "Rivers",
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": (
            (total + page_size - 1) // page_size
        ),
        "wards": [
            serialize_ward(db, ward)
            for ward in wards
        ],
    }


# ============================================================
# 7. DISABLE PROVISIONAL WARD GENERATION
# ============================================================

@router.post("/generate")
def generate_wards(
    request: WardGenerateRequest,
    admin=Depends(require_admin),
):
    """
    Legacy endpoint retained for compatibility.

    Wards must now be created through the electoral
    register Bulk Import workflow.
    """

    raise HTTPException(
        status_code=410,
        detail=(
            "Manual ward generation has been disabled. "
            "Please use Bulk Import to register verified "
            "electoral wards."
        ),
    )