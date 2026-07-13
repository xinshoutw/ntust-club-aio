from datetime import date, datetime

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, db_enum
from app.models.enums import BookingStatus, LoanStatus


class RoomBookingRequest(Base, TimestampMixin):
    """教室固定借用:一單多時段;核准時檢查時段衝突。"""

    __tablename__ = "room_booking_requests"

    id: Mapped[int] = mapped_column(primary_key=True)
    club_id: Mapped[int] = mapped_column(sa.ForeignKey("clubs.id"), index=True)
    venue_id: Mapped[int] = mapped_column(sa.ForeignKey("venues.id"))  # allow_fixed
    purpose: Mapped[str] = mapped_column(sa.Text)
    status: Mapped[BookingStatus] = mapped_column(
        db_enum(BookingStatus, "booking_status"), default=BookingStatus.PENDING
    )

    slots: Mapped[list[RoomBookingSlot]] = relationship(
        cascade="all, delete-orphan", order_by="RoomBookingSlot.id"
    )


class RoomBookingSlot(Base, TimestampMixin):
    __tablename__ = "room_booking_slots"
    __table_args__ = (sa.Index("ix_room_booking_slots_date_period", "date", "period"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    request_id: Mapped[int] = mapped_column(
        sa.ForeignKey("room_booking_requests.id", ondelete="CASCADE"), index=True
    )
    date: Mapped[date] = mapped_column(sa.Date)
    period: Mapped[str] = mapped_column(sa.String(2))  # 1–10、A–D(14 節次)


class VenueBooking(Base, TimestampMixin):
    """臨時場地借用:單日多節次。"""

    __tablename__ = "venue_bookings"
    __table_args__ = (sa.Index("ix_venue_bookings_venue_date", "venue_id", "date"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    club_id: Mapped[int] = mapped_column(sa.ForeignKey("clubs.id"), index=True)
    venue_id: Mapped[int] = mapped_column(sa.ForeignKey("venues.id"))  # allow_temp
    date: Mapped[date] = mapped_column(sa.Date)
    periods: Mapped[list[str]] = mapped_column(ARRAY(sa.String(2)))  # 複選節次
    purpose: Mapped[str] = mapped_column(sa.Text)
    status: Mapped[BookingStatus] = mapped_column(
        db_enum(BookingStatus, "booking_status"), default=BookingStatus.PENDING
    )


class EquipmentLoan(Base, TimestampMixin):
    """器材借用:一單一品項;逾期=推導(checked_out 且過了 end_date 隔天上班日 10:30)。"""

    __tablename__ = "equipment_loans"
    __table_args__ = (sa.Index("ix_equipment_loans_club_status", "club_id", "status"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    club_id: Mapped[int] = mapped_column(sa.ForeignKey("clubs.id"))
    equipment_id: Mapped[int] = mapped_column(sa.ForeignKey("equipment.id"), index=True)
    qty: Mapped[int] = mapped_column()
    start_date: Mapped[date] = mapped_column(sa.Date)
    end_date: Mapped[date] = mapped_column(sa.Date)
    purpose: Mapped[str] = mapped_column(sa.Text)
    status: Mapped[LoanStatus] = mapped_column(
        db_enum(LoanStatus, "loan_status"), default=LoanStatus.PENDING
    )
    # 借出點交(工讀生;需序號類登記序號)
    checkout_by: Mapped[int | None] = mapped_column(sa.ForeignKey("users.id"))
    checkout_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True))
    serials: Mapped[list[str] | None] = mapped_column(ARRAY(sa.Text))
    # 歸還點交
    checkin_by: Mapped[int | None] = mapped_column(sa.ForeignKey("users.id"))
    checkin_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True))
    checkin_note: Mapped[str | None] = mapped_column(sa.Text)
