from datetime import datetime, timezone

from sqlalchemy import (
    String,
    Integer,
    Boolean,
    DateTime,
    Text,
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
    # Supported roles are administrator and agent only.

    role: Mapped[str] = mapped_column(
        String(50),
        default="agent",
        nullable=False,
    )

    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
    )

    must_change_password: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )

    session_version: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False
    )

    mfa_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    mfa_secret_encrypted: Mapped[str | None] = mapped_column(String(255), nullable=True)
    mfa_recovery_codes: Mapped[list | None] = mapped_column(JSON, nullable=True)


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


class SiteVisit(Base):
    __tablename__ = "site_visits"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    visitor_hash: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    path: Mapped[str] = mapped_column(String(300), nullable=False, index=True)
    referrer_domain: Mapped[str | None] = mapped_column(String(255), nullable=True)
    country: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    region: Mapped[str | None] = mapped_column(String(100), nullable=True)
    city: Mapped[str | None] = mapped_column(String(100), nullable=True)
    timezone: Mapped[str | None] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        index=True,
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

    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )


# ============================================================
# AGENT ASSIGNMENT MODEL
# ============================================================

class AgentAssignment(Base):
    __tablename__ = "agent_assignments"

    __table_args__ = (
        UniqueConstraint(
            "agent_id",
            name="uq_assignment_agent",
        ),
    )

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
    )

    election_id: Mapped[int | None] = mapped_column(
        ForeignKey("elections.id"),
        nullable=True,
    )

    polling_unit_id: Mapped[int] = mapped_column(
        ForeignKey("polling_units.id"),
        nullable=False,
    )

    agent_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"),
        nullable=False,
    )


class AgentApplicationLink(Base):
    __tablename__ = "agent_application_links"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    token: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )


class AgentApplication(Base):
    __tablename__ = "agent_applications"
    __table_args__ = (
        UniqueConstraint("link_id", "phone_number", name="uq_agent_application_link_phone"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    link_id: Mapped[int] = mapped_column(
        ForeignKey("agent_application_links.id", ondelete="CASCADE"), nullable=False, index=True
    )
    polling_unit_id: Mapped[int] = mapped_column(ForeignKey("polling_units.id"), nullable=False)
    full_name: Mapped[str] = mapped_column(String(150), nullable=False)
    phone_number: Mapped[str] = mapped_column(String(20), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False, index=True)
    admin_notes: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    reviewed_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    agent_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )


class AgentImport(Base):
    __tablename__ = "agent_imports"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    administrator_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    election_id: Mapped[int | None] = mapped_column(ForeignKey("elections.id"), nullable=True)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    total_records: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    registered_agents: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    assigned_agents: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    skipped_records: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    failed_records: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )


class AgentImportRow(Base):
    __tablename__ = "agent_import_rows"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    import_id: Mapped[int] = mapped_column(
        ForeignKey("agent_imports.id", ondelete="CASCADE"), nullable=False, index=True
    )
    row_number: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False)
    phone_number: Mapped[str | None] = mapped_column(String(20), nullable=True)
    agent_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    polling_unit_id: Mapped[int | None] = mapped_column(ForeignKey("polling_units.id"), nullable=True)
    message: Mapped[str | None] = mapped_column(String(500), nullable=True)


class AgentEmailDelivery(Base):
    __tablename__ = "agent_email_deliveries"
    __table_args__ = (UniqueConstraint("import_id", "agent_id", "email_type", name="uq_agent_import_email"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    import_id: Mapped[int] = mapped_column(ForeignKey("agent_imports.id", ondelete="CASCADE"), nullable=False, index=True)
    agent_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    email_type: Mapped[str] = mapped_column(String(40), default="bulk_assignment", nullable=False)
    recipient: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="queued", nullable=False, index=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_error: Mapped[str | None] = mapped_column(String(500), nullable=True)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)


class AgentWelcomeDelivery(Base):
    __tablename__ = "agent_welcome_deliveries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    agent_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False, index=True)
    recipient: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="queued", nullable=False, index=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_error: Mapped[str | None] = mapped_column(String(500), nullable=True)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)


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

    verification_status: Mapped[str] = mapped_column(
        String(30), default="submitted", nullable=False
    )


class ResultReview(Base):
    __tablename__ = "result_reviews"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    submission_id: Mapped[int] = mapped_column(
        ForeignKey("result_submissions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    reviewer_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"), nullable=False
    )
    status: Mapped[str] = mapped_column(String(30), nullable=False)
    notes: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


class ResultFlag(Base):
    __tablename__ = "result_flags"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    submission_id: Mapped[int] = mapped_column(
        ForeignKey("result_submissions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    flag_type: Mapped[str] = mapped_column(String(80), nullable=False)
    severity: Mapped[str] = mapped_column(String(20), nullable=False)
    message: Mapped[str] = mapped_column(String(500), nullable=False)
    resolved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    resolved_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


class Incident(Base):
    __tablename__ = "incidents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    election_id: Mapped[int] = mapped_column(
        ForeignKey("elections.id"), nullable=False, index=True
    )
    polling_unit_id: Mapped[int | None] = mapped_column(
        ForeignKey("polling_units.id"), nullable=True
    )
    reported_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id"), nullable=True
    )
    reporter_name: Mapped[str | None] = mapped_column(String(150), nullable=True)
    reporter_phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    category: Mapped[str] = mapped_column(String(80), nullable=False)
    severity: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[str] = mapped_column(
        String(30), default="open", nullable=False
    )
    description: Mapped[str] = mapped_column(String(3000), nullable=False)
    resolution_notes: Mapped[str | None] = mapped_column(
        String(3000), nullable=True
    )
    assigned_to: Mapped[int | None] = mapped_column(
        ForeignKey("users.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


class IncidentVideo(Base):
    __tablename__ = "incident_videos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    incident_id: Mapped[int] = mapped_column(
        ForeignKey("incidents.id", ondelete="CASCADE"), nullable=False, index=True
    )
    file_path: Mapped[str] = mapped_column(String(500), nullable=False)
    original_filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    content_type: Mapped[str] = mapped_column(String(80), nullable=False)
    file_size: Mapped[int] = mapped_column(Integer, nullable=False)
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
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


class NotificationCampaign(Base):
    __tablename__ = "notification_campaigns"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    created_by: Mapped[int] = mapped_column(
        ForeignKey("users.id"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    body: Mapped[str] = mapped_column(String(500), nullable=False)
    url: Mapped[str] = mapped_column(String(500), nullable=False)
    audience_type: Mapped[str] = mapped_column(String(30), nullable=False)
    audience_data: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    target_users: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    devices_found: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    sent: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    failed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    expired_removed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


class EmailCampaign(Base):
    __tablename__ = "email_campaigns"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    template_key: Mapped[str] = mapped_column(String(50), nullable=False)
    subject: Mapped[str] = mapped_column(String(150), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    audience: Mapped[str] = mapped_column(String(20), nullable=False, default="agents")
    frequency: Mapped[str] = mapped_column(String(20), nullable=False, default="once")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active", index=True)
    next_send_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    last_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    total_sent: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_failed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_skipped: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)


class EmailUnsubscribe(Base):
    __tablename__ = "email_unsubscribes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    unsubscribed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)


class OrganizationSettings(Base):
    __tablename__ = "organization_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    organization_name: Mapped[str] = mapped_column(String(200), nullable=False)
    official_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    official_phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    office_address: Mapped[str | None] = mapped_column(String(500), nullable=True)
    website: Mapped[str | None] = mapped_column(String(500), nullable=True)
    logo_data_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    logo_title: Mapped[str] = mapped_column(String(200), nullable=False, default="Dumo Youth Network")
    logo_subtitle: Mapped[str] = mapped_column(String(200), nullable=False, default="Election Monitoring System")
    login_heading: Mapped[str] = mapped_column(String(200), nullable=False, default="Welcome back.")
    login_description: Mapped[str] = mapped_column(String(500), nullable=False, default="Enter your registered email or phone number to continue to your monitoring dashboard.")
    primary_color: Mapped[str] = mapped_column(String(7), nullable=False, default="#047857")
    background_color: Mapped[str] = mapped_column(String(7), nullable=False, default="#f6f8f7")
    text_color: Mapped[str] = mapped_column(String(7), nullable=False, default="#0f172a")
    font_family: Mapped[str] = mapped_column(String(50), nullable=False, default="Inter")
    font_size: Mapped[int] = mapped_column(Integer, nullable=False, default=16)
    font_style: Mapped[str] = mapped_column(String(20), nullable=False, default="normal")
    background_image_data_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    favicon_data_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    landing_text: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    notification_emails: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    email_sender_name: Mapped[str] = mapped_column(String(100), nullable=False)
    sms_sender_name: Mapped[str | None] = mapped_column(String(11), nullable=True)
    updated_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc), nullable=False,
    )


class SmsDelivery(Base):
    """One provider submission and its latest delivery-report state."""

    __tablename__ = "sms_deliveries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    termii_message_id: Mapped[str | None] = mapped_column(String(100), nullable=True, unique=True, index=True)
    recipient: Mapped[str] = mapped_column(String(20), nullable=False)
    sender_id: Mapped[str] = mapped_column(String(11), nullable=False)
    channel: Mapped[str] = mapped_column(String(20), nullable=False)
    message_type: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="SENT", index=True)
    provider_status: Mapped[str | None] = mapped_column(String(100), nullable=True)
    error: Mapped[str | None] = mapped_column(String(500), nullable=True)
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
