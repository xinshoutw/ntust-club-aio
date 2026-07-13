"""借用領域的推導規則:節次、器材可借數、逾期判定、場地色格。"""

from datetime import date, datetime, time, timedelta

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.semesters import TAIPEI
from app.models import EquipmentLoan, Holiday, RoomBookingRequest, RoomBookingSlot, VenueBooking
from app.models.enums import BookingStatus, LoanStatus

# 14 節次(原型 PERIODS/BK_SLOTS)
PERIODS: tuple[str, ...] = ("1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "A", "B", "C", "D")


async def equipment_available(db: AsyncSession, equipment_id: int, total_qty: int) -> int:
    """可借數 = total − 未歸還中數量(推導不儲存)。"""
    out = await db.scalar(
        sa.select(sa.func.coalesce(sa.func.sum(EquipmentLoan.qty), 0)).where(
            EquipmentLoan.equipment_id == equipment_id,
            EquipmentLoan.status == LoanStatus.CHECKED_OUT,
        )
    )
    return max(total_qty - int(out or 0), 0)


def next_workday_in(d: date, holidays: set[date]) -> date:
    """下一個上班日(跳過週末與政府行事曆假日);純函式,假日集合由呼叫端提供。"""
    cursor = d + timedelta(days=1)
    while cursor.weekday() >= 5 or cursor in holidays:
        cursor += timedelta(days=1)
    return cursor


def overdue_deadline_in(end_date: date, return_time: str, holidays: set[date]) -> datetime:
    """歸還期限:結束日之隔天上班日 HH:MM(台北時區)。"""
    workday = next_workday_in(end_date, holidays)
    hour, minute = (int(x) for x in return_time.split(":"))
    return datetime.combine(workday, time(hour, minute), tzinfo=TAIPEI)


def is_overdue_in(loan: EquipmentLoan, return_time: str, holidays: set[date]) -> bool:
    if loan.status != LoanStatus.CHECKED_OUT:
        return False
    from datetime import UTC

    return datetime.now(UTC) >= overdue_deadline_in(loan.end_date, return_time, holidays)


async def load_holidays(db: AsyncSession) -> set[date]:
    """全表撈一次(一年不過百餘筆);列表端點每請求呼叫一次,避免逐列查詢。"""
    return set(await db.scalars(sa.select(Holiday.date)))


async def next_workday(db: AsyncSession, d: date) -> date:
    return next_workday_in(d, await load_holidays(db))


async def overdue_deadline(db: AsyncSession, end_date: date, return_time: str) -> datetime:
    return overdue_deadline_in(end_date, return_time, await load_holidays(db))


async def availability_grid(
    db: AsyncSession, day: date, own_club_id: int | None
) -> dict[int, dict[str, str]]:
    """場地 × 節次 → 狀態:pending(審核中)/temp(臨時借用)/fixed(固定借用)/mine(自己)。

    只回傳被佔用/審核中的格子;其餘由前端依 venue 開放旗標補 available/closed。
    """
    grid: dict[int, dict[str, str]] = {}

    def mark(venue_id: int, period: str, status: str) -> None:
        cell = grid.setdefault(venue_id, {})
        # mine 優先顯示;已核准蓋過審核中
        rank = {"pending": 0, "temp": 1, "fixed": 1, "mine": 2}
        if period not in cell or rank[status] > rank[cell[period]]:
            cell[period] = status

    temp_rows = await db.execute(
        sa.select(VenueBooking).where(
            VenueBooking.date == day, VenueBooking.status != BookingStatus.REJECTED
        )
    )
    for booking in temp_rows.scalars():
        for period in booking.periods:
            if booking.club_id == own_club_id:
                mark(booking.venue_id, period, "mine")
            elif booking.status == BookingStatus.APPROVED:
                mark(booking.venue_id, period, "temp")
            else:
                mark(booking.venue_id, period, "pending")

    fixed_rows = await db.execute(
        sa.select(RoomBookingSlot, RoomBookingRequest)
        .join(RoomBookingRequest, RoomBookingSlot.request_id == RoomBookingRequest.id)
        .where(RoomBookingSlot.date == day, RoomBookingRequest.status != BookingStatus.REJECTED)
    )
    for slot, request in fixed_rows:
        if request.club_id == own_club_id:
            mark(request.venue_id, slot.period, "mine")
        elif request.status == BookingStatus.APPROVED:
            mark(request.venue_id, slot.period, "fixed")
        else:
            mark(request.venue_id, slot.period, "pending")

    return grid
