import os

from datetime import datetime, timedelta, timezone

import jwt

from dotenv import load_dotenv
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jwt.exceptions import InvalidTokenError
from pwdlib import PasswordHash
from sqlalchemy.orm import Session

from .database import get_db
from .models import User


# ============================================================
# ENVIRONMENT CONFIGURATION
# ============================================================

load_dotenv()

SECRET_KEY = os.getenv("JWT_SECRET_KEY")

if not SECRET_KEY:
    raise RuntimeError("JWT_SECRET_KEY is missing")

ALGORITHM = "HS256"

ACCESS_TOKEN_EXPIRE_MINUTES = 30


# ============================================================
# PASSWORD SECURITY
# ============================================================

password_hash = PasswordHash.recommended()


def hash_password(password: str) -> str:
    return password_hash.hash(password)


def verify_password(
    plain_password: str,
    hashed_password: str,
) -> bool:
    return password_hash.verify(
        plain_password,
        hashed_password,
    )


# ============================================================
# JWT AUTHENTICATION
# ============================================================

oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl="/api/auth/login"
)


def create_access_token(user_id: int) -> str:

    expire = datetime.now(timezone.utc) + timedelta(
        minutes=ACCESS_TOKEN_EXPIRE_MINUTES
    )

    payload = {
        "sub": str(user_id),
        "exp": expire,
        "type": "access",
    }

    return jwt.encode(
        payload,
        SECRET_KEY,
        algorithm=ALGORITHM,
    )


# ============================================================
# GET CURRENT AUTHENTICATED USER
# ============================================================

def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:

    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired authentication token",
        headers={
            "WWW-Authenticate": "Bearer",
        },
    )

    try:
        payload = jwt.decode(
            token,
            SECRET_KEY,
            algorithms=[ALGORITHM],
        )

        if payload.get("type") != "access":
            raise credentials_error

        user_id = int(payload["sub"])

    except (
        InvalidTokenError,
        KeyError,
        TypeError,
        ValueError,
    ):
        raise credentials_error

    user = db.get(User, user_id)

    if user is None or not user.is_active:
        raise credentials_error

    return user


# ============================================================
# ROLE-BASED ACCESS CONTROL
# ============================================================

def require_role(*allowed_roles: str):

    def role_checker(
        current_user: User = Depends(get_current_user),
    ) -> User:

        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission",
            )

        return current_user

    return role_checker


# ============================================================
# ADMINISTRATOR-ONLY ACCESS
# ============================================================

def require_admin(
    current_user: User = Depends(get_current_user),
) -> User:

    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrator access required",
        )

    return current_user