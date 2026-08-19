"""make the postal account fields optional

郵局帳戶異動除事由外全部改選填(decisions.md D-07):各種異動需要的欄位不同 ——
結清銷戶不必填新代理人,新開戶當下也還沒有帳號可填。欄位維持 NOT NULL 而 schema
宣告成 `str | None` 的話,顯式帶 null 會直接 500(23502 不在錯誤轉譯表內)。

Revision ID: b7e4d29a1c85
Revises: a2c6f38b9e14
"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "b7e4d29a1c85"
down_revision: Union[str, Sequence[str], None] = "a2c6f38b9e14"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

COLUMNS = ("account_name", "account_number")


def upgrade() -> None:
    for col in COLUMNS:
        op.alter_column("postal_account_changes", col, existing_type=sa.Text(), nullable=True)


def downgrade() -> None:
    # 收回 NOT NULL 之前先把空值填掉,否則既有資料會擋住降級
    for col in COLUMNS:
        op.execute(
            f"UPDATE postal_account_changes SET {col} = '' WHERE {col} IS NULL"  # noqa: S608
        )
        op.alter_column("postal_account_changes", col, existing_type=sa.Text(), nullable=False)
