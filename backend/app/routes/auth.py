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
    ChangePasswordRequest,
)

from ..security import (
    hash_password,
    verify_password,
    create_access_token,
    get_current_user,
)


# ==========================================
# AUTHENTICATION ROUTER
# ==========================================

router = APIRouter(
    prefix="/api/auth",
    tags=["Authentication"],
)


# ==========================================
# REGISTER USER
# ==========================================

@router.post(
    "/register",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
)
def register(
    user_data: UserCreate,
    db: Session = Depends(get_db),
):
    """
    Register a new observer account.
    """

    email = str(user_data.email).strip().lower()

    existing_user = db.scalar(
        select(User).where(User.email == email)
    )

    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        )

    new_user = User(
        full_name=user_data.full_name,
        email=email,
        hashed_password=hash_password(
            user_data.password
        ),
        role="observer",
        is_active=True,
    )

    db.add(new_user)

    try:
        db.commit()

    except IntegrityError:
        db.rollback()

        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        )

    db.refresh(new_user)

    return new_user


# ==========================================
# LOGIN USER
# ==========================================

@router.post(
    "/login",
    response_model=TokenResponse,
)
def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    """
    Authenticate a user and return an access token.
    """

    email = form_data.username.strip().lower()

    user = db.scalar(
        select(User).where(User.email == email)
    )

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    if not verify_password(
        form_data.password,
        user.hashed_password,
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is inactive",
        )

    token = create_access_token(user.id)

    return {
        "access_token": token,
        "token_type": "bearer",
    }


# ==========================================
# GET CURRENT USER PROFILE
# ==========================================

@router.get(
    "/me",
    response_model=UserResponse,
)
def get_profile(
    current_user: User = Depends(get_current_user),
):
    """
    Return the authenticated user's profile.
    """

    return current_user


# ==========================================
# UPDATE CURRENT USER PROFILE
# ==========================================

@router.patch(
    "/me",
    response_model=UserResponse,
)
def update_profile(
    profile_data: UserProfileUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Update the authenticated user's profile.

    Only full_name and phone_number can be updated.
    """

    updates = profile_data.model_fields_set

    # --------------------------------------
    # UPDATE FULL NAME
    # --------------------------------------

    if "full_name" in updates:

        if profile_data.full_name is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Full name cannot be null",
            )

        full_name = profile_data.full_name.strip()

        if len(full_name) < 2:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    "Full name must contain at least "
                    "2 characters"
                ),
            )

        current_user.full_name = full_name

    # --------------------------------------
    # UPDATE PHONE NUMBER
    # --------------------------------------

    if "phone_number" in updates:

        phone_number = profile_data.phone_number

        if phone_number is not None:

            phone_number = phone_number.strip()

            if not phone_number:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Phone number cannot be empty",
                )

            if not phone_number.lstrip("+").isdigit():
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=(
                        "Phone number must contain only "
                        "digits or a leading +"
                    ),
                )

            if len(phone_number.lstrip("+")) < 7:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Phone number is too short",
                )

            if phone_number.count("+") > 1:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Phone number has an invalid format",
                )

        current_user.phone_number = phone_number

    # --------------------------------------
    # SAVE PROFILE CHANGES
    # --------------------------------------

    try:
        db.commit()

    except IntegrityError:
        db.rollback()

        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Phone number is already registered",
        )

    db.refresh(current_user)

    return current_user


# ==========================================
# CHANGE PASSWORD
# ==========================================

@router.post(
    "/change-password",
    status_code=status.HTTP_200_OK,
)
def change_password(
    password_data: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Allow an authenticated user to change
    their password securely.

    Requires:
    - Current password
    - New password
    - Confirm new password
    """

    # --------------------------------------
    # VERIFY CURRENT PASSWORD
    # --------------------------------------

    if not verify_password(
        password_data.current_password,
        current_user.hashed_password,
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect",
        )

    # --------------------------------------
    # CONFIRM NEW PASSWORD
    # --------------------------------------

    if (
        password_data.new_password
        != password_data.confirm_password
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="New passwords do not match",
        )

    # --------------------------------------
    # VALIDATE PASSWORD LENGTH
    # --------------------------------------

    if len(password_data.new_password) < 8:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "New password must contain at least "
                "8 characters"
            ),
        )

    # --------------------------------------
    # PREVENT PASSWORD REUSE
    # --------------------------------------

    if verify_password(
        password_data.new_password,
        current_user.hashed_password,
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "New password must be different "
                "from current password"
            ),
        )

    # --------------------------------------
    # HASH NEW PASSWORD
    # --------------------------------------

    new_password_hash = hash_password(
        password_data.new_password
    )

    current_user.hashed_password = new_password_hash

    # --------------------------------------
    # SAVE NEW PASSWORD
    # --------------------------------------

    try:
        db.commit()

    except Exception:
        db.rollback()

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to change password",
        )

    return {
        "message": "Password changed successfully",
    }