"""activities 草稿允許部分填寫

date/end_date 改 nullable;status 條件 CHECK 保住非草稿列的完整性
(name/location 非空、起訖日非 NULL)。送出時 submit 端點檢核必填。

Revision ID: ccb5bc27926e
Revises: 007931f1afc7
Create Date: 2026-07-17
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'ccb5bc27926e'
down_revision: Union[str, Sequence[str], None] = '007931f1afc7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column('activities', 'date', existing_type=sa.Date(), nullable=True)
    op.alter_column('activities', 'end_date', existing_type=sa.Date(), nullable=True)
    op.create_check_constraint(
        op.f('ck_activities_draft_partial_only'),
        'activities',
        "status = 'draft' OR (date IS NOT NULL AND end_date IS NOT NULL"
        " AND name <> '' AND location <> '')",
    )


def downgrade() -> None:
    op.drop_constraint(op.f('ck_activities_draft_partial_only'), 'activities', type_='check')
    # 部分填寫的草稿無法回填必填欄位,直接移除(僅 draft 可能缺值)
    op.execute("DELETE FROM activities WHERE date IS NULL OR end_date IS NULL")
    op.alter_column('activities', 'end_date', existing_type=sa.Date(), nullable=False)
    op.alter_column('activities', 'date', existing_type=sa.Date(), nullable=False)
