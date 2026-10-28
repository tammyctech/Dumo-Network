"""Add phone number to users.

Revision ID: 77cc23936064
Revises: 123dc102dc84
Create Date: 2026-10-27 17:36:43.498982
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# Alembic revision identifiers
revision: str = "77cc23936064"

down_revision: Union[str, Sequence[str], None] = "123dc102dc84"

branch_labels: Union[str, Sequence[str], None] = None

depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "phone_number",
            sa.String(length=20),
            nullable=True,
        ),
    )

    op.create_unique_constraint(
        "uq_users_phone_number",
        "users",
        ["phone_number"],
    )
def downgrade() -> None:
    op.drop_constraint(
        "uq_users_phone_number",
        "users",
        type_="unique",
    )

    op.drop_column(
        "users",
        "phone_number",
    )