"""add notification campaigns

Revision ID: d91f3e5a7c20
Revises: c8a30b7d91f2
"""

from alembic import op
import sqlalchemy as sa

revision = "d91f3e5a7c20"
down_revision = "c8a30b7d91f2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "notification_campaigns",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("title", sa.String(120), nullable=False),
        sa.Column("body", sa.String(500), nullable=False),
        sa.Column("url", sa.String(500), nullable=False),
        sa.Column("audience_type", sa.String(30), nullable=False),
        sa.Column("audience_data", sa.JSON()),
        sa.Column("target_users", sa.Integer(), server_default="0", nullable=False),
        sa.Column("devices_found", sa.Integer(), server_default="0", nullable=False),
        sa.Column("sent", sa.Integer(), server_default="0", nullable=False),
        sa.Column("failed", sa.Integer(), server_default="0", nullable=False),
        sa.Column("expired_removed", sa.Integer(), server_default="0", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_notification_campaigns_id", "notification_campaigns", ["id"])
    op.create_index("ix_notification_campaigns_created_by", "notification_campaigns", ["created_by"])


def downgrade() -> None:
    op.drop_index("ix_notification_campaigns_created_by", table_name="notification_campaigns")
    op.drop_index("ix_notification_campaigns_id", table_name="notification_campaigns")
    op.drop_table("notification_campaigns")
