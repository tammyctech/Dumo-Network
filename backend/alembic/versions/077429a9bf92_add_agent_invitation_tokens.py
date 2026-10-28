"""Add agent invitation tokens.

Revision ID: 077429a9bf92
Revises: 77cc23936064
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "077429a9bf92"

down_revision: Union[str, Sequence[str], None] = "77cc23936064"

branch_labels: Union[str, Sequence[str], None] = None

depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:

    op.create_table(
        "agent_invitations",

        sa.Column(
            "id",
            sa.Integer(),
            primary_key=True,
            nullable=False,
        ),

        sa.Column(
            "agent_id",
            sa.Integer(),
            sa.ForeignKey("users.id"),
            nullable=False,
        ),

        sa.Column(
            "token_hash",
            sa.String(length=64),
            nullable=False,
            unique=True,
        ),

        sa.Column(
            "expires_at",
            sa.DateTime(timezone=True),
            nullable=False,
        ),

        sa.Column(
            "used_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),

        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
        ),
    )

    op.create_index(
        "ix_agent_invitations_id",
        "agent_invitations",
        ["id"],
    )

    op.create_index(
        "ix_agent_invitations_agent_id",
        "agent_invitations",
        ["agent_id"],
    )


def downgrade() -> None:

    op.drop_index(
        "ix_agent_invitations_agent_id",
        table_name="agent_invitations",
    )

    op.drop_index(
        "ix_agent_invitations_id",
        table_name="agent_invitations",
    )

    op.drop_table("agent_invitations")