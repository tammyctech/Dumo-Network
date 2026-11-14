"""Add one-time agent welcome email tracking.

Revision ID: c731df6ad025
Revises: a621ce9e8b14
"""
from alembic import op
import sqlalchemy as sa

revision = "c731df6ad025"
down_revision = "a621ce9e8b14"
branch_labels = None
depends_on = None

def upgrade() -> None:
    op.create_table(
        "agent_welcome_deliveries",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("agent_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("recipient", sa.String(255), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="queued"),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_error", sa.String(500)),
        sa.Column("sent_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_agent_welcome_deliveries_agent_id", "agent_welcome_deliveries", ["agent_id"])
    op.create_index("ix_agent_welcome_deliveries_status", "agent_welcome_deliveries", ["status"])

def downgrade() -> None:
    op.drop_table("agent_welcome_deliveries")
