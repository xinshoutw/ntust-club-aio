"""club_members 加 semester(名單按學期快照)

前端語意為「按學期各自一份名單 + CSV 可匯入到指定學期」;
updated_at 推導無法表達「匯入到過去學期」,改為明確欄位。
唯一鍵自 (club_id, student_id) 放寬為 (club_id, student_id, semester)。

Revision ID: c7e4f8a92b15
Revises: a5b9d2e61c73
Create Date: 2026-07-16
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'c7e4f8a92b15'
down_revision: Union[str, Sequence[str], None] = 'a5b9d2e61c73'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('club_members', sa.Column('semester', sa.Text(), nullable=True))
    # 回填:依 updated_at(台北時區)所屬學期(上學期 8–1 月、下學期 2–7 月)
    op.execute(
        """
        UPDATE club_members SET semester = CASE
            WHEN EXTRACT(MONTH FROM updated_at AT TIME ZONE 'Asia/Taipei') >= 8
                THEN (EXTRACT(YEAR FROM updated_at AT TIME ZONE 'Asia/Taipei')::int - 1911) || '-1'
            WHEN EXTRACT(MONTH FROM updated_at AT TIME ZONE 'Asia/Taipei') = 1
                THEN (EXTRACT(YEAR FROM updated_at AT TIME ZONE 'Asia/Taipei')::int - 1912) || '-1'
            ELSE (EXTRACT(YEAR FROM updated_at AT TIME ZONE 'Asia/Taipei')::int - 1912) || '-2'
        END
        """
    )
    op.alter_column('club_members', 'semester', nullable=False)
    op.create_index(op.f('ix_club_members_semester'), 'club_members', ['semester'], unique=False)
    # 命名慣例會對 op.*_constraint 的名稱再套前綴,改用明確 SQL
    op.execute("ALTER TABLE club_members DROP CONSTRAINT uq_club_members_club_id")
    op.execute(
        "ALTER TABLE club_members ADD CONSTRAINT uq_club_members_club_id "
        "UNIQUE (club_id, student_id, semester)"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE club_members DROP CONSTRAINT uq_club_members_club_id")
    # 同社團同學號跨學期多列:僅保留最新更新的一列
    op.execute(
        """
        DELETE FROM club_members a USING club_members b
        WHERE a.club_id = b.club_id AND a.student_id = b.student_id AND a.id != b.id
          AND (a.updated_at < b.updated_at OR (a.updated_at = b.updated_at AND a.id < b.id))
        """
    )
    op.execute(
        "ALTER TABLE club_members ADD CONSTRAINT uq_club_members_club_id "
        "UNIQUE (club_id, student_id)"
    )
    op.drop_index(op.f('ix_club_members_semester'), table_name='club_members')
    op.drop_column('club_members', 'semester')
