"""member_kind 增加 負責人/副負責人

正副社長自「幹部+職稱」升為一級身份,顯示時依社團名稱末字推導
(…社→社長、…會→會長);廢除「社長/會長」模糊複合形式。

Revision ID: a5b9d2e61c73
Revises: f3a8c1d47e02
Create Date: 2026-07-16
"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'a5b9d2e61c73'
down_revision: Union[str, Sequence[str], None] = 'f3a8c1d47e02'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 命名慣例會對 op.*_constraint 的名稱再套 ck_ 前綴,改用明確 SQL
    op.execute("ALTER TABLE club_members DROP CONSTRAINT ck_club_members_member_kind")
    op.execute(
        "UPDATE club_members SET kind = '負責人', title = NULL "
        "WHERE kind = '幹部' AND title IN ('社長', '會長')"
    )
    op.execute(
        "UPDATE club_members SET kind = '副負責人', title = NULL "
        "WHERE kind = '幹部' AND title IN ('副社長', '副會長')"
    )
    op.execute(
        "ALTER TABLE club_members ADD CONSTRAINT ck_club_members_member_kind "
        "CHECK (kind IN ('負責人', '副負責人', '幹部', '社員'))"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE club_members DROP CONSTRAINT ck_club_members_member_kind")
    # 還原為幹部+職稱;職稱依社團名稱末字推導(…會→會長,其餘→社長)
    op.execute(
        """
        UPDATE club_members m SET kind = '幹部',
            title = CASE
                WHEN c.name LIKE '%會' THEN
                    CASE WHEN m.kind = '負責人' THEN '會長' ELSE '副會長' END
                ELSE
                    CASE WHEN m.kind = '負責人' THEN '社長' ELSE '副社長' END
            END
        FROM clubs c
        WHERE c.id = m.club_id AND m.kind IN ('負責人', '副負責人')
        """
    )
    op.execute(
        "ALTER TABLE club_members ADD CONSTRAINT ck_club_members_member_kind "
        "CHECK (kind IN ('幹部', '社員'))"
    )
