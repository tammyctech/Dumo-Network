import hashlib
import os
from datetime import datetime, timedelta, timezone
from urllib.parse import unquote, urlparse

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import SiteVisit, User
from ..security import require_admin


router = APIRouter(prefix="/api/site-analytics", tags=["Site Analytics"])


class VisitRequest(BaseModel):
    visitor_id: str = Field(min_length=16, max_length=100)
    path: str = Field(min_length=1, max_length=300)
    referrer: str | None = Field(default=None, max_length=1000)
    timezone: str | None = Field(default=None, max_length=100)
    model_config = ConfigDict(extra="forbid")


def _header(request: Request, *names: str) -> str | None:
    for name in names:
        value = request.headers.get(name)
        if value and value.strip():
            return unquote(value.strip())[:100]
    return None


@router.post("/visit", status_code=202)
def record_visit(payload: VisitRequest, request: Request, db: Session = Depends(get_db)):
    if not payload.path.startswith("/") or payload.path.startswith("//"):
        return {"tracked": False}

    secret = os.getenv("JWT_SECRET_KEY", "site-analytics")
    visitor_hash = hashlib.sha256(f"{secret}:{payload.visitor_id}".encode()).hexdigest()
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=30)
    duplicate = db.scalar(
        select(SiteVisit.id).where(
            SiteVisit.visitor_hash == visitor_hash,
            SiteVisit.path == payload.path,
            SiteVisit.created_at >= cutoff,
        ).limit(1)
    )
    if duplicate:
        return {"tracked": False}

    referrer_domain = None
    if payload.referrer:
        try:
            referrer_domain = urlparse(payload.referrer).hostname
        except ValueError:
            referrer_domain = None

    db.add(SiteVisit(
        visitor_hash=visitor_hash,
        path=payload.path,
        referrer_domain=referrer_domain,
        country=_header(request, "x-vercel-ip-country", "cf-ipcountry"),
        region=_header(request, "x-vercel-ip-country-region", "x-vercel-ip-region"),
        city=_header(request, "x-vercel-ip-city"),
        timezone=payload.timezone,
    ))
    db.commit()
    return {"tracked": True}


@router.get("/summary")
def visit_summary(
    days: int = 30,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    days = max(1, min(days, 365))
    now = datetime.now(timezone.utc)
    start = now - timedelta(days=days)
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    filters = (SiteVisit.created_at >= start,)

    total_views = db.scalar(select(func.count(SiteVisit.id)).where(*filters)) or 0
    unique_visitors = db.scalar(
        select(func.count(func.distinct(SiteVisit.visitor_hash))).where(*filters)
    ) or 0
    views_today = db.scalar(
        select(func.count(SiteVisit.id)).where(SiteVisit.created_at >= today)
    ) or 0
    daily_rows = db.execute(
        select(func.date(SiteVisit.created_at), func.count(SiteVisit.id))
        .where(*filters)
        .group_by(func.date(SiteVisit.created_at))
        .order_by(func.date(SiteVisit.created_at))
    ).all()
    location_rows = db.execute(
        select(SiteVisit.country, SiteVisit.region, SiteVisit.city, func.count(SiteVisit.id).label("views"))
        .where(*filters)
        .group_by(SiteVisit.country, SiteVisit.region, SiteVisit.city)
        .order_by(func.count(SiteVisit.id).desc())
        .limit(20)
    ).all()
    page_rows = db.execute(
        select(SiteVisit.path, func.count(SiteVisit.id).label("views"))
        .where(*filters)
        .group_by(SiteVisit.path)
        .order_by(func.count(SiteVisit.id).desc())
        .limit(10)
    ).all()

    return {
        "period_days": days,
        "total_views": total_views,
        "unique_visitors": unique_visitors,
        "views_today": views_today,
        "daily": [{"date": str(day), "views": views} for day, views in daily_rows],
        "locations": [
            {"country": country or "Unknown", "region": region, "city": city, "views": views}
            for country, region, city, views in location_rows
        ],
        "pages": [{"path": path, "views": views} for path, views in page_rows],
    }
