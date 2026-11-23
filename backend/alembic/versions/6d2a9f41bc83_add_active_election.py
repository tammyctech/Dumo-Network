"""add active election selection

Revision ID: 6d2a9f41bc83
Revises: 5c1d8e2f4a70
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "6d2a9f41bc83"
down_revision: Union[str, Sequence[str], None] = "5c1d8e2f4a70"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "elections",
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.execute(sa.text("""
        UPDATE elections
        SET is_active = true
        WHERE id = (
            SELECT id FROM elections
            WHERE state = 'Rivers'
            ORDER BY id DESC
            LIMIT 1
        )
    """))


def downgrade() -> None:
    op.drop_column("elections", "is_active")
