from datetime import datetime

from pydantic import (
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    field_validator,
)

from .utils.phone import normalize_nigerian_phone


# ============================================================
# 1. PUBLIC USER REGISTRATION
# ============================================================

class UserCreate(BaseModel):
    """
    Public registration schema.

    Public registration is restricted to observers.
    The registration endpoint must explicitly assign
    role="observer".
    """

    full_name: str = Field(
        min_length=2,
        max_length=150,
    )

    email: EmailStr

    password: str = Field(
        min_length=12,
        max_length=128,
    )

    model_config = ConfigDict(
        extra="forbid"
    )


# ============================================================
# 2. USER LOGIN
# ============================================================

class UserLogin(BaseModel):
    """
    Schema for user authentication.
    """

    email: EmailStr

    password: str


# ============================================================
# 3. USER RESPONSE
# ============================================================

class UserResponse(BaseModel):
    """
    Response schema for authenticated users.

    Password hashes are never included.
    """

    id: int

    full_name: str

    email: EmailStr

    phone_number: str | None = None

    role: str

    is_active: bool

    model_config = ConfigDict(
        from_attributes=True
    )


# ============================================================
# 4. AUTHENTICATION TOKEN RESPONSE
# ============================================================

class TokenResponse(BaseModel):
    """
    JWT authentication response.
    """

    access_token: str

    token_type: str = "bearer"


# ============================================================
# 5. ADMINISTRATOR-CREATED AGENT
# ============================================================

class AgentCreate(BaseModel):
    """
    Schema for administrator-created polling-unit agents.

    Only administrators may access the endpoint
    that uses this schema.

    Agents cannot select their own roles.
    """

    full_name: str = Field(
        min_length=2,
        max_length=150,
    )

    email: EmailStr

    phone_number: str = Field(
        min_length=10,
        max_length=25,
    )

    model_config = ConfigDict(
        extra="forbid"
    )

    @field_validator("phone_number")
    @classmethod
    def validate_phone_number(
        cls,
        value: str,
    ) -> str:
        """
        Validate and normalize Nigerian mobile numbers.

        Example:
            08012345678 -> +2348012345678
        """

        try:
            return normalize_nigerian_phone(value)

        except ValueError as exc:
            raise ValueError(str(exc)) from exc


# ============================================================
# 6. AGENT RESPONSE
# ============================================================

class AgentResponse(BaseModel):
    """
    Response schema for agent information.

    Agent phone numbers must only be exposed
    through appropriately authorized endpoints.
    """

    id: int

    full_name: str

    email: EmailStr

    phone_number: str

    role: str

    is_active: bool

    model_config = ConfigDict(
        from_attributes=True
    )


# ============================================================
# 7. AGENT CREATION RESPONSE
# ============================================================

class AgentCreatedResponse(AgentResponse):
    """
    Response returned when an administrator creates
    a polling-unit agent.

    The activation URL contains a sensitive token.
    It should only be returned once.
    """

    activation_url: str

    invitation_expires_at: datetime


# ============================================================
# 8. AGENT ACCOUNT ACTIVATION
# ============================================================

class AgentActivationRequest(BaseModel):
    """
    Schema used when an agent activates an account.

    The agent provides:
        1. Invitation token
        2. New password
    """

    token: str = Field(
        min_length=20,
        max_length=256,
    )

    password: str = Field(
        min_length=12,
        max_length=128,
    )

    model_config = ConfigDict(
        extra="forbid"
    )


# ============================================================
# 9. POLLING UNIT CREATION
# ============================================================

class PollingUnitCreate(BaseModel):
    """
    Schema for creating polling units.
    """

    code: str = Field(
        min_length=1,
        max_length=50,
    )

    name: str = Field(
        min_length=1,
        max_length=200,
    )

    state: str = Field(
        min_length=1,
        max_length=100,
    )

    lga: str = Field(
        min_length=1,
        max_length=100,
    )

    ward: str = Field(
        min_length=1,
        max_length=100,
    )


# ============================================================
# 10. POLLING UNIT RESPONSE
# ============================================================

class PollingUnitResponse(PollingUnitCreate):
    """
    Schema for returning polling-unit information.
    """

    id: int

    model_config = ConfigDict(
        from_attributes=True
    )


# ============================================================
# 11. POLLING UNIT UPDATE
# ============================================================

class PollingUnitUpdate(BaseModel):
    """
    Schema for updating polling-unit information.

    All fields are optional so administrators
    can update individual fields.
    """

    code: str | None = Field(
        default=None,
        min_length=1,
        max_length=50,
    )

    name: str | None = Field(
        default=None,
        min_length=1,
        max_length=200,
    )

    state: str | None = Field(
        default=None,
        min_length=1,
        max_length=100,
    )

    lga: str | None = Field(
        default=None,
        min_length=1,
        max_length=100,
    )

    ward: str | None = Field(
        default=None,
        min_length=1,
        max_length=100,
    )