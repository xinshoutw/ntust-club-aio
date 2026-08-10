"""drop signup_items.year(年度改推導)

ad7/ad8 出席採計改以「場次日期落在評鑑視窗」推導,不再儲存學年度;
根治 signup_items.year(114)與 eval_window.year(116)不對齊的隱患。

Revision ID: f3a8c1d47e02
Revises: d2a6c9f13b58
Create Date: 2026-07-16
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'f3a8c1d47e02'
down_revision: Union[str, Sequence[str], None] = 'd2a6c9f13b58'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_index(op.f('ix_signup_items_year'), table_name='signup_items')
    op.drop_column('signup_items', 'year')


def downgrade() -> None:
    op.add_column('signup_items', sa.Column('year', sa.Integer(), nullable=True))
    # 回填:以活動時間(缺者用報名開始)推導民國學年度(8 月起算)
    op.execute(
        """
        UPDATE signup_items SET year = CASE
            WHEN EXTRACT(MONTH FROM COALESCE(event_at, signup_start) AT TIME ZONE 'Asia/Taipei') >= 8
                THEN EXTRACT(YEAR FROM COALESCE(event_at, signup_start) AT TIME ZONE 'Asia/Taipei')::int - 1911
            ELSE EXTRACT(YEAR FROM COALESCE(event_at, signup_start) AT TIME ZONE 'Asia/Taipei')::int - 1912
        END
        """
    )
    op.alter_column('signup_items', 'year', nullable=False)
    op.create_index(op.f('ix_signup_items_year'), 'signup_items', ['year'], unique=False)
