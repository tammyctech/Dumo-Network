"""Add idempotent agent email delivery tracking.

Revision ID: a621ce9e8b14
Revises: e4b25b617a31
"""

from alembic import op
import sqlalchemy as sa

revision = "a621ce9e8b14"
down_revision = "e4b25b617a31"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "agent_email_deliveries",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("import_id", sa.Integer(), sa.ForeignKey("agent_imports.id", ondelete="CASCADE"), nullable=False),
        sa.Column("agent_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("email_type", sa.String(40), nullable=False, server_default="bulk_assignment"),
        sa.Column("recipient", sa.String(255), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="queued"),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_error", sa.String(500)),
        sa.Column("sent_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("import_id", "agent_id", "email_type", name="uq_agent_import_email"),
    )
    op.create_index("ix_agent_email_deliveries_import_id", "agent_email_deliveries", ["import_id"])
    op.create_index("ix_agent_email_deliveries_agent_id", "agent_email_deliveries", ["agent_id"])
    op.create_index("ix_agent_email_deliveries_status", "agent_email_deliveries", ["status"])


def downgrade() -> None:
    op.drop_table("agent_email_deliveries")
