"""Record existing election monitoring tables.

Revision ID: 123dc102dc84
Revises: ff78fe0dd548
"""

from typing import Sequence, Union

revision: str = "123dc102dc84"

down_revision: Union[str, Sequence[str], None] = "ff78fe0dd548"

branch_labels: Union[str, Sequence[str], None] = None

depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Election tables already exist in this development database.
    pass


def downgrade() -> None:
    # Preserve existing election data.
    pass