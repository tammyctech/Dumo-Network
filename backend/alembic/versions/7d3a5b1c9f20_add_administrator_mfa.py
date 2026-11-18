"""Add administrator MFA fields.

Revision ID: 7d3a5b1c9f20
Revises: 6c2f4a9d8e10
"""
from alembic import op
import sqlalchemy as sa

revision = "7d3a5b1c9f20"
down_revision = "6c2f4a9d8e10"
branch_labels = None
depends_on = None

def upgrade():
    op.add_column("users", sa.Column("mfa_enabled", sa.Boolean(), server_default=sa.false(), nullable=False))
    op.add_column("users", sa.Column("mfa_secret_encrypted", sa.String(255), nullable=True))
    op.add_column("users", sa.Column("mfa_recovery_codes", sa.JSON(), nullable=True))

def downgrade():
    op.drop_column("users", "mfa_recovery_codes")
    op.drop_column("users", "mfa_secret_encrypted")
    op.drop_column("users", "mfa_enabled")
