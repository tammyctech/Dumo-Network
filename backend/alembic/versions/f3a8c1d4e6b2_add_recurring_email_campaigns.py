"""Add recurring email campaigns and unsubscribe records.

Revision ID: f3a8c1d4e6b2
Revises: 91e7c2a3b4d5
"""
from alembic import op
import sqlalchemy as sa

revision = "f3a8c1d4e6b2"
down_revision = "91e7c2a3b4d5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "email_campaigns",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("template_key", sa.String(50), nullable=False),
        sa.Column("subject", sa.String(150), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("audience", sa.String(20), nullable=False, server_default="agents"),
        sa.Column("frequency", sa.String(20), nullable=False, server_default="once"),
        sa.Column("status", sa.String(20), nullable=False, server_default="active"),
        sa.Column("next_send_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_sent_at", sa.DateTime(timezone=True)),
        sa.Column("total_sent", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_failed", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_skipped", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_email_campaigns_created_by", "email_campaigns", ["created_by"])
    op.create_index("ix_email_campaigns_status", "email_campaigns", ["status"])
    op.create_index("ix_email_campaigns_next_send_at", "email_campaigns", ["next_send_at"])
    op.create_table(
        "email_unsubscribes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("unsubscribed_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_email_unsubscribes_user_id", "email_unsubscribes", ["user_id"], unique=True)


def downgrade() -> None:
    op.drop_table("email_unsubscribes")
    op.drop_table("email_campaigns")
