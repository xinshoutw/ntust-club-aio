"""eval_groups.award_id(分組屬於哪個獎項)

分組=獎項 × 社團 × 評審:原 schema 只有「分組 × 社團 × 評審」,
分組屬於哪個獎項無處存放,評審指派無法對應 rubric 與 review_scores。
表目前為空,直接加 NOT NULL 安全。

Revision ID: f6d2b81c47a9
Revises: b3e7d40a95c1
Create Date: 2026-07-21
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'f6d2b81c47a9'
down_revision: Union[str, Sequence[str], None] = 'b3e7d40a95c1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('eval_groups', sa.Column('award_id', sa.Text(), nullable=False))
    op.create_index(op.f('ix_eval_groups_award_id'), 'eval_groups', ['award_id'], unique=False)
    op.create_foreign_key(
        op.f('fk_eval_groups_award_id_awards'), 'eval_groups', 'awards', ['award_id'], ['id']
    )


def downgrade() -> None:
    op.drop_constraint(op.f('fk_eval_groups_award_id_awards'), 'eval_groups', type_='foreignkey')
    op.drop_index(op.f('ix_eval_groups_award_id'), table_name='eval_groups')
    op.drop_column('eval_groups', 'award_id')
