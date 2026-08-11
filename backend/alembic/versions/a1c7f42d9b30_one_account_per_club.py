"""一社一帳號的 DB 兜底約束(users.club_id 部分唯一索引)

應用層建立社團帳號時鎖社團列再驗「尚無帳號」,但 migration/ 的匯入腳本直接寫 DB
繞過那道檢查;兩個帳號指向同一社時,登入/權限判定會以哪一個為準無從說起。

club_id 僅 role=club 使用,其餘角色為 NULL(部分索引不涵蓋 NULL)。
既有資料若已有重複,升級會直接失敗 —— 那正是要當場看見的事。

Revision ID: a1c7f42d9b30
Revises: f6d2b81c47a9
Create Date: 2026-08-11
"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'a1c7f42d9b30'
down_revision: Union[str, Sequence[str], None] = 'f6d2b81c47a9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        'uq_users_club_id',
        'users',
        ['club_id'],
        unique=True,
        postgresql_where='club_id IS NOT NULL',
    )


def downgrade() -> None:
    op.drop_index('uq_users_club_id', table_name='users')
