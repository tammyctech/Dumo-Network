from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db

from app.models import (
    User,
    Election,
    PollingUnit,
)

from app.security import get_current_user


router = APIRouter(
    prefix="/api/admin",
    tags=["Admin Dropdown Options"],
)


# ==========================================
# ADMIN PERMISSION CHECK
# ==========================================

def require_admin(
    current_user: User = Depends(get_current_user),
):
    if not current_user.is_active:
        raise HTTPException(
            status_code=403,
            detail="Your account is inactive.",
        )

    if current_user.role != "admin":
        raise HTTPException(
            status_code=403,
            detail="Administrator access required.",
        )

    return current_user


# ==========================================
# GET ALL RIVERS STATE ELECTIONS
# ==========================================

@router.get("/elections")
def get_elections(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    elections = db.scalars(
        select(Election)
        .where(Election.state == "Rivers")
        .order_by(Election.election_date.desc())
    ).all()

    return {
        "state": "Rivers",
        "total": len(elections),
        "elections": [
            {
                "id": election.id,
                "name": election.name,
                "election_date": election.election_date,
            }
            for election in elections
        ],
    }


# ==========================================
# GET ALL RIVERS STATE POLLING UNITS
# ==========================================

@router.get("/polling-units")
def get_polling_units(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    polling_units = db.scalars(
        select(PollingUnit)
        .where(PollingUnit.state == "Rivers")
        .order_by(
            PollingUnit.lga,
            PollingUnit.ward,
            PollingUnit.name,
        )
    ).all()

    return {
        "state": "Rivers",
        "total": len(polling_units),
        "polling_units": [
            {
                "id": unit.id,
                "code": unit.code,
                "name": unit.name,
                "lga": unit.lga,
                "ward": unit.ward,
            }
            for unit in polling_units
        ],
    }


# ==========================================
# GET ALL ACTIVE AGENTS
# ==========================================

@router.get("/agents")
def get_agents(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    agents = db.scalars(
        select(User)
        .where(
            User.role == "agent",
            User.is_active.is_(True),
        )
        .order_by(User.full_name)
    ).all()

    return {
        "total": len(agents),
        "agents": [
            {
                "id": agent.id,
                "full_name": agent.full_name,
                "email": agent.email,
            }
            for agent in agents
        ],
    }