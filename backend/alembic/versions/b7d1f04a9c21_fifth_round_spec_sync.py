"""fifth round spec sync (2026-07-15 規則調整落地)

- activities:date/end_date 起訖區間(既有單日資料 end_date=date)
- activity_reports:檢討會議四欄(與會人數/討論事項/內容決議)
- room_booking_slots:date → weekday(1=週一…7=週日;既有資料以 ISODOW 轉換、去重)
- venue_bookings:activity_id(NULL 容舊資料,新申請應用層必填)
- equipment_loans:activity_id NOT NULL(上線前無既有資料)+ borrower/returner_name
- venues:category CHECK 增「宿舍區」

Revision ID: b7d1f04a9c21
Revises: e4c3b52829e8
Create Date: 2026-07-16
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'b7d1f04a9c21'
down_revision: Union[str, Sequence[str], None] = 'e4c3b52829e8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ---- activities:起訖區間 ----
    op.add_column('activities', sa.Column('end_date', sa.Date(), nullable=True))
    op.execute('UPDATE activities SET end_date = date WHERE end_date IS NULL')  # 未跨日 end_date=date
    op.alter_column('activities', 'end_date', existing_type=sa.Date(), nullable=False)

    # ---- activity_reports:檢討會議四欄(review_date 已存在) ----
    op.add_column('activity_reports', sa.Column('review_attendees', sa.Integer(), nullable=True))
    op.add_column('activity_reports', sa.Column('review_topics', sa.Text(), nullable=True))
    op.add_column('activity_reports', sa.Column('review_conclusion', sa.Text(), nullable=True))

    # ---- room_booking_slots:date → weekday ----
    op.add_column('room_booking_slots', sa.Column('weekday', sa.Integer(), nullable=True))
    op.execute('UPDATE room_booking_slots SET weekday = EXTRACT(ISODOW FROM date)::int')
    # 不同日期可能落在同一(request, weekday, period),去重留最早一筆
    op.execute(
        """
        DELETE FROM room_booking_slots a
        USING room_booking_slots b
        WHERE a.request_id = b.request_id
          AND a.weekday = b.weekday
          AND a.period = b.period
          AND a.id > b.id
        """
    )
    op.alter_column('room_booking_slots', 'weekday', existing_type=sa.Integer(), nullable=False)
    op.drop_index('ix_room_booking_slots_date_period', table_name='room_booking_slots')
    op.drop_column('room_booking_slots', 'date')
    op.create_unique_constraint(
        'uq_room_booking_slots_request_weekday_period',
        'room_booking_slots',
        ['request_id', 'weekday', 'period'],
    )

    # ---- venue_bookings:綁定審核通過活動(NULL 容舊資料) ----
    op.add_column('venue_bookings', sa.Column('activity_id', sa.Integer(), nullable=True))
    op.create_foreign_key(
        'fk_venue_bookings_activity_id_activities',
        'venue_bookings', 'activities', ['activity_id'], ['id'],
    )

    # ---- equipment_loans:activity_id NOT NULL + 點交人名 ----
    op.add_column('equipment_loans', sa.Column('activity_id', sa.Integer(), nullable=True))
    # 上線前不存在需保留的借用資料;若有殘留列無法回填活動,直接擋下讓人工處理
    op.alter_column('equipment_loans', 'activity_id', existing_type=sa.Integer(), nullable=False)
    op.create_foreign_key(
        'fk_equipment_loans_activity_id_activities',
        'equipment_loans', 'activities', ['activity_id'], ['id'],
    )
    op.create_index('ix_equipment_loans_activity_id', 'equipment_loans', ['activity_id'])
    op.add_column('equipment_loans', sa.Column('borrower_name', sa.Text(), nullable=True))
    op.add_column('equipment_loans', sa.Column('returner_name', sa.Text(), nullable=True))

    # ---- venues:category 增「宿舍區」(非原生 enum,重建 CHECK) ----
    # 用 raw SQL:op.drop/create_constraint 會對名稱再套 metadata 命名慣例(ck_ 前綴重複)
    op.execute('ALTER TABLE venues DROP CONSTRAINT ck_venues_venue_category')
    op.execute(
        "ALTER TABLE venues ADD CONSTRAINT ck_venues_venue_category "
        "CHECK (category IN ('教室', '練習空間', '廣場戶外', '宿舍區'))"
    )


def downgrade() -> None:
    op.execute('ALTER TABLE venues DROP CONSTRAINT ck_venues_venue_category')
    op.execute(
        "ALTER TABLE venues ADD CONSTRAINT ck_venues_venue_category "
        "CHECK (category IN ('教室', '練習空間', '廣場戶外'))"
    )

    op.drop_column('equipment_loans', 'returner_name')
    op.drop_column('equipment_loans', 'borrower_name')
    op.drop_index('ix_equipment_loans_activity_id', table_name='equipment_loans')
    op.drop_constraint('fk_equipment_loans_activity_id_activities', 'equipment_loans', type_='foreignkey')
    op.drop_column('equipment_loans', 'activity_id')

    op.drop_constraint('fk_venue_bookings_activity_id_activities', 'venue_bookings', type_='foreignkey')
    op.drop_column('venue_bookings', 'activity_id')

    # weekday → date 無法還原原始日期,以 NULL 佔位(僅 schema 形狀回復)
    op.drop_constraint('uq_room_booking_slots_request_weekday_period', 'room_booking_slots', type_='unique')
    op.add_column('room_booking_slots', sa.Column('date', sa.Date(), nullable=True))
    op.create_index('ix_room_booking_slots_date_period', 'room_booking_slots', ['date', 'period'])
    op.drop_column('room_booking_slots', 'weekday')

    op.drop_column('activity_reports', 'review_conclusion')
    op.drop_column('activity_reports', 'review_topics')
    op.drop_column('activity_reports', 'review_attendees')

    op.drop_column('activities', 'end_date')
