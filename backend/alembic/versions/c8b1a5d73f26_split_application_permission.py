"""expand the online-application permission into the two pages it split into

「線上申請管理」拆成「幹部證明管理」與「郵局帳戶管理」兩頁(decisions.md D-11),
`aapply` 隨之廢除。既有持有者兩頁都留著 —— 拆頁是分工上的細化,不是收權。

Revision ID: c8b1a5d73f26
Revises: b7e4d29a1c85
"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "c8b1a5d73f26"
down_revision: Union[str, Sequence[str], None] = "b7e4d29a1c85"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

NEW_KEYS = ("acert", "apostal")


def upgrade() -> None:
    conn = op.get_bind()
    for key in NEW_KEYS:
        conn.execute(
            sa.text(
                """
                UPDATE users
                SET permissions = array_append(permissions, :key)
                WHERE 'aapply' = ANY(permissions) AND NOT (:key = ANY(permissions))
                """
            ),
            {"key": key},
        )
    conn.execute(sa.text("UPDATE users SET permissions = array_remove(permissions, 'aapply')"))


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(
        sa.text(
            """
            UPDATE users
            SET permissions = array_append(permissions, 'aapply')
            WHERE ('acert' = ANY(permissions) OR 'apostal' = ANY(permissions))
              AND NOT ('aapply' = ANY(permissions))
            """
        )
    )
    for key in NEW_KEYS:
        conn.execute(
            sa.text("UPDATE users SET permissions = array_remove(permissions, :key)"),
            {"key": key},
        )
