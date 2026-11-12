"""Make polling-unit agent assignments apply to every election.

Revision ID: 88f2c441a130
Revises: 71c93b27a6e4
"""

from alembic import op
import sqlalchemy as sa

revision = "88f2c441a130"
down_revision = "71c93b27a6e4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # If the same polling unit has assignments for several elections, retain
    # the newest assignment as its permanent agent before enforcing uniqueness.
    op.execute(sa.text("""
        DELETE FROM agent_assignments older
        USING agent_assignments newer
        WHERE older.polling_unit_id = newer.polling_unit_id
          AND older.id < newer.id
    """))
    op.drop_constraint("uq_assignment_election_polling_unit", "agent_assignments", type_="unique")
    op.alter_column("agent_assignments", "election_id", existing_type=sa.Integer(), nullable=True)
    op.create_unique_constraint("uq_assignment_polling_unit", "agent_assignments", ["polling_unit_id"])
    op.alter_column("agent_imports", "election_id", existing_type=sa.Integer(), nullable=True)


def downgrade() -> None:
    op.drop_constraint("uq_assignment_polling_unit", "agent_assignments", type_="unique")
    # Global assignments cannot be losslessly converted back to a specific
    # election, so the compatibility columns remain nullable on downgrade.
    op.create_unique_constraint(
        "uq_assignment_election_polling_unit",
        "agent_assignments",
        ["election_id", "polling_unit_id"],
    )
