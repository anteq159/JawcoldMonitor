"""remove viewer role

Revision ID: 7b2bc1f64c8a
Revises: 02c29f607697
Create Date: 2026-07-06 09:03:28.354465

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7b2bc1f64c8a'
down_revision: Union[str, Sequence[str], None] = '02c29f607697'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Data migration: drop the built-in Viewer role. Users who held only
    # Viewer keep their accounts but end up with no role (no permissions)
    # until an admin assigns one - deliberate, since silently upgrading
    # them to Serwisant would grant write access nobody approved.
    # Custom roles (is_custom = true) named anything else are untouched.
    op.execute("""
        DELETE FROM user_roles WHERE role_id IN
            (SELECT id FROM roles WHERE name = 'Viewer' AND is_custom = false);
    """)
    op.execute("""
        DELETE FROM role_permissions WHERE role_id IN
            (SELECT id FROM roles WHERE name = 'Viewer' AND is_custom = false);
    """)
    op.execute("DELETE FROM roles WHERE name = 'Viewer' AND is_custom = false;")


def downgrade() -> None:
    # Recreate the role shell; permissions were seed-managed anyway and
    # the pre-1.11 seeder would repopulate them on boot.
    op.execute("INSERT INTO roles (name, is_custom, created_at) VALUES ('Viewer', false, now()) ON CONFLICT DO NOTHING;")
