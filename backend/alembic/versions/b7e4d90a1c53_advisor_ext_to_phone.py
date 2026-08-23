"""rename clubs.advisor_ext to advisor_phone

舊系統校內指導老師那格存的是完整電話,不是分機(最長 23 字),欄位名與畫面標籤
都跟著改成「電話」—— 留一個叫 ext 的欄位裝電話,下一個人一定再踩一次。

Revision ID: b7e4d90a1c53
Revises: a3f7c2e91b48
"""

import sqlalchemy as sa
from alembic import op

revision = "b7e4d90a1c53"
down_revision = "a3f7c2e91b48"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("clubs", "advisor_ext", new_column_name="advisor_phone", type_=sa.Text())


def downgrade() -> None:
    op.alter_column("clubs", "advisor_phone", new_column_name="advisor_ext", type_=sa.Text())
