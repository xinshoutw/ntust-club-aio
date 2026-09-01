"""幹部證明多一個終態 declined(已駁回)

值域放寬到兩張表(CHECK 由 `db_enum` 依模型產生,兩張表共用 ApplicationStatus),
但只有幹部證明走得到 —— 郵局帳戶異動的狀態機不含這條路(D-37)。

Revision ID: c4e8b17d2f60
Revises: b1c7d93e0a52
Create Date: 2026-09-01

"""
from typing import Sequence, Union

from alembic import op

revision: str = "c4e8b17d2f60"
down_revision: Union[str, Sequence[str], None] = "b1c7d93e0a52"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TABLES = ("officer_certificates", "postal_account_changes")
_OLD = "status IN ('pending', 'processing', 'completed')"
_NEW = "status IN ('pending', 'processing', 'completed', 'declined')"


def _recreate(condition: str) -> None:
    for table in _TABLES:
        op.drop_constraint(op.f(f"ck_{table}_application_status"), table, type_="check")
        op.create_check_constraint(
            op.f(f"ck_{table}_application_status"), table, condition
        )


def upgrade() -> None:
    _recreate(_NEW)


def downgrade() -> None:
    # 有損:駁回在舊值域裡沒有對應,回到審核中(承辦重做一次判斷)。
    # 兩張表都要清:upgrade 放寬的是兩張,只清一張的話 postal 有殘值就收不回窄 CHECK
    for table in _TABLES:
        op.execute(f"UPDATE {table} SET status = 'pending' WHERE status = 'declined'")
    _recreate(_OLD)
