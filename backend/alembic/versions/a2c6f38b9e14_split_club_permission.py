"""expand the old club permission into the three page keys it used to cover

`amember` 一把鍵原本同時開社團總覽、成員列表與管理項目三頁;拆成 `aclub`/`amember`/
`aclubset` 之後,既有帳號若不改就會靜默失去前後兩頁 —— 畫面上只是少了兩個側欄項目,
沒有任何錯誤,承辦不會知道自己被降權了。原本持有的人保留全部三頁。

原 super 專屬的六頁(`amanual`/`arule`/`aoverdue`/`aaccount`/`asetting`/`aaudit`)
**刻意不在此補**:那些頁以前一般管理員本來就進不去,現在要開給誰是逐頁授權的決定。

Revision ID: a2c6f38b9e14
Revises: f1a94e2c8b30
"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "a2c6f38b9e14"
down_revision: Union[str, Sequence[str], None] = "f1a94e2c8b30"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

NEW_KEYS = ("aclub", "aclubset")


def upgrade() -> None:
    conn = op.get_bind()
    for key in NEW_KEYS:
        conn.execute(
            sa.text(
                """
                UPDATE users
                SET permissions = array_append(permissions, :key)
                WHERE 'amember' = ANY(permissions) AND NOT (:key = ANY(permissions))
                """
            ),
            {"key": key},
        )


def downgrade() -> None:
    conn = op.get_bind()
    for key in NEW_KEYS:
        conn.execute(
            sa.text("UPDATE users SET permissions = array_remove(permissions, :key)"),
            {"key": key},
        )
