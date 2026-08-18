"""map the legacy permission keys onto the ones the UI uses

同一件事原本有兩個鍵名並存(`aact`/`areview`、`areg`/`asignup`),後端兩套都收,
DB 裡兩套皆合法。統一為前端權限彈窗使用的那一組,並就地改寫既有帳號 ——
建了正式帳號之後才改就得逐一修改每個管理員的 `permissions`。

Revision ID: e5b3c72a91d4
Revises: d4f8a1c93b52
"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "e5b3c72a91d4"
down_revision: Union[str, Sequence[str], None] = "d4f8a1c93b52"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# 舊鍵 → 新鍵
RENAMES = {"aact": "areview", "areg": "asignup"}


def _rewrite(mapping: dict[str, str]) -> None:
    """就地改名並去重:同時持有新舊兩鍵的帳號改完會剩一個。"""
    conn = op.get_bind()
    for old, new in mapping.items():
        conn.execute(
            sa.text(
                """
                UPDATE users
                SET permissions = (
                    SELECT array_agg(DISTINCT CASE WHEN k = :old THEN :new ELSE k END)
                    FROM unnest(permissions) AS k
                )
                WHERE :old = ANY(permissions)
                """
            ),
            {"old": old, "new": new},
        )


def upgrade() -> None:
    _rewrite(RENAMES)


def downgrade() -> None:
    # 不可逆:改回舊鍵會把「本來就持新鍵」的帳號一併換掉,無從分辨
    pass
