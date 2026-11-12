"""Add secure bulk agent imports and first-login enforcement.

Revision ID: 2f76b30c9ab1
Revises: d91f3e5a7c20
"""

from alembic import op
import sqlalchemy as sa

revision = "2f76b30c9ab1"
down_revision = "d91f3e5a7c20"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("must_change_password", sa.Boolean(), server_default=sa.false(), nullable=False))
    op.add_column("users", sa.Column("session_version", sa.Integer(), server_default="0", nullable=False))

    op.drop_constraint("uq_agent_election_polling_unit", "agent_assignments", type_="unique")
    op.create_unique_constraint(
        "uq_assignment_election_polling_unit", "agent_assignments", ["election_id", "polling_unit_id"]
    )

    op.create_table(
        "agent_imports",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("administrator_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("election_id", sa.Integer(), sa.ForeignKey("elections.id"), nullable=False),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("total_records", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("registered_agents", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("assigned_agents", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("skipped_records", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("failed_records", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "agent_import_rows",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("import_id", sa.Integer(), sa.ForeignKey("agent_imports.id", ondelete="CASCADE"), nullable=False),
        sa.Column("row_number", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(30), nullable=False),
        sa.Column("phone_number", sa.String(20)),
        sa.Column("agent_id", sa.Integer(), sa.ForeignKey("users.id")),
        sa.Column("polling_unit_id", sa.Integer(), sa.ForeignKey("polling_units.id")),
        sa.Column("message", sa.String(500)),
    )
    op.create_index("ix_agent_import_rows_import_id", "agent_import_rows", ["import_id"])


def downgrade() -> None:
    op.drop_index("ix_agent_import_rows_import_id", table_name="agent_import_rows")
    op.drop_table("agent_import_rows")
    op.drop_table("agent_imports")
    op.drop_constraint("uq_assignment_election_polling_unit", "agent_assignments", type_="unique")
    op.create_unique_constraint(
        "uq_agent_election_polling_unit", "agent_assignments", ["election_id", "polling_unit_id", "agent_id"]
    )
    op.drop_column("users", "session_version")
    op.drop_column("users", "must_change_password")
