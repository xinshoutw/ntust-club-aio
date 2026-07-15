from datetime import date, datetime

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, db_enum
from app.models.enums import BookingStatus, LoanStatus


class RoomBookingRequest(Base, TimestampMixin):
    """教室固定借用(2026-07-15 重定義):整學期每週固定時段,一單多時段。

    僅於開放窗(system_settings fixed_booking_window)受理;每社至多 10 節;
    晚間時段(第 10 節及 A–D 節)至少連續 3 節;衝突由管理員整單擇一核准。
    """

    __tablename__ = "room_booking_requests"

    id: Mapped[int] = mapped_column(primary_key=True)
    club_id: Mapped[int] = mapped_column(sa.ForeignKey("clubs.id"), index=True)
    venue_id: Mapped[int] = mapped_column(sa.ForeignKey("venues.id"))  # allow_fixed
    purpose: Mapped[str] = mapped_column(sa.Text)  # 用途必填(2026-07-15)
    status: Mapped[BookingStatus] = mapped_column(
        db_enum(BookingStatus, "booking_status"), default=BookingStatus.PENDING
    )

    slots: Mapped[list[RoomBookingSlot]] = relationship(
        cascade="all, delete-orphan", order_by="RoomBookingSlot.id"
    )


class RoomBookingSlot(Base, TimestampMixin):
    __tablename__ = "room_booking_slots"
    __table_args__ = (
        sa.UniqueConstraint(
            "request_id", "weekday", "period", name="uq_room_booking_slots_request_weekday_period"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    request_id: Mapped[int] = mapped_column(
        sa.ForeignKey("room_booking_requests.id", ondelete="CASCADE"), index=True
    )
    weekday: Mapped[int] = mapped_column()  # 1=週一 … 7=週日(2026-07-15 取代 date)
    period: Mapped[str] = mapped_column(sa.String(2))  # 1–10、A–D(14 節次)


class VenueBooking(Base, TimestampMixin):
    """臨時場地借用:單日多節次。"""

    __tablename__ = "venue_bookings"
    __table_args__ = (sa.Index("ix_venue_bookings_venue_date", "venue_id", "date"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    club_id: Mapped[int] = mapped_column(sa.ForeignKey("clubs.id"), index=True)
    venue_id: Mapped[int] = mapped_column(sa.ForeignKey("venues.id"))  # allow_temp
    # 綁定審核通過活動(2026-07-15 第六輪前端必選;NULL 容舊資料,新申請應用層必填)
    activity_id: Mapped[int | None] = mapped_column(sa.ForeignKey("activities.id"))
    date: Mapped[date] = mapped_column(sa.Date)
    periods: Mapped[list[str]] = mapped_column(ARRAY(sa.String(2)))  # 複選節次
    purpose: Mapped[str] = mapped_column(sa.Text)  # 用途必填(2026-07-15)
    status: Mapped[BookingStatus] = mapped_column(
        db_enum(BookingStatus, "booking_status"), default=BookingStatus.PENDING
    )


class EquipmentLoan(Base, TimestampMixin):
    """器材借用:一單一品項;逾期=推導(checked_out 且過了 end_date 隔天上班日 10:30)。

    2026-07-15:綁定審核通過活動,借用區間由活動起訖 ± 工作天緩衝推導後寫入
    start/end_date(申請當下的區間快照;之後調整緩衝設定不回溯已成立的借用)。
    """

    __tablename__ = "equipment_loans"
    __table_args__ = (sa.Index("ix_equipment_loans_club_status", "club_id", "status"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    club_id: Mapped[int] = mapped_column(sa.ForeignKey("clubs.id"))
    equipment_id: Mapped[int] = mapped_column(sa.ForeignKey("equipment.id"), index=True)
    activity_id: Mapped[int] = mapped_column(sa.ForeignKey("activities.id"), index=True)
    qty: Mapped[int] = mapped_column()
    start_date: Mapped[date] = mapped_column(sa.Date)  # 推導:活動開始日 −N 個工作天
    end_date: Mapped[date] = mapped_column(sa.Date)  # 推導:活動結束日 +M 個工作天
    purpose: Mapped[str] = mapped_column(sa.Text)
    status: Mapped[LoanStatus] = mapped_column(
        db_enum(LoanStatus, "loan_status"), default=LoanStatus.PENDING
    )
    # 借出點交(工讀生;需序號類登記序號)
    checkout_by: Mapped[int | None] = mapped_column(sa.ForeignKey("users.id"))
    checkout_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True))
    serials: Mapped[list[str] | None] = mapped_column(ARRAY(sa.Text))
    borrower_name: Mapped[str | None] = mapped_column(sa.Text)  # 借用人(借出點交時登記)
    # 歸還點交
    checkin_by: Mapped[int | None] = mapped_column(sa.ForeignKey("users.id"))
    checkin_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True))
    checkin_note: Mapped[str | None] = mapped_column(sa.Text)
    returner_name: Mapped[str | None] = mapped_column(sa.Text)  # 歸還人(歸還點交時登記)
