"""Create wards table.

Revision ID: 85da3ed97664
Revises: 077429a9bf92
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "85da3ed97664"

down_revision: Union[str, Sequence[str], None] = "077429a9bf92"

branch_labels: Union[str, Sequence[str], None] = None

depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """
    Create the wards table.

    This migration does not modify existing users,
    elections, polling units, or agent assignments.
    """

    op.create_table(
        "wards",

        sa.Column(
            "id",
            sa.Integer(),
            nullable=False,
        ),

        sa.Column(
            "state",
            sa.String(length=100),
            nullable=False,
        ),

        sa.Column(
            "lga",
            sa.String(length=100),
            nullable=False,
        ),

        sa.Column(
            "name",
            sa.String(length=100),
            nullable=False,
        ),

        sa.Column(
            "ward_number",
            sa.Integer(),
            nullable=False,
        ),

        sa.PrimaryKeyConstraint("id"),

        sa.UniqueConstraint(
            "state",
            "lga",
            "ward_number",
            name="uq_ward_state_lga_number",
        ),
    )

    op.create_index(
        "ix_wards_id",
        "wards",
        ["id"],
        unique=False,
    )


def downgrade() -> None:
    """
    Remove the wards table if this migration is reversed.
    """

    op.drop_index(
        "ix_wards_id",
        table_name="wards",
    )

    op.drop_table("wards")