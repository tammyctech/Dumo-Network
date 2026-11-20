"""add public incident reporters and private video evidence

Revision ID: 4b8e1d6f2a30
Revises: 3a7d9c2e5f10
"""

from alembic import op
import sqlalchemy as sa

revision = "4b8e1d6f2a30"
down_revision = "3a7d9c2e5f10"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("incidents", "reported_by", existing_type=sa.Integer(), nullable=True)
    op.add_column("incidents", sa.Column("reporter_name", sa.String(150)))
    op.add_column("incidents", sa.Column("reporter_phone", sa.String(30)))
    op.create_table(
        "incident_videos",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("incident_id", sa.Integer(), sa.ForeignKey("incidents.id", ondelete="CASCADE"), nullable=False),
        sa.Column("file_path", sa.String(500), nullable=False),
        sa.Column("original_filename", sa.String(255)),
        sa.Column("content_type", sa.String(80), nullable=False),
        sa.Column("file_size", sa.Integer(), nullable=False),
        sa.Column("uploaded_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_incident_videos_incident_id", "incident_videos", ["incident_id"])


def downgrade() -> None:
    op.drop_index("ix_incident_videos_incident_id", table_name="incident_videos")
    op.drop_table("incident_videos")
    op.drop_column("incidents", "reporter_phone")
    op.drop_column("incidents", "reporter_name")
    op.alter_column("incidents", "reported_by", existing_type=sa.Integer(), nullable=False)
