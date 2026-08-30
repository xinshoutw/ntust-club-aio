"""activities.submitted_at(送件時間不再借用建立時間)

2026-08-29 需求方拍板(D-29):送出審核的時刻獨立記錄,**每次送審都覆寫** ——
退回重送就是重新到承辦手上。待審佇列依它排序,取 created_at 的話,
七月建的草稿八月才送審會排在八月初就送件的活動前面。

既有列一律回填 `created_at`:舊系統的 Club_activity 沒有對應欄位(遷入的
created_at 來自 SetupTime,即建檔時間),回填等價於現況、不製造假資料。
草稿留 NULL —— 它本來就還沒送出,而行政端看不到草稿。

Revision ID: a3e91f6b28c4
Revises: d7b2c85f4a19
"""

import sqlalchemy as sa

from alembic import op

revision = "a3e91f6b28c4"
down_revision = "d7b2c85f4a19"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "activities", sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.execute(
        "UPDATE activities SET submitted_at = created_at WHERE status <> 'draft'"
    )


def downgrade() -> None:
    op.drop_column("activities", "submitted_at")
