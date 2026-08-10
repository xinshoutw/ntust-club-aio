"""room_booking_requests 加目標學期起訖快照

固定借用先前無任何日期/學期欄位,任何未退回申請會在場況圖上跨學期永久佔格。
拍板語義:申請時自動歸屬「下一學期」(6 月開放窗 → 8/1–1/31、1 月 → 2/1–7/31),
起訖以快照存入申請單;既有列依 created_at(台北時區)回填同一推導。

Revision ID: 6b5a9c3affd0
Revises: 33e4dcd04463
Create Date: 2026-07-17
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = '6b5a9c3affd0'
down_revision: Union[str, Sequence[str], None] = '33e4dcd04463'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# 依申請月份推導「下一學期」:2–7 月(下學期中)→ 當年 8/1–次年 1/31;
# 1 月(上學期中)→ 當年 2/1–7/31;8–12 月(上學期中)→ 次年 2/1–7/31
_BACKFILL = """
UPDATE room_booking_requests SET
    start_date = CASE
        WHEN EXTRACT(MONTH FROM created_at AT TIME ZONE 'Asia/Taipei') BETWEEN 2 AND 7
            THEN make_date(EXTRACT(YEAR FROM created_at AT TIME ZONE 'Asia/Taipei')::int, 8, 1)
        WHEN EXTRACT(MONTH FROM created_at AT TIME ZONE 'Asia/Taipei') = 1
            THEN make_date(EXTRACT(YEAR FROM created_at AT TIME ZONE 'Asia/Taipei')::int, 2, 1)
        ELSE make_date(EXTRACT(YEAR FROM created_at AT TIME ZONE 'Asia/Taipei')::int + 1, 2, 1)
    END,
    end_date = CASE
        WHEN EXTRACT(MONTH FROM created_at AT TIME ZONE 'Asia/Taipei') BETWEEN 2 AND 7
            THEN make_date(EXTRACT(YEAR FROM created_at AT TIME ZONE 'Asia/Taipei')::int + 1, 1, 31)
        WHEN EXTRACT(MONTH FROM created_at AT TIME ZONE 'Asia/Taipei') = 1
            THEN make_date(EXTRACT(YEAR FROM created_at AT TIME ZONE 'Asia/Taipei')::int, 7, 31)
        ELSE make_date(EXTRACT(YEAR FROM created_at AT TIME ZONE 'Asia/Taipei')::int + 1, 7, 31)
    END
"""


def upgrade() -> None:
    op.add_column('room_booking_requests', sa.Column('start_date', sa.Date(), nullable=True))
    op.add_column('room_booking_requests', sa.Column('end_date', sa.Date(), nullable=True))
    op.execute(_BACKFILL)
    op.alter_column('room_booking_requests', 'start_date', nullable=False)
    op.alter_column('room_booking_requests', 'end_date', nullable=False)


def downgrade() -> None:
    op.drop_column('room_booking_requests', 'end_date')
    op.drop_column('room_booking_requests', 'start_date')
