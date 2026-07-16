"""activity_reports 繳交確認三欄(2026-07-16 第九輪)

結案審核時輔導老師逐項確認照片/成果報告/學習心得;
未確認之項目評鑑以 0 分計(scoring 讀取)。既有資料視為已確認。

Revision ID: b8d5e3f61a24
Revises: c7e4f8a92b15
Create Date: 2026-07-16
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'b8d5e3f61a24'
down_revision: Union[str, Sequence[str], None] = 'c7e4f8a92b15'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    for col in ('photos_confirmed', 'report_confirmed', 'reflections_confirmed'):
        op.add_column(
            'activity_reports',
            sa.Column(col, sa.Boolean(), nullable=False, server_default=sa.true()),
        )


def downgrade() -> None:
    for col in ('reflections_confirmed', 'report_confirmed', 'photos_confirmed'):
        op.drop_column('activity_reports', col)
