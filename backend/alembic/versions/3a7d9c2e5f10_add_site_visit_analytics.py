"""add privacy-safe site visit analytics

Revision ID: 3a7d9c2e5f10
Revises: 7d3a5b1c9f20
"""

from alembic import op
import sqlalchemy as sa

revision = "3a7d9c2e5f10"
down_revision = "7d3a5b1c9f20"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "site_visits",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("visitor_hash", sa.String(64), nullable=False),
        sa.Column("path", sa.String(300), nullable=False),
        sa.Column("referrer_domain", sa.String(255)),
        sa.Column("country", sa.String(100)),
        sa.Column("region", sa.String(100)),
        sa.Column("city", sa.String(100)),
        sa.Column("timezone", sa.String(100)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_site_visits_id", "site_visits", ["id"])
    op.create_index("ix_site_visits_visitor_hash", "site_visits", ["visitor_hash"])
    op.create_index("ix_site_visits_path", "site_visits", ["path"])
    op.create_index("ix_site_visits_country", "site_visits", ["country"])
    op.create_index("ix_site_visits_created_at", "site_visits", ["created_at"])


def downgrade() -> None:
    op.drop_table("site_visits")
