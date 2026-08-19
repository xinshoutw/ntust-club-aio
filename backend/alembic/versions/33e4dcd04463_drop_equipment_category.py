"""drop equipment.category(器材移除類別)

器材不再分類;點交方式改由既有 needs_serial 表達(一般/依序點交)。
category 欄位(VARCHAR + CHECK)整欄移除。

Revision ID: 33e4dcd04463
Revises: ccb5bc27926e
Create Date: 2026-07-17
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = '33e4dcd04463'
down_revision: Union[str, Sequence[str], None] = 'ccb5bc27926e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_CATEGORY = sa.Enum(
    '一般', '電子設備', '投影布幕', '帳篷',
    name='equipment_category', native_enum=False, create_constraint=True, length=32,
)


def upgrade() -> None:
    op.drop_column('equipment', 'category')


def downgrade() -> None:
    # 類別資訊已無從還原:一律回填「一般」
    op.add_column(
        'equipment',
        sa.Column('category', _CATEGORY, nullable=False, server_default='一般'),
    )
    op.alter_column('equipment', 'category', server_default=None)
