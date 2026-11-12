"""Add public agent application links and approval workflow.

Revision ID: 71c93b27a6e4
Revises: 2f76b30c9ab1
"""

from alembic import op
import sqlalchemy as sa

revision = "71c93b27a6e4"
down_revision = "2f76b30c9ab1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "agent_application_links",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("token", sa.String(64), nullable=False, unique=True),
        sa.Column("election_id", sa.Integer(), sa.ForeignKey("elections.id"), nullable=False),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_agent_application_links_token", "agent_application_links", ["token"], unique=True)
    op.create_table(
        "agent_applications",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("link_id", sa.Integer(), sa.ForeignKey("agent_application_links.id", ondelete="CASCADE"), nullable=False),
        sa.Column("polling_unit_id", sa.Integer(), sa.ForeignKey("polling_units.id"), nullable=False),
        sa.Column("full_name", sa.String(150), nullable=False),
        sa.Column("phone_number", sa.String(20), nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("admin_notes", sa.String(1000)),
        sa.Column("reviewed_by", sa.Integer(), sa.ForeignKey("users.id")),
        sa.Column("reviewed_at", sa.DateTime(timezone=True)),
        sa.Column("agent_id", sa.Integer(), sa.ForeignKey("users.id")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("link_id", "phone_number", name="uq_agent_application_link_phone"),
    )
    op.create_index("ix_agent_applications_link_id", "agent_applications", ["link_id"])
    op.create_index("ix_agent_applications_status", "agent_applications", ["status"])


def downgrade() -> None:
    op.drop_index("ix_agent_applications_status", table_name="agent_applications")
    op.drop_index("ix_agent_applications_link_id", table_name="agent_applications")
    op.drop_table("agent_applications")
    op.drop_index("ix_agent_application_links_token", table_name="agent_application_links")
    op.drop_table("agent_application_links")
