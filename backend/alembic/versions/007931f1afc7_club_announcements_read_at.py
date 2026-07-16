"""clubs.announcements_read_at(鈴鐺已讀水位線)

公告 created_at 晚於水位線者未讀(鈴鐺紅點);開啟鈴鐺或進入總覽時前移。
一社一帳號,故掛在 clubs;NULL=從未讀(全部未讀)。

Revision ID: 007931f1afc7
Revises: 4290719adc82
Create Date: 2026-07-17
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = '007931f1afc7'
down_revision: Union[str, Sequence[str], None] = '4290719adc82'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'clubs', sa.Column('announcements_read_at', sa.DateTime(timezone=True), nullable=True)
    )


def downgrade() -> None:
    op.drop_column('clubs', 'announcements_read_at')
