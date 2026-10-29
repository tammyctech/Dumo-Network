"""add verification, anomaly, and incident workflow

Revision ID: c8a30b7d91f2
Revises: aff94f20c6b7
"""

from alembic import op
import sqlalchemy as sa

revision = "c8a30b7d91f2"
down_revision = "aff94f20c6b7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("result_submissions", sa.Column("verification_status", sa.String(30), server_default="submitted", nullable=False))
    op.create_table("result_reviews",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("submission_id", sa.Integer(), sa.ForeignKey("result_submissions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("reviewer_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("status", sa.String(30), nullable=False),
        sa.Column("notes", sa.String(2000)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_result_reviews_submission_id", "result_reviews", ["submission_id"])
    op.create_table("result_flags",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("submission_id", sa.Integer(), sa.ForeignKey("result_submissions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("flag_type", sa.String(80), nullable=False),
        sa.Column("severity", sa.String(20), nullable=False),
        sa.Column("message", sa.String(500), nullable=False),
        sa.Column("resolved_at", sa.DateTime(timezone=True)),
        sa.Column("resolved_by", sa.Integer(), sa.ForeignKey("users.id")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_result_flags_submission_id", "result_flags", ["submission_id"])
    op.create_table("incidents",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("election_id", sa.Integer(), sa.ForeignKey("elections.id"), nullable=False),
        sa.Column("polling_unit_id", sa.Integer(), sa.ForeignKey("polling_units.id")),
        sa.Column("reported_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("category", sa.String(80), nullable=False),
        sa.Column("severity", sa.String(20), nullable=False),
        sa.Column("status", sa.String(30), server_default="open", nullable=False),
        sa.Column("description", sa.String(3000), nullable=False),
        sa.Column("resolution_notes", sa.String(3000)),
        sa.Column("assigned_to", sa.Integer(), sa.ForeignKey("users.id")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_incidents_election_id", "incidents", ["election_id"])


def downgrade() -> None:
    op.drop_index("ix_incidents_election_id", table_name="incidents")
    op.drop_table("incidents")
    op.drop_index("ix_result_flags_submission_id", table_name="result_flags")
    op.drop_table("result_flags")
    op.drop_index("ix_result_reviews_submission_id", table_name="result_reviews")
    op.drop_table("result_reviews")
    op.drop_column("result_submissions", "verification_status")
