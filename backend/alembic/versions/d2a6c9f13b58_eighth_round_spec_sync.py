"""eighth round spec sync (2026-07-16 第八輪需求落地)

- announcements:attrs(性質多選)/club_id/takeover_until(蓋板)/notify;
  target_value 轉入新欄後移除(attr → attrs=[值]、club → club_id=值::int)
- clubs:contact_emails(聯絡 Email 至多 3 組,公告通知寄送對象)
- signup_items:event_at/signup_start/signup_end(datetime 報名窗)取代
  event_date/time_text/deadline;audience 併入 description;max_participants
  NOT NULL ≥1(名額上限必填);移除 allow_multiple(上限=1 即單人)
- audit_logs.user_id FK 改 ON DELETE SET NULL(刪除帳號時稽核紀錄保留)

Revision ID: d2a6c9f13b58
Revises: b7d1f04a9c21
Create Date: 2026-07-16
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'd2a6c9f13b58'
down_revision: Union[str, Sequence[str], None] = 'b7d1f04a9c21'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ---- announcements:scope 擴充 + 蓋板 + 通知 ----
    op.add_column('announcements', sa.Column('attrs', postgresql.ARRAY(sa.Text()), nullable=True))
    op.add_column('announcements', sa.Column('club_id', sa.Integer(), nullable=True))
    op.add_column('announcements', sa.Column('takeover_until', sa.Date(), nullable=True))
    op.add_column(
        'announcements',
        sa.Column('notify', sa.Boolean(), nullable=False, server_default=sa.text('false')),
    )
    op.execute(
        "UPDATE announcements SET attrs = ARRAY[target_value] "
        "WHERE target_type = 'attr' AND target_value IS NOT NULL"
    )
    op.execute(
        "UPDATE announcements SET club_id = target_value::int "
        "WHERE target_type = 'club' AND target_value ~ '^[0-9]+$'"
    )
    op.create_foreign_key(
        'fk_announcements_club_id_clubs', 'announcements', 'clubs', ['club_id'], ['id'],
    )
    op.drop_column('announcements', 'target_value')

    # ---- clubs:聯絡 Email(至多 3 組,應用層強制) ----
    op.add_column(
        'clubs',
        sa.Column(
            'contact_emails',
            postgresql.ARRAY(sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::text[]"),
        ),
    )

    # ---- signup_items:第八輪欄位(datetime 報名窗、名額必填) ----
    op.add_column(
        'signup_items', sa.Column('event_at', sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column(
        'signup_items',
        sa.Column(
            'signup_start',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()'),
            nullable=True,
        ),
    )
    op.add_column(
        'signup_items', sa.Column('signup_end', sa.DateTime(timezone=True), nullable=True)
    )
    # 既有資料轉換:event_date → 當日 00:00(台北);deadline → 當日 23:59:59(截止日當天仍可報名)
    op.execute(
        "UPDATE signup_items SET event_at = (event_date + time '00:00') AT TIME ZONE 'Asia/Taipei' "
        "WHERE event_date IS NOT NULL"
    )
    op.execute('UPDATE signup_items SET signup_start = created_at')
    op.execute(
        "UPDATE signup_items SET signup_end = (deadline + time '23:59:59') AT TIME ZONE 'Asia/Taipei' "
        "WHERE deadline IS NOT NULL"
    )
    op.alter_column(
        'signup_items', 'signup_start', existing_type=sa.DateTime(timezone=True), nullable=False
    )
    op.execute(
        "UPDATE signup_items SET description = audience "
        "WHERE audience IS NOT NULL AND description = ''"
    )
    op.execute('UPDATE signup_items SET max_participants = 1 WHERE max_participants IS NULL')
    op.alter_column(
        'signup_items', 'max_participants', existing_type=sa.Integer(), nullable=False
    )
    # raw SQL:op.create_check_constraint 會對名稱再套 metadata 命名慣例(ck_ 前綴重複)
    op.execute(
        'ALTER TABLE signup_items ADD CONSTRAINT ck_signup_items_capacity_min '
        'CHECK (max_participants >= 1)'
    )
    op.drop_column('signup_items', 'deadline')
    op.drop_column('signup_items', 'event_date')
    op.drop_column('signup_items', 'time_text')
    op.drop_column('signup_items', 'audience')
    op.drop_column('signup_items', 'allow_multiple')

    # ---- audit_logs:刪除帳號時稽核紀錄保留(user_id 置 NULL) ----
    op.drop_constraint('fk_audit_logs_user_id_users', 'audit_logs', type_='foreignkey')
    op.create_foreign_key(
        'fk_audit_logs_user_id_users', 'audit_logs', 'users', ['user_id'], ['id'],
        ondelete='SET NULL',
    )


def downgrade() -> None:
    op.drop_constraint('fk_audit_logs_user_id_users', 'audit_logs', type_='foreignkey')
    op.create_foreign_key(
        'fk_audit_logs_user_id_users', 'audit_logs', 'users', ['user_id'], ['id'],
    )

    op.add_column('signup_items', sa.Column('allow_multiple', sa.Boolean(), nullable=False,
                                            server_default=sa.text('false')))
    op.add_column('signup_items', sa.Column('audience', sa.Text(), nullable=True))
    op.add_column('signup_items', sa.Column('time_text', sa.Text(), nullable=True))
    op.add_column('signup_items', sa.Column('event_date', sa.Date(), nullable=True))
    op.add_column('signup_items', sa.Column('deadline', sa.Date(), nullable=True))
    op.execute(
        "UPDATE signup_items SET event_date = (event_at AT TIME ZONE 'Asia/Taipei')::date "
        "WHERE event_at IS NOT NULL"
    )
    op.execute(
        "UPDATE signup_items SET deadline = (signup_end AT TIME ZONE 'Asia/Taipei')::date "
        "WHERE signup_end IS NOT NULL"
    )
    op.execute('ALTER TABLE signup_items DROP CONSTRAINT ck_signup_items_capacity_min')
    op.alter_column(
        'signup_items', 'max_participants', existing_type=sa.Integer(), nullable=True
    )
    op.drop_column('signup_items', 'signup_end')
    op.drop_column('signup_items', 'signup_start')
    op.drop_column('signup_items', 'event_at')

    op.drop_column('clubs', 'contact_emails')

    op.add_column('announcements', sa.Column('target_value', sa.Text(), nullable=True))
    op.execute(
        "UPDATE announcements SET target_value = attrs[1] "
        "WHERE target_type = 'attr' AND attrs IS NOT NULL AND array_length(attrs, 1) >= 1"
    )
    op.execute(
        "UPDATE announcements SET target_value = club_id::text "
        "WHERE target_type = 'club' AND club_id IS NOT NULL"
    )
    op.drop_constraint('fk_announcements_club_id_clubs', 'announcements', type_='foreignkey')
    op.drop_column('announcements', 'notify')
    op.drop_column('announcements', 'takeover_until')
    op.drop_column('announcements', 'club_id')
    op.drop_column('announcements', 'attrs')
