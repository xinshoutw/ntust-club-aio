"""drop clubs.advisor_phone / advisor_out_phone(不再記錄指導老師電話)

2026-08-27 需求方拍板:系統不保留指導老師的電話。舊系統遷入的號碼一併拋棄
(`migration/cms_import.py` 也不再讀 Club_teacher.Phone)。

Revision ID: c9a4f1e72d38
Revises: b7e4d90a1c53
"""

import sqlalchemy as sa
from alembic import op

revision = "c9a4f1e72d38"
down_revision = "b7e4d90a1c53"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_column("clubs", "advisor_phone")
    op.drop_column("clubs", "advisor_out_phone")


def downgrade() -> None:
    # 欄位回得來,號碼回不來 —— 這一版就是為了不再持有它們
    op.add_column("clubs", sa.Column("advisor_phone", sa.Text(), nullable=True))
    op.add_column("clubs", sa.Column("advisor_out_phone", sa.Text(), nullable=True))
