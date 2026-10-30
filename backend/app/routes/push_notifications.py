import logging
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import (
    AgentAssignment,
    AuditLog,
    NotificationCampaign,
    PollingUnit,
    PushSubscription,
    User,
)
from ..security import get_current_user, require_admin
from ..services.push_service import (
    send_push_notification,
    validate_push_endpoint,
)

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/push",
    tags=["Push Notifications"],
)


# =====================================================
# REQUEST SCHEMAS
# =====================================================

class SubscriptionKeys(BaseModel):
    p256dh: str = Field(min_length=1, max_length=255)
    auth: str = Field(min_length=1, max_length=255)


class SubscribeRequest(BaseModel):
    endpoint: str = Field(min_length=1, max_length=2048)
    keys: SubscriptionKeys


class UnsubscribeRequest(BaseModel):
    endpoint: str = Field(min_length=1, max_length=2048)


class TestNotificationRequest(BaseModel):
    user_id: int = Field(gt=0)


class SendNotificationRequest(BaseModel):
    title: str = Field(min_length=2, max_length=120)
    body: str = Field(min_length=2, max_length=500)
    url: str = Field(default="/dashboard", min_length=1, max_length=500)
    audience_type: Literal["selected_agents", "election", "lga", "all_agents"]
    user_ids: list[int] = Field(default_factory=list, max_length=200)
    election_id: int | None = Field(default=None, gt=0)
    lga: str | None = Field(default=None, max_length=100)

    @model_validator(mode="after")
    def validate_audience(self):
        if not self.url.startswith("/") or self.url.startswith("//"):
            raise ValueError("Notification URL must be a relative application path.")
        if self.audience_type == "selected_agents" and not self.user_ids:
            raise ValueError("Select at least one agent.")
        if self.audience_type == "election" and self.election_id is None:
            raise ValueError("Select an election.")
        if self.audience_type == "lga" and not (self.lga or "").strip():
            raise ValueError("Select an LGA.")
        return self


# =====================================================
# SUBSCRIPTION VALIDATION
# =====================================================

def validate_endpoint(endpoint: str) -> None:
    try:
        validate_push_endpoint(endpoint)
    except (ValueError, TypeError) as error:
        raise HTTPException(
            status_code=422,
            detail="Unsupported or invalid push subscription endpoint",
        ) from error


# =====================================================
# REGISTER DEVICE
# =====================================================

@router.post("/subscribe")
def subscribe(
    payload: SubscribeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    validate_endpoint(payload.endpoint)

    subscription = (
        db.query(PushSubscription)
        .filter(
            PushSubscription.endpoint == payload.endpoint
        )
        .first()
    )

    if subscription:
        if subscription.user_id != current_user.id:
            raise HTTPException(
                status_code=409,
                detail="Subscription is already registered",
            )

        subscription.p256dh = payload.keys.p256dh
        subscription.auth = payload.keys.auth

        message = "Subscription updated"

    else:
        subscription = PushSubscription(
            user_id=current_user.id,
            endpoint=payload.endpoint,
            p256dh=payload.keys.p256dh,
            auth=payload.keys.auth,
        )

        db.add(subscription)

        message = "Device registered successfully"

    db.commit()

    return {
        "success": True,
        "message": message,
    }


# =====================================================
# REMOVE DEVICE
# =====================================================

@router.delete("/unsubscribe")
def unsubscribe(
    payload: UnsubscribeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    subscription = (
        db.query(PushSubscription)
        .filter(
            PushSubscription.endpoint == payload.endpoint,
            PushSubscription.user_id == current_user.id,
        )
        .first()
    )

    if subscription:
        db.delete(subscription)
        db.commit()

    return {
        "success": True,
        "message": "Device subscription removed",
    }


# =====================================================
# CHECK SUBSCRIPTION STATUS
# =====================================================

@router.get("/status")
def subscription_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    count = (
        db.query(PushSubscription)
        .filter(
            PushSubscription.user_id == current_user.id
        )
        .count()
    )

    return {
        "enabled": count > 0,
        "device_count": count,
    }


def resolve_recipient_ids(payload: SendNotificationRequest, db: Session) -> list[int]:
    query = select(User.id).where(
        User.role == "agent",
        User.is_active.is_(True),
    )
    if payload.audience_type == "selected_agents":
        query = query.where(User.id.in_(set(payload.user_ids)))
    elif payload.audience_type == "election":
        query = query.join(
            AgentAssignment, AgentAssignment.agent_id == User.id
        ).where(AgentAssignment.election_id == payload.election_id)
    elif payload.audience_type == "lga":
        query = (
            query.join(AgentAssignment, AgentAssignment.agent_id == User.id)
            .join(PollingUnit, PollingUnit.id == AgentAssignment.polling_unit_id)
            .where(PollingUnit.state == "Rivers", PollingUnit.lga == payload.lga.strip())
        )
    return sorted(set(db.scalars(query).all()))


@router.post("/send")
def send_notification(
    payload: SendNotificationRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    recipient_ids = resolve_recipient_ids(payload, db)
    if not recipient_ids:
        raise HTTPException(status_code=404, detail="No active agents match this audience.")

    subscriptions = db.scalars(
        select(PushSubscription)
        .where(PushSubscription.user_id.in_(recipient_ids))
        .order_by(PushSubscription.id)
        .limit(500)
    ).all()

    campaign = NotificationCampaign(
        created_by=admin.id,
        title=payload.title.strip(),
        body=payload.body.strip(),
        url=payload.url,
        audience_type=payload.audience_type,
        audience_data={
            "user_ids": payload.user_ids if payload.audience_type == "selected_agents" else [],
            "election_id": payload.election_id,
            "lga": payload.lga.strip() if payload.lga else None,
        },
        target_users=len(recipient_ids),
        devices_found=len(subscriptions),
    )
    db.add(campaign)
    db.flush()

    for subscription in subscriptions:
        try:
            result = send_push_notification(
                subscription=subscription,
                title=campaign.title,
                body=campaign.body,
                url=campaign.url,
            )
            if result["success"]:
                campaign.sent += 1
            elif result.get("status_code") in (404, 410):
                db.delete(subscription)
                campaign.expired_removed += 1
            else:
                campaign.failed += 1
        except (ValueError, RuntimeError):
            campaign.failed += 1
            logger.warning(
                "Notification campaign %s delivery configuration failed",
                campaign.id,
            )
        except Exception:
            campaign.failed += 1
            logger.exception(
                "Unexpected campaign %s delivery failure",
                campaign.id,
            )

    db.add(
        AuditLog(
            user_id=admin.id,
            action="send_notification",
            table_name="notification_campaigns",
            record_id=campaign.id,
            old_data=None,
            new_data={
                "audience_type": campaign.audience_type,
                "target_users": campaign.target_users,
                "devices_found": campaign.devices_found,
                "sent": campaign.sent,
                "failed": campaign.failed,
            },
        )
    )
    db.commit()
    db.refresh(campaign)

    return {
        "success": campaign.sent > 0,
        "campaign_id": campaign.id,
        "target_users": campaign.target_users,
        "devices_found": campaign.devices_found,
        "sent": campaign.sent,
        "failed": campaign.failed,
        "expired_removed": campaign.expired_removed,
        "message": (
            "Notification delivery completed."
            if subscriptions
            else "Audience resolved, but no registered devices were found."
        ),
    }


@router.get("/campaigns")
def notification_campaigns(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    rows = db.execute(
        select(NotificationCampaign, User)
        .join(User, User.id == NotificationCampaign.created_by)
        .order_by(NotificationCampaign.created_at.desc())
        .limit(100)
    ).all()
    return {
        "campaigns": [
            {
                "id": campaign.id,
                "title": campaign.title,
                "body": campaign.body,
                "url": campaign.url,
                "audience_type": campaign.audience_type,
                "audience_data": campaign.audience_data,
                "target_users": campaign.target_users,
                "devices_found": campaign.devices_found,
                "sent": campaign.sent,
                "failed": campaign.failed,
                "expired_removed": campaign.expired_removed,
                "created_at": campaign.created_at,
                "created_by": creator.full_name,
            }
            for campaign, creator in rows
        ]
    }


# =====================================================
# ADMINISTRATOR TEST NOTIFICATION
# =====================================================

@router.post("/test")
def test_push_notification(
    payload: TestNotificationRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """
    Send a test notification to the specified user's
    registered devices.

    Administrator access is required.
    """

    target_user = (
        db.query(User)
        .filter(
            User.id == payload.user_id,
            User.is_active.is_(True),
        )
        .first()
    )

    if not target_user:
        raise HTTPException(
            status_code=404,
            detail="Active user not found",
        )

    subscriptions = (
        db.query(PushSubscription)
        .filter(
            PushSubscription.user_id == target_user.id
        )
        .all()
    )

    if not subscriptions:
        raise HTTPException(
            status_code=404,
            detail="No registered devices found for this user",
        )

    sent = 0
    failed = 0
    expired = 0

    for subscription in subscriptions:
        try:
            result = send_push_notification(
                subscription=subscription,
                title="Dumo Network Test Notification",
                body=(
                    "Push notifications are now connected "
                    "to your DYN account."
                ),
                url="/dashboard",
            )

            if result["success"]:
                sent += 1
                continue

            status_code = result.get("status_code")

            if status_code in (404, 410):
                db.delete(subscription)
                expired += 1
            else:
                failed += 1

                logger.warning(
                    "Push delivery failed for subscription %s "
                    "with status %s",
                    subscription.id,
                    status_code,
                )

        except (ValueError, RuntimeError) as error:
            failed += 1

            logger.warning(
                "Push delivery configuration or validation "
                "failed for subscription %s: %s",
                subscription.id,
                type(error).__name__,
            )

        except Exception:
            failed += 1

            logger.exception(
                "Unexpected push delivery error for subscription %s",
                subscription.id,
            )

    if expired:
        db.commit()

    return {
        "success": sent > 0,
        "message": (
            "Test notification requests processed"
        ),
        "user_id": target_user.id,
        "devices_found": len(subscriptions),
        "sent": sent,
        "failed": failed,
        "expired_removed": expired,
    }
