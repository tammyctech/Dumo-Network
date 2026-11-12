"""Remove obsolete election scope from agent application links.

Revision ID: b59c1188c504
Revises: 88f2c441a130
"""

from alembic import op
import sqlalchemy as sa

revision = "b59c1188c504"
down_revision = "88f2c441a130"
branch_labels = None
depends_on = None


def upgrade() -> None:
    columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("agent_application_links")}
    if "election_id" in columns:
        op.drop_column("agent_application_links", "election_id")


def downgrade() -> None:
    columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("agent_application_links")}
    if "election_id" not in columns:
        op.add_column(
            "agent_application_links",
            sa.Column("election_id", sa.Integer(), sa.ForeignKey("elections.id"), nullable=True),
        )
