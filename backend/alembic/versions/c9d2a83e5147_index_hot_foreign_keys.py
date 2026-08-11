"""熱路徑外鍵補索引

只補「真的有查詢在用」的欄位:固定借用的場地衝突檢核、依活動查臨時借用、
公告的社團指定與蓋板已讀、評鑑的逐社上傳/調整/評分、評審自己的分組、
工讀生自己填的違規紀錄。

其餘外鍵(created_by / actor_id / marked_by / checkout_by 之類的「誰做的」欄位)
沒有任何查詢以它為條件,帳號也不硬刪,刻意不補 —— 索引不是免費的。

Revision ID: c9d2a83e5147
Revises: b8e5d1c06f47
Create Date: 2026-08-11
"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'c9d2a83e5147'
down_revision: Union[str, Sequence[str], None] = 'b8e5d1c06f47'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

INDEXES = [
    ('ix_room_booking_requests_venue_id', 'room_booking_requests', 'venue_id'),
    ('ix_venue_bookings_activity_id', 'venue_bookings', 'activity_id'),
    ('ix_announcements_club_id', 'announcements', 'club_id'),
    ('ix_announcement_dismissals_club_id', 'announcement_dismissals', 'club_id'),
    ('ix_eval_uploads_club_id', 'eval_uploads', 'club_id'),
    ('ix_eval_adjustments_club_id', 'eval_adjustments', 'club_id'),
    ('ix_eval_group_clubs_club_id', 'eval_group_clubs', 'club_id'),
    ('ix_eval_group_reviewers_user_id', 'eval_group_reviewers', 'user_id'),
    ('ix_review_scores_club_id', 'review_scores', 'club_id'),
    ('ix_review_scores_reviewer_id', 'review_scores', 'reviewer_id'),
    ('ix_violations_filler_id', 'violations', 'filler_id'),
]


def upgrade() -> None:
    for name, table, column in INDEXES:
        op.create_index(name, table, [column])


def downgrade() -> None:
    for name, table, _ in INDEXES:
        op.drop_index(name, table_name=table)
