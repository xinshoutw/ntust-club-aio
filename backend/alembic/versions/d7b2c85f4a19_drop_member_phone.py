"""drop club_members.phone(不再記錄社員電話)

2026-08-27 需求方拍板:成員名單不保留電話。舊系統遷入的號碼一併拋棄
(`migration/cms_import.py` 也不再讀 Club_member.Phone),CSV 匯入匯出縮回四欄。

Revision ID: d7b2c85f4a19
Revises: c9a4f1e72d38
"""

import sqlalchemy as sa
from alembic import op

revision = "d7b2c85f4a19"
down_revision = "c9a4f1e72d38"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_column("club_members", "phone")


def downgrade() -> None:
    # 欄位回得來,號碼回不來 —— 這一版就是為了不再持有它們
    op.add_column("club_members", sa.Column("phone", sa.Text(), nullable=True))
