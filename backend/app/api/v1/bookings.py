"""社團端:空間與器材借用(固定教室/臨時場地/器材)+ 借用總覽色格圖。"""

from datetime import UTC, date, datetime

import sqlalchemy as sa
from fastapi import APIRouter, BackgroundTasks, Request

from app.api.pagination import Pagination
from app.core.deps import ClubUser, DbDep, client_ip
from app.core.errors import conflict, forbidden, validation_error
from app.core.semesters import TAIPEI
from app.models import (
    Club,
    Equipment,
    EquipmentLoan,
    RoomBookingRequest,
    RoomBookingSlot,
    Venue,
    VenueBooking,
)
from app.models.enums import BookingStatus
from app.schemas.bookings import (
    EquipmentLoanIn,
    EquipmentLoanOut,
    EquipmentOut,
    RoomBookingIn,
    RoomBookingOut,
    VenueBookingIn,
    VenueBookingOut,
    VenueOut,
)
from app.schemas.common import ApiResponse
from app.services import audit, notify
from app.services import booking_service as svc
from app.services.settings_service import get_setting

router = APIRouter(prefix="/club", tags=["bookings"])


async def _notify_submit(background: BackgroundTasks, db, user, title: str, desc: str) -> None:
    club = await db.get(Club, user.club_id)
    background.add_task(notify.club_event, "submit", title, desc, club.discord_webhook_url)


async def _ensure_not_suspended(db, user) -> None:
    """停權中的社團不得申請借用(器材逾期停權管理的執行點)。"""
    club = await db.get(Club, user.club_id)
    today_tw = datetime.now(UTC).astimezone(TAIPEI).date()
    if club.suspended_until and club.suspended_until >= today_tw:
        raise forbidden(
            f"社團停權中(至 {club.suspended_until}),暫停借用申請", code="CLUB_SUSPENDED"
        )


# ---- 主檔 ----


@router.get("/venues")
async def list_venues(user: ClubUser, db: DbDep) -> ApiResponse[list[VenueOut]]:
    rows = await db.scalars(
        sa.select(Venue).where(Venue.is_active.is_(True)).order_by(Venue.sort, Venue.id)
    )
    return ApiResponse(data=[VenueOut.model_validate(v) for v in rows])


@router.get("/equipment")
async def list_equipment(user: ClubUser, db: DbDep) -> ApiResponse[list[EquipmentOut]]:
    rows = (
        await db.scalars(
            sa.select(Equipment)
            .where(Equipment.is_active.is_(True))
            .order_by(Equipment.sort, Equipment.id)
        )
    ).all()
    out = []
    for eq in rows:
        item = EquipmentOut.model_validate(eq)
        item.available = await svc.equipment_available(db, eq.id, eq.total_qty)
        out.append(item)
    return ApiResponse(data=out)


# ---- 借用總覽色格 ----


@router.get("/bookings/availability")
async def availability(user: ClubUser, db: DbDep, date: date) -> ApiResponse[dict]:
    grid = await svc.availability_grid(db, date, user.club_id)
    return ApiResponse(data={"date": date.isoformat(), "grid": grid})


# ---- 教室固定借用 ----


@router.get("/room-bookings")
async def list_room_bookings(
    user: ClubUser, db: DbDep, page: Pagination
) -> ApiResponse[list[RoomBookingOut]]:
    query = (
        sa.select(RoomBookingRequest, Venue.name)
        .join(Venue, RoomBookingRequest.venue_id == Venue.id)
        .where(RoomBookingRequest.club_id == user.club_id)
        .options(sa.orm.selectinload(RoomBookingRequest.slots))
        .order_by(RoomBookingRequest.id.desc())
    )
    total = await db.scalar(sa.select(sa.func.count()).select_from(query.subquery()))
    rows = await db.execute(query.offset(page.offset).limit(page.page_size))
    data = []
    for request_row, venue_name in rows:
        out = RoomBookingOut.model_validate(request_row)
        out.venue_name = venue_name
        data.append(out)
    return ApiResponse(data=data, meta=page.meta(total or 0))


@router.post("/room-bookings", status_code=201)
async def create_room_booking(
    body: RoomBookingIn,
    user: ClubUser,
    db: DbDep,
    request: Request,
    background: BackgroundTasks,
) -> ApiResponse[RoomBookingOut]:
    await _ensure_not_suspended(db, user)
    venue = await db.get(Venue, body.venue_id)
    if venue is None or not venue.is_active or not venue.allow_fixed:
        raise validation_error("該場地不開放固定借用")

    row = RoomBookingRequest(club_id=user.club_id, venue_id=venue.id, purpose=body.purpose)
    row.slots = [RoomBookingSlot(date=s.date, period=s.period) for s in body.slots]
    db.add(row)
    audit.record(db, action="room_booking_submitted", user=user, ip=client_ip(request))
    await db.commit()
    await _notify_submit(
        background,
        db,
        user,
        "教室固定借用申請",
        f"{user.name}:{venue.name}({len(body.slots)} 個時段)",
    )
    out = RoomBookingOut.model_validate(row)
    out.venue_name = venue.name
    return ApiResponse(data=out)


# ---- 臨時場地借用 ----


@router.get("/venue-bookings")
async def list_venue_bookings(
    user: ClubUser, db: DbDep, page: Pagination
) -> ApiResponse[list[VenueBookingOut]]:
    query = (
        sa.select(VenueBooking, Venue.name)
        .join(Venue, VenueBooking.venue_id == Venue.id)
        .where(VenueBooking.club_id == user.club_id)
        .order_by(VenueBooking.id.desc())
    )
    total = await db.scalar(sa.select(sa.func.count()).select_from(query.subquery()))
    rows = await db.execute(query.offset(page.offset).limit(page.page_size))
    data = []
    for booking, venue_name in rows:
        out = VenueBookingOut.model_validate(booking)
        out.venue_name = venue_name
        data.append(out)
    return ApiResponse(data=data, meta=page.meta(total or 0))


@router.post("/venue-bookings", status_code=201)
async def create_venue_booking(
    body: VenueBookingIn,
    user: ClubUser,
    db: DbDep,
    request: Request,
    background: BackgroundTasks,
) -> ApiResponse[VenueBookingOut]:
    await _ensure_not_suspended(db, user)
    venue = await db.get(Venue, body.venue_id)
    if venue is None or not venue.is_active or not venue.allow_temp:
        raise validation_error("該場地不開放臨時借用")

    # 同社同場地同日重複申請直接擋(不同社的衝突由審核關把關)
    dup = await db.scalar(
        sa.select(VenueBooking.id).where(
            VenueBooking.club_id == user.club_id,
            VenueBooking.venue_id == venue.id,
            VenueBooking.date == body.date,
            VenueBooking.status != BookingStatus.REJECTED,
        )
    )
    if dup:
        raise conflict("同一場地同一天已有申請")

    row = VenueBooking(
        club_id=user.club_id,
        venue_id=venue.id,
        date=body.date,
        periods=body.periods,
        purpose=body.purpose,
    )
    db.add(row)
    audit.record(db, action="venue_booking_submitted", user=user, ip=client_ip(request))
    await db.commit()
    await _notify_submit(
        background,
        db,
        user,
        "臨時場地借用申請",
        f"{user.name}:{venue.name}({body.date} 節次 {','.join(body.periods)})",
    )
    out = VenueBookingOut.model_validate(row)
    out.venue_name = venue.name
    return ApiResponse(data=out)


# ---- 器材借用 ----


@router.get("/equipment-loans")
async def list_equipment_loans(
    user: ClubUser, db: DbDep, page: Pagination
) -> ApiResponse[list[EquipmentLoanOut]]:
    query = (
        sa.select(EquipmentLoan, Equipment.name)
        .join(Equipment, EquipmentLoan.equipment_id == Equipment.id)
        .where(EquipmentLoan.club_id == user.club_id)
        .order_by(EquipmentLoan.id.desc())
    )
    total = await db.scalar(sa.select(sa.func.count()).select_from(query.subquery()))
    rows = await db.execute(query.offset(page.offset).limit(page.page_size))
    return_time = await get_setting(db, "equipment_return_time")
    holidays = await svc.load_holidays(db)
    data = []
    for loan, equipment_name in rows:
        out = EquipmentLoanOut.model_validate(loan)
        out.equipment_name = equipment_name
        out.overdue = svc.is_overdue_in(loan, return_time, holidays)
        data.append(out)
    return ApiResponse(data=data, meta=page.meta(total or 0))


@router.post("/equipment-loans", status_code=201)
async def create_equipment_loan(
    body: EquipmentLoanIn,
    user: ClubUser,
    db: DbDep,
    request: Request,
    background: BackgroundTasks,
) -> ApiResponse[EquipmentLoanOut]:
    await _ensure_not_suspended(db, user)
    equipment = await db.get(Equipment, body.equipment_id)
    if equipment is None or not equipment.is_active:
        raise validation_error("找不到該器材")
    available = await svc.equipment_available(db, equipment.id, equipment.total_qty)
    if body.qty > available:
        raise conflict(f"可借數量不足(目前可借 {available})")

    loan = EquipmentLoan(
        club_id=user.club_id,
        equipment_id=equipment.id,
        qty=body.qty,
        start_date=body.start_date,
        end_date=body.end_date,
        purpose=body.purpose,
    )
    db.add(loan)
    audit.record(db, action="equipment_loan_submitted", user=user, ip=client_ip(request))
    await db.commit()
    await _notify_submit(
        background,
        db,
        user,
        "器材借用申請",
        f"{user.name}:{equipment.name} ×{body.qty}({body.start_date}~{body.end_date})",
    )
    out = EquipmentLoanOut.model_validate(loan)
    out.equipment_name = equipment.name
    return ApiResponse(data=out)
