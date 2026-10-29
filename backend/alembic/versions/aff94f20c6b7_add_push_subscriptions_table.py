"""add push subscriptions table

Revision ID: aff94f20c6b7
Revises: 85da3ed97664
Create Date: 2026-10-29 10:01:38.458903
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# Alembic revision identifiers
revision: str = "aff94f20c6b7"
down_revision: Union[str, Sequence[str], None] = "85da3ed97664"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create the push subscriptions table."""

    op.create_table(
        "push_subscriptions",

        sa.Column(
            "id",
            sa.Integer(),
            primary_key=True,
            nullable=False,
        ),

        sa.Column(
            "user_id",
            sa.Integer(),
            nullable=False,
        ),

        sa.Column(
            "endpoint",
            sa.String(length=2048),
            nullable=False,
            unique=True,
        ),

        sa.Column(
            "p256dh",
            sa.String(length=255),
            nullable=False,
        ),

        sa.Column(
            "auth",
            sa.String(length=255),
            nullable=False,
        ),

        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
        ),

        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            ondelete="CASCADE",
        ),
    )

    op.create_index(
        "ix_push_subscriptions_id",
        "push_subscriptions",
        ["id"],
        unique=False,
    )

    op.create_index(
        "ix_push_subscriptions_user_id",
        "push_subscriptions",
        ["user_id"],
        unique=False,
    )


def downgrade() -> None:
    """Remove the push subscriptions table."""

    op.drop_index(
        "ix_push_subscriptions_user_id",
        table_name="push_subscriptions",
    )

    op.drop_index(
        "ix_push_subscriptions_id",
        table_name="push_subscriptions",
    )

    op.drop_table("push_subscriptions")