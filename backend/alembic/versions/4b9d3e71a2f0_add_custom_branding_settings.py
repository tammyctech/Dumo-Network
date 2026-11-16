"""Add custom branding settings.

Revision ID: 4b9d3e71a2f0
Revises: c731df6ad025
"""
from alembic import op
import sqlalchemy as sa

revision = "4b9d3e71a2f0"
down_revision = "c731df6ad025"
branch_labels = None
depends_on = None


def upgrade() -> None:
    columns = (
        sa.Column("logo_title", sa.String(200), nullable=False, server_default="Dumo Youth Network"),
        sa.Column("logo_subtitle", sa.String(200), nullable=False, server_default="Election Monitoring System"),
        sa.Column("login_heading", sa.String(200), nullable=False, server_default="Welcome back."),
        sa.Column("login_description", sa.String(500), nullable=False, server_default="Enter your registered email or phone number to continue to your monitoring dashboard."),
        sa.Column("primary_color", sa.String(7), nullable=False, server_default="#047857"),
        sa.Column("background_color", sa.String(7), nullable=False, server_default="#f6f8f7"),
        sa.Column("text_color", sa.String(7), nullable=False, server_default="#0f172a"),
        sa.Column("font_family", sa.String(50), nullable=False, server_default="Inter"),
        sa.Column("font_size", sa.Integer(), nullable=False, server_default="16"),
        sa.Column("font_style", sa.String(20), nullable=False, server_default="normal"),
        sa.Column("background_image_data_url", sa.Text(), nullable=True),
        sa.Column("favicon_data_url", sa.Text(), nullable=True),
    )
    for column in columns:
        op.add_column("organization_settings", column)


def downgrade() -> None:
    for name in (
        "favicon_data_url", "background_image_data_url", "font_style", "font_size",
        "font_family", "text_color", "background_color", "primary_color",
        "login_description", "login_heading", "logo_subtitle", "logo_title",
    ):
        op.drop_column("organization_settings", name)
