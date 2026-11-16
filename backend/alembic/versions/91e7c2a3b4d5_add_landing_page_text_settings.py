"""Add landing page text settings.

Revision ID: 91e7c2a3b4d5
Revises: 4b9d3e71a2f0
"""
from alembic import op
import sqlalchemy as sa

revision = "91e7c2a3b4d5"
down_revision = "4b9d3e71a2f0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "organization_settings",
        sa.Column("landing_text", sa.JSON(), nullable=False, server_default="{}"),
    )


def downgrade() -> None:
    op.drop_column("organization_settings", "landing_text")
