from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import User
from ..schemas import (
    UserCreate,
    UserResponse,
    TokenResponse,
    UserProfileUpdate,
)
from ..security import (
    hash_password,
    verify_password,
    create_access_token,
    get_current_user
)


router = APIRouter(
    prefix="/api/auth",
    tags=["Authentication"]
)


@router.post(
    "/register",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED
)
def register(
    user_data: UserCreate,
    db: Session = Depends(get_db)
):

    email = str(user_data.email).lower()

    existing_user = db.scalar(
        select(User).where(User.email == email)
    )

    if existing_user:
        raise HTTPException(
            status_code=409,
            detail="Email already registered"
        )

    new_user = User(
        full_name=user_data.full_name,
        email=email,
        hashed_password=hash_password(
            user_data.password
        ),
        role="observer",
        is_active=True
    )

    db.add(new_user)

    try:
        db.commit()

    except IntegrityError:
        db.rollback()

        raise HTTPException(
            status_code=409,
            detail="Email already registered"
        )

    db.refresh(new_user)

    return new_user


@router.post(
    "/login",
    response_model=TokenResponse
)
def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):

    email = form_data.username.lower()

    user = db.scalar(
        select(User).where(User.email == email)
    )

    if user is None:
        raise HTTPException(
            status_code=401,
            detail="Invalid email or password"
        )

    if not verify_password(
        form_data.password,
        user.hashed_password
    ):
        raise HTTPException(
            status_code=401,
            detail="Invalid email or password"
        )

    if not user.is_active:
        raise HTTPException(
            status_code=403,
            detail="Account is inactive"
        )

    token = create_access_token(user.id)

    return {
        "access_token": token,
        "token_type": "bearer"
    }


@router.get(
    "/me",
    response_model=UserResponse
)
def get_profile(
    current_user: User = Depends(get_current_user)
):

    return current_user

@router.patch(
    "/me",
    response_model=UserResponse
)
def update_profile(
    profile_data: UserProfileUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Update the authenticated user's profile.

    Only full_name and phone_number can be updated.
    """

    updates = profile_data.model_fields_set

    if "full_name" in updates:
        if profile_data.full_name is None:
            raise HTTPException(
                status_code=422,
                detail="Full name cannot be null"
            )

        full_name = profile_data.full_name.strip()

        if len(full_name) < 2:
            raise HTTPException(
                status_code=422,
                detail="Full name must contain at least 2 characters"
            )

        current_user.full_name = full_name

    if "phone_number" in updates:
        phone_number = profile_data.phone_number

        if phone_number is not None:
            phone_number = phone_number.strip()

            if not phone_number:
                raise HTTPException(
                    status_code=422,
                    detail="Phone number cannot be empty"
                )

            if not phone_number.lstrip("+").isdigit():
                raise HTTPException(
                    status_code=422,
                    detail="Phone number must contain only digits or a leading +"
                )

            if len(phone_number.lstrip("+")) < 7:
                raise HTTPException(
                    status_code=422,
                    detail="Phone number is too short"
                )

        current_user.phone_number = phone_number

    try:
        db.commit()

    except IntegrityError:
        db.rollback()

        raise HTTPException(
            status_code=409,
            detail="Phone number is already registered"
        )

    db.refresh(current_user)

    return current_user