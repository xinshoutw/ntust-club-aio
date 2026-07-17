"""幹部證明/郵局異動改 application_status(pending/processing/completed)

2026-07-17 需求方拍板:兩類線上申請的審核流=審核中 → 處理中 → 請洽學務處(完成)。
原欄位借用 booking_status(pending/approved/rejected),但從無任何寫入端點,
既有資料只可能是 pending,值域相容、免回填。

Revision ID: 9d4b7e2c5a18
Revises: 6b5a9c3affd0
Create Date: 2026-07-17

"""
from typing import Sequence, Union

from alembic import op

revision: str = "9d4b7e2c5a18"
down_revision: Union[str, Sequence[str], None] = "6b5a9c3affd0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TABLES = ("officer_certificates", "postal_account_changes")


def upgrade() -> None:
    for table in _TABLES:
        op.drop_constraint(op.f(f"ck_{table}_booking_status"), table, type_="check")
        op.create_check_constraint(
            op.f(f"ck_{table}_application_status"),
            table,
            "status IN ('pending', 'processing', 'completed')",
        )


def downgrade() -> None:
    # 有損轉換(processing/completed 是新值域):一律回 pending,與升級前語意一致
    for table in _TABLES:
        op.execute(f"UPDATE {table} SET status = 'pending' WHERE status <> 'pending'")
        op.drop_constraint(op.f(f"ck_{table}_application_status"), table, type_="check")
        op.create_check_constraint(
            op.f(f"ck_{table}_booking_status"),
            table,
            "status IN ('pending', 'approved', 'rejected')",
        )
