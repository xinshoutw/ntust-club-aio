"""簽核紀錄的 actor_id 可空:系統自動撤銷沒有經手人

核准後區間過了還沒去領的器材借用由系統撤銷(decisions.md D-40),那一筆 REVOKE 沒有人簽。

Revision ID: e5a1c9d47b23
Revises: c4e8b17d2f60
Create Date: 2026-09-09

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e5a1c9d47b23"
down_revision: Union[str, Sequence[str], None] = "c4e8b17d2f60"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column("approval_records", "actor_id", existing_type=sa.Integer(), nullable=True)


def downgrade() -> None:
    # 系統寫的那些列沒有人可掛,收回可空就只能刪
    op.execute("DELETE FROM approval_records WHERE actor_id IS NULL")
    op.alter_column("approval_records", "actor_id", existing_type=sa.Integer(), nullable=False)
