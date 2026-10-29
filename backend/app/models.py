from datetime import datetime, timezone

from sqlalchemy import (
    String,
    Integer,
    Boolean,
    DateTime,
    JSON,
    ForeignKey,
    UniqueConstraint,
    CheckConstraint,
)

from sqlalchemy.orm import Mapped, mapped_column

from .database import Base


# ============================================================
# POLLING UNIT MODEL
# ============================================================

class PollingUnit(Base):
    __tablename__ = "polling_units"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        index=True,
    )

    code: Mapped[str] = mapped_column(
        String(50),
        unique=True,
        nullable=False,
    )

    name: Mapped[str] = mapped_column(
        String(200),
        nullable=False,
    )

    state: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )

    lga: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )

    ward: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )


# ============================================================
# USER MODEL
# ============================================================

class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        index=True,
    )

    full_name: Mapped[str] = mapped_column(
        String(150),
        nullable=False,
    )

    email: Mapped[str] = mapped_column(
        String(255),
        unique=True,
        index=True,
        nullable=False,
    )

    # NEW: Phone number
    # Required for new polling-unit agents through the admin API.
    # Nullable to preserve existing users during migration.

    phone_number: Mapped[str | None] = mapped_column(
        String(20),
        unique=True,
        nullable=True,
    )

    hashed_password: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    # Supported roles:
    # admin
    # agent
    # observer

    role: Mapped[str] = mapped_column(
        String(50),
        default="observer",
        nullable=False,
    )

    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
    )


# ============================================================
# AUDIT LOG MODEL
# ============================================================

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        index=True,
    )

    user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id"),
        nullable=False,
    )

    action: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
    )

    table_name: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )

    record_id: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )

    old_data: Mapped[dict | None] = mapped_column(
        JSON,
        nullable=True,
    )

    new_data: Mapped[dict | None] = mapped_column(
        JSON,
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


# ============================================================
# ELECTION MODEL
# ============================================================

class Election(Base):
    __tablename__ = "elections"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
    )

    name: Mapped[str] = mapped_column(
        String(200),
        nullable=False,
    )

    election_date: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )

    state: Mapped[str] = mapped_column(
        String(100),
        default="Rivers",
        nullable=False,
    )


# ============================================================
# AGENT ASSIGNMENT MODEL
# ============================================================

class AgentAssignment(Base):
    __tablename__ = "agent_assignments"

    __table_args__ = (
        UniqueConstraint(
            "election_id",
            "polling_unit_id",
            "agent_id",
            name="uq_agent_election_polling_unit",
        ),
    )

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
    )

    election_id: Mapped[int] = mapped_column(
        ForeignKey("elections.id"),
        nullable=False,
    )

    polling_unit_id: Mapped[int] = mapped_column(
        ForeignKey("polling_units.id"),
        nullable=False,
    )

    agent_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"),
        nullable=False,
    )


# ============================================================
# RESULT SUBMISSION MODEL
# ============================================================

class ResultSubmission(Base):
    __tablename__ = "result_submissions"

    __table_args__ = (
        CheckConstraint(
            "accredited_voters >= 0",
            name="ck_accredited_nonnegative",
        ),
        CheckConstraint(
            "valid_votes >= 0",
            name="ck_valid_nonnegative",
        ),
        CheckConstraint(
            "rejected_votes >= 0",
            name="ck_rejected_nonnegative",
        ),
    )

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
    )

    election_id: Mapped[int] = mapped_column(
        ForeignKey("elections.id"),
        nullable=False,
    )

    polling_unit_id: Mapped[int] = mapped_column(
        ForeignKey("polling_units.id"),
        nullable=False,
    )

    agent_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"),
        nullable=False,
    )

    accredited_voters: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )

    valid_votes: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )

    rejected_votes: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )

    version: Mapped[int] = mapped_column(
        Integer,
        default=1,
        nullable=False,
    )

    # Used for data-quality flags, not approval or verification.

    is_flagged: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )

    submitted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


# ============================================================
# PARTY RESULT MODEL
# ============================================================

class PartyResult(Base):
    __tablename__ = "party_results"

    __table_args__ = (
        UniqueConstraint(
            "submission_id",
            "party",
            name="uq_submission_party",
        ),
        CheckConstraint(
            "votes >= 0",
            name="ck_party_votes_nonnegative",
        ),
    )

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
    )

    submission_id: Mapped[int] = mapped_column(
        ForeignKey("result_submissions.id"),
        nullable=False,
    )

    party: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )

    votes: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )


# ============================================================
# RESULT EVIDENCE MODEL
# ============================================================

class ResultEvidence(Base):
    __tablename__ = "result_evidence"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
    )

    submission_id: Mapped[int] = mapped_column(
        ForeignKey("result_submissions.id"),
        nullable=False,
    )

    file_path: Mapped[str] = mapped_column(
        String(500),
        nullable=False,
    )

    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
class AgentInvitation(Base):
    __tablename__ = "agent_invitations"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        index=True,
    )

    agent_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )

    token_hash: Mapped[str] = mapped_column(
        String(64),
        unique=True,
        nullable=False,
    )

    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )

    used_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
class Ward(Base):
    __tablename__ = "wards"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        index=True,
    )

    state: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        default="Rivers",
    )

    lga: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )

    name: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )

    ward_number: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )

    __table_args__ = (
        UniqueConstraint(
            "state",
            "lga",
            "ward_number",
            name="uq_ward_state_lga_number",
        ),
    )
# ============================================================
# PUSH NOTIFICATION SUBSCRIPTIONS
# ============================================================

class PushSubscription(Base):
    __tablename__ = "push_subscriptions"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        index=True,
    )

    user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    endpoint: Mapped[str] = mapped_column(
        String(2048),
        unique=True,
        nullable=False,
    )

    p256dh: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    auth: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )