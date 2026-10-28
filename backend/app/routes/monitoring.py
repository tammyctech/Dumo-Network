from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import PollingUnit, User
from ..security import get_current_user
from ..monitoring.schemas import MonitoringResponse


router = APIRouter(
    prefix="/api/dashboard",
    tags=["Election Monitoring"]
)


@router.get(
    "/monitoring",
    response_model=MonitoringResponse
)
def get_monitoring_dashboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Rivers State election monitoring dashboard.

    Only real polling-unit totals are currently available.
    Submission statistics will be added when the result
    submission database and API are implemented.
    """

    total_polling_units = (
        db.query(func.count(PollingUnit.id))
        .filter(
            func.lower(func.trim(PollingUnit.state)) == "rivers"
        )
        .scalar()
    ) or 0

    return MonitoringResponse(
        state="Rivers",
        total_polling_units=total_polling_units,

        submitted_polling_units=None,
        awaiting_submission=None,
        submission_coverage=None,

        updated_results=None,
        flagged_submissions=None,

        recent_uploads=[],
        results_by_lga=[],
        party_vote_totals=[],

        data_type="unofficial_agent_submitted"
    )