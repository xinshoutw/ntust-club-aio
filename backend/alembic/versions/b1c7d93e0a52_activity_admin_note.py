"""activities.admin_note(管理員審核備註)

2026-08-31 需求方拍板:承辦人在申請審核時留一段給社團看的話,社團端詳情與
申請表的「意見回饋」都印它。與退回原因無關 —— 核准的單一樣留得下話。

任一關都寫得動(不是第一關的認定),故不隨重送清空:清掉是承辦人自己按的。

Revision ID: b1c7d93e0a52
Revises: a3e91f6b28c4
"""

import sqlalchemy as sa

from alembic import op

revision = "b1c7d93e0a52"
down_revision = "a3e91f6b28c4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("activities", sa.Column("admin_note", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("activities", "admin_note")
