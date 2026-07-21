"""clubclass 遷移前置 schema(2026-07-21 需求方拍板)

- Booking/Loan 加 cancelled 狀態:社團可取消審核中或已核准未開始的借用
- venue_bookings / equipment_loans:club_id 改 NULL(NULL=行政手動借用)、加 phone(聯絡電話)
- equipment_loans.activity_id 改 NULL:舊系統活動已刪的歷史借用
- equipment.max_lease_count:單次可借上限(NULL=不限)
- venue_block_rules:場地不開放規則(Rule Page;場況圖與申請/核准檢核)

Revision ID: b3e7d40a95c1
Revises: 8f2c6a91d3e5
Create Date: 2026-07-21
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import ARRAY

# revision identifiers, used by Alembic.
revision: str = 'b3e7d40a95c1'
down_revision: Union[str, Sequence[str], None] = '8f2c6a91d3e5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 狀態 CHECK 擴充 cancelled(非原生 enum;drop_constraint 會疊 naming convention,用 raw SQL)
    op.execute('ALTER TABLE venue_bookings DROP CONSTRAINT ck_venue_bookings_booking_status')
    op.create_check_constraint(
        'booking_status', 'venue_bookings',
        "status IN ('pending', 'approved', 'rejected', 'cancelled')",
    )
    op.execute(
        'ALTER TABLE room_booking_requests'
        ' DROP CONSTRAINT ck_room_booking_requests_booking_status'
    )
    op.create_check_constraint(
        'booking_status', 'room_booking_requests',
        "status IN ('pending', 'approved', 'rejected', 'cancelled')",
    )
    op.execute('ALTER TABLE equipment_loans DROP CONSTRAINT ck_equipment_loans_loan_status')
    op.create_check_constraint(
        'loan_status', 'equipment_loans',
        "status IN ('pending', 'approved', 'rejected', 'cancelled',"
        " 'checked_out', 'returned')",
    )

    op.alter_column('venue_bookings', 'club_id', nullable=True)
    op.add_column('venue_bookings', sa.Column('phone', sa.Text(), nullable=True))
    op.alter_column('equipment_loans', 'club_id', nullable=True)
    op.alter_column('equipment_loans', 'activity_id', nullable=True)
    op.add_column('equipment_loans', sa.Column('phone', sa.Text(), nullable=True))
    op.add_column('equipment', sa.Column('max_lease_count', sa.Integer(), nullable=True))

    op.create_table(
        'venue_block_rules',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('venue_id', sa.Integer(), sa.ForeignKey('venues.id'), nullable=False),
        sa.Column('start_date', sa.Date(), nullable=False),
        sa.Column('end_date', sa.Date(), nullable=False),
        sa.Column('weekdays', ARRAY(sa.SmallInteger()), nullable=True),  # ISO 1–7;NULL=每天
        sa.Column('periods', ARRAY(sa.String(2)), nullable=False),  # 14 節次子集
        sa.Column('reason', sa.Text(), nullable=False),
        sa.Column('created_by', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column(
            'created_at', sa.DateTime(timezone=True),
            server_default=sa.func.now(), nullable=False,
        ),
        sa.Column(
            'updated_at', sa.DateTime(timezone=True),
            server_default=sa.func.now(), nullable=False,
        ),
    )
    op.create_index('ix_venue_block_rules_venue_id', 'venue_block_rules', ['venue_id'])


def downgrade() -> None:
    op.drop_index('ix_venue_block_rules_venue_id', table_name='venue_block_rules')
    op.drop_table('venue_block_rules')

    op.drop_column('equipment', 'max_lease_count')
    op.drop_column('equipment_loans', 'phone')
    # NULL activity/club(行政手動借用、舊系統斷鏈)無從還原:整列刪除
    op.execute('DELETE FROM equipment_loans WHERE club_id IS NULL OR activity_id IS NULL')
    op.alter_column('equipment_loans', 'activity_id', nullable=False)
    op.alter_column('equipment_loans', 'club_id', nullable=False)
    op.drop_column('venue_bookings', 'phone')
    op.execute('DELETE FROM venue_bookings WHERE club_id IS NULL')
    op.alter_column('venue_bookings', 'club_id', nullable=False)

    # cancelled 無從還原:一律回 rejected
    op.execute('ALTER TABLE equipment_loans DROP CONSTRAINT ck_equipment_loans_loan_status')
    op.execute("UPDATE equipment_loans SET status = 'rejected' WHERE status = 'cancelled'")
    op.create_check_constraint(
        'loan_status', 'equipment_loans',
        "status IN ('pending', 'approved', 'rejected', 'checked_out', 'returned')",
    )
    op.execute(
        'ALTER TABLE room_booking_requests'
        ' DROP CONSTRAINT ck_room_booking_requests_booking_status'
    )
    op.execute(
        "UPDATE room_booking_requests SET status = 'rejected' WHERE status = 'cancelled'"
    )
    op.create_check_constraint(
        'booking_status', 'room_booking_requests',
        "status IN ('pending', 'approved', 'rejected')",
    )
    op.execute('ALTER TABLE venue_bookings DROP CONSTRAINT ck_venue_bookings_booking_status')
    op.execute("UPDATE venue_bookings SET status = 'rejected' WHERE status = 'cancelled'")
    op.create_check_constraint(
        'booking_status', 'venue_bookings',
        "status IN ('pending', 'approved', 'rejected')",
    )
