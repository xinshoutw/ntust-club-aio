"""drop equipment_loans.serials

系統不再記錄器材序號(decisions.md ISS-55b)。序號原本是點交時登記的自由文字,
不對應任何器材個體主檔,跨單也無唯一性 —— 追蹤價值不足以支撐這個欄位。
`equipment.needs_serial` 保留:它仍驅動點交畫面的「請核對序號」提示。

Revision ID: d4f8a1c93b52
Revises: c9d2a83e5147
"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import ARRAY

revision: str = "d4f8a1c93b52"
down_revision: Union[str, Sequence[str], None] = "c9d2a83e5147"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column("equipment_loans", "serials")


def downgrade() -> None:
    # 欄位回得來,已登記的序號回不來(upgrade 即丟棄)
    op.add_column(
        "equipment_loans", sa.Column("serials", ARRAY(sa.Text()), nullable=True)
    )
