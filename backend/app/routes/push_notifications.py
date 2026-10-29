import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import PushSubscription, User
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