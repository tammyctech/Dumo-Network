from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from app.utils.phone import normalize_nigerian_phone

router = APIRouter(prefix="/api/phone", tags=["Phone Validation"])


class PhoneValidationRequest(BaseModel):
    phone_number: str = Field(min_length=1, max_length=30)
    model_config = ConfigDict(extra="forbid")


@router.post("/validate")
def validate_phone(payload: PhoneValidationRequest):
    """Validate without creating or changing an account."""
    try:
        normalized = normalize_nigerian_phone(payload.phone_number)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    return {"valid": True, "normalized_phone_number": normalized}
