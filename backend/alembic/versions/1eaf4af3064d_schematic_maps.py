"""schematic maps

Revision ID: 1eaf4af3064d
Revises: 7b2bc1f64c8a
Create Date: 2026-07-06 13:01:52.182162

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '1eaf4af3064d'
down_revision: Union[str, Sequence[str], None] = '7b2bc1f64c8a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Schematic maps: existing rows are uploaded images (kind='image');
    # drawn circuit schematics have no file, content lives in `drawing`.
    op.add_column("floor_maps", sa.Column("kind", sa.String(length=16), nullable=False, server_default="image"))
    op.add_column("floor_maps", sa.Column(
        "drawing", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="[]",
    ))
    op.alter_column("floor_maps", "filename", existing_type=sa.String(length=256), nullable=True)


def downgrade() -> None:
    op.alter_column("floor_maps", "filename", existing_type=sa.String(length=256), nullable=False)
    op.drop_column("floor_maps", "drawing")
    op.drop_column("floor_maps", "kind")
