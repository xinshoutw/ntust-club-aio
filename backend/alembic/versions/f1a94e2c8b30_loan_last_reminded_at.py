"""add equipment_loans.last_reminded_at

歸還提醒改為自動排程(decisions.md DEC-11):排程要知道上一次寄是什麼時候才決定
隔多久再寄一次,承辦也要看得到 —— 原本只有 audit_logs 有紀錄,拿稽核軌跡驅動業務判斷不可靠。

Revision ID: f1a94e2c8b30
Revises: e5b3c72a91d4
"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "f1a94e2c8b30"
down_revision: Union[str, Sequence[str], None] = "e5b3c72a91d4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "equipment_loans",
        sa.Column("last_reminded_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("equipment_loans", "last_reminded_at")
