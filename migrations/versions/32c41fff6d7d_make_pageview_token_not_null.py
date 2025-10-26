"""make pageview token not null

Revision ID: 32c41fff6d7d
Revises: a0b3cd9a9f38
Create Date: 2025-10-26 16:26:57.499664

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '32c41fff6d7d'
down_revision: Union[str, Sequence[str], None] = 'a0b3cd9a9f38'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table("pageviews") as batch_op:
        batch_op.alter_column(
            "token",
            existing_type=sa.String(),   # your actual type/length here
            existing_nullable=True,      # tell Alembic the current state
            nullable=False               # <- make NOT NULL
        )

def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table("pageviews") as batch_op:
        batch_op.alter_column(
            "token",
            existing_type=sa.String(),
            existing_nullable=False,
            nullable=True
        )
