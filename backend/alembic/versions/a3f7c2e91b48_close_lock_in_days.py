"""switch the activity close deadline from months to days

結案期限改以天計(1–366),設定鍵 close_lock_months → close_lock_days;
既有值以 1 個月=30 天換算(月制的上限 6 換完是 180,仍在新範圍內)。

Revision ID: a3f7c2e91b48
Revises: c8b1a5d73f26
"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "a3f7c2e91b48"
down_revision: Union[str, Sequence[str], None] = "c8b1a5d73f26"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

DAYS_PER_MONTH = 30


def upgrade() -> None:
    conn = op.get_bind()
    # downgrade 後又存過一次系統設定的話兩個鍵會並存,直接改名會撞主鍵、整個容器起不來
    conn.execute(sa.text("DELETE FROM system_settings WHERE key = 'close_lock_days'"))
    conn.execute(
        sa.text(
            r"""
            UPDATE system_settings
            SET key = 'close_lock_days',
                value = to_jsonb(GREATEST(1, LEAST(366, (value #>> '{}')::numeric * :per_month))::int)
            WHERE key = 'close_lock_months' AND value #>> '{}' ~ '^-?[0-9]+(\.[0-9]+)?$'
            """
        ),
        {"per_month": DAYS_PER_MONTH},
    )
    # 數字與數字字串都換算(新程式的 int() 兩種都吃);真的不是數字才刪 ——
    # 留著只會讓新程式讀到一個它不認得的鍵
    conn.execute(sa.text("DELETE FROM system_settings WHERE key = 'close_lock_months'"))


def downgrade() -> None:
    # 1 個月=30 天只是近似:回月制後個別活動的期限會前後差幾天,超過舊制上限 6 個月的
    # 設定(> 180 天)更是一定會縮短,回月制後要重新確認這個值
    conn = op.get_bind()
    conn.execute(sa.text("DELETE FROM system_settings WHERE key = 'close_lock_months'"))
    conn.execute(
        sa.text(
            r"""
            UPDATE system_settings
            SET key = 'close_lock_months',
                value = to_jsonb(
                    LEAST(6, GREATEST(1, CEIL((value #>> '{}')::numeric / :per_month))::int)
                )
            WHERE key = 'close_lock_days' AND value #>> '{}' ~ '^-?[0-9]+(\.[0-9]+)?$'
            """
        ),
        {"per_month": DAYS_PER_MONTH},
    )
    conn.execute(sa.text("DELETE FROM system_settings WHERE key = 'close_lock_days'"))
