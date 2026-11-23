"""Add Termii SMS delivery tracking.

Revision ID: 5c1d8e2f4a70
Revises: 4b8e1d6f2a30
"""

from alembic import op
import sqlalchemy as sa


revision = "5c1d8e2f4a70"
down_revision = "4b8e1d6f2a30"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "sms_deliveries",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("termii_message_id", sa.String(100), nullable=True, unique=True),
        sa.Column("recipient", sa.String(20), nullable=False),
        sa.Column("sender_id", sa.String(11), nullable=False),
        sa.Column("channel", sa.String(20), nullable=False),
        sa.Column("message_type", sa.String(20), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="SENT"),
        sa.Column("provider_status", sa.String(100), nullable=True),
        sa.Column("error", sa.String(500), nullable=True),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("delivered_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_sms_deliveries_termii_message_id", "sms_deliveries", ["termii_message_id"])
    op.create_index("ix_sms_deliveries_status", "sms_deliveries", ["status"])


def downgrade() -> None:
    op.drop_table("sms_deliveries")
