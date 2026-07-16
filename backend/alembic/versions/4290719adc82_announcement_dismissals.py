"""announcement_dismissals(蓋板公告「不再顯示」)

社團於蓋板公告勾選「不再顯示」後,該公告不再於登入時蓋板;
跨裝置需持久化,故入 DB(sessionStorage 僅涵蓋單一瀏覽器 session)。

Revision ID: 4290719adc82
Revises: a9c2e51d7f43
Create Date: 2026-07-17
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = '4290719adc82'
down_revision: Union[str, Sequence[str], None] = 'a9c2e51d7f43'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'announcement_dismissals',
        sa.Column('announcement_id', sa.Integer(), nullable=False),
        sa.Column('club_id', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(
            ['announcement_id'],
            ['announcements.id'],
            name=op.f('fk_announcement_dismissals_announcement_id_announcements'),
            ondelete='CASCADE',
        ),
        sa.ForeignKeyConstraint(
            ['club_id'],
            ['clubs.id'],
            name=op.f('fk_announcement_dismissals_club_id_clubs'),
            ondelete='CASCADE',
        ),
        sa.PrimaryKeyConstraint('announcement_id', 'club_id', name=op.f('pk_announcement_dismissals')),
    )


def downgrade() -> None:
    op.drop_table('announcement_dismissals')
