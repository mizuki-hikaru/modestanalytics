"""rename view id to token

Revision ID: a0b3cd9a9f38
Revises: cfcc4f37eab6
Create Date: 2025-10-26 16:23:56.458748

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a0b3cd9a9f38'
down_revision: Union[str, Sequence[str], None] = 'cfcc4f37eab6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.alter_column(
        "pageviews",
        "view_id",
        new_column_name="token"
    )



def downgrade() -> None:
    """Downgrade schema."""
    op.alter_column(
        "pageviews",
        "token",
        new_column_name="view_id"
    )
