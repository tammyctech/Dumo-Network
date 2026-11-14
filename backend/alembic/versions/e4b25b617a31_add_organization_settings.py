"""Add organization settings.

Revision ID: e4b25b617a31
Revises: b59c1188c504
"""
from alembic import op
import sqlalchemy as sa

revision = "e4b25b617a31"
down_revision = "b59c1188c504"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "organization_settings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("organization_name", sa.String(200), nullable=False),
        sa.Column("official_email", sa.String(255), nullable=True),
        sa.Column("official_phone", sa.String(30), nullable=True),
        sa.Column("office_address", sa.String(500), nullable=True),
        sa.Column("website", sa.String(500), nullable=True),
        sa.Column("logo_data_url", sa.Text(), nullable=True),
        sa.Column("notification_emails", sa.JSON(), nullable=False),
        sa.Column("email_sender_name", sa.String(100), nullable=False),
        sa.Column("sms_sender_name", sa.String(11), nullable=True),
        sa.Column("updated_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("organization_settings")
