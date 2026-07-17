"""社團端:空間與器材借用(固定教室/臨時場地/器材)+ 借用總覽色格圖。

2026-07-15 規則:
- 固定借用=整學期每週固定時段(星期×節次);僅開放窗受理;每社至多 10 節;
  晚間時段(第 10 節及 A–D 節)至少連續 3 節
- 臨時借用/器材借用綁定審核通過活動;器材借用區間由活動起訖 ± 工作天緩衝推導
"""

from datetime import UTC, date, datetime

import sqlalchemy as sa
from fastapi import APIRouter, BackgroundTasks, Query, Request

from app.api.pagination import Pagination
from app.core.deps import ClubUser, DbDep, client_ip
from app.core.errors import conflict, forbidden, validation_error
from app.core.semesters import TAIPEI, next_semester_range
from app.models import (
    Activity,
    Club,
    Equipment,
    EquipmentLoan,
    RoomBookingRequest,
    RoomBookingSlot,
    Venue,
    VenueBooking,
)
from app.models.enums import ActivityStatus, BookingStatus
from app.schemas.bookings import (
    EquipmentLoanIn,
    EquipmentLoanOut,
    EquipmentOut,
    FixedWindowOut,
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


async def _approved_activity(db, user, activity_id: int) -> Activity:
    """借用綁定的活動:必須是本社團且審核通過。"""
    activity = await db.scalar(
        sa.select(Activity).where(Activity.id == activity_id, Activity.club_id == user.club_id)
    )
    if activity is None:
        raise validation_error("找不到借用活動")
    if activity.status != ActivityStatus.APPROVED:
        raise validation_error("借用僅限綁定審核通過的活動")
    return activity


# ---- 主檔 ----


@router.get("/venues")
async def list_venues(user: ClubUser, db: DbDep) -> ApiResponse[list[VenueOut]]:
    rows = await db.scalars(
        sa.select(Venue).where(Venue.is_active.is_(True)).order_by(Venue.sort, Venue.id)
    )
    return ApiResponse(data=[VenueOut.model_validate(v) for v in rows])


@router.get("/equipment")
async def list_equipment(
    user: ClubUser, db: DbDep, activity_id: int | None = Query(None)
) -> ApiResponse[list[EquipmentOut]]:
    """器材主檔+可借數。

    - 帶 activity_id(限本社審核通過活動):可借數依該活動推導的借用區間動態計算
      (總數 − 區間重疊之未歸還且未退回借用量);meta 回推導區間
    - 未帶:回「目前借出中」推導的粗略值
    """
    window: tuple[date, date] | None = None
    if activity_id is not None:
        activity = await _approved_activity(db, user, activity_id)
        buffer = await get_setting(db, "equipment_workday_buffer")
        holidays = await svc.load_holidays(db)
        window = svc.loan_window(activity, buffer, holidays)

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
        if window is not None:
            item.available = await svc.equipment_available_in_window(
                db, eq.id, eq.total_qty, window[0], window[1]
            )
        else:
            item.available = await svc.equipment_available(db, eq.id, eq.total_qty)
        out.append(item)
    meta = None
    if window is not None:
        meta = {"loan_start": window[0].isoformat(), "loan_end": window[1].isoformat()}
    return ApiResponse(data=out, meta=meta)


# ---- 借用總覽色格 ----


@router.get("/bookings/availability")
async def availability(user: ClubUser, db: DbDep, date: date) -> ApiResponse[dict]:
    grid = await svc.availability_grid(db, date, user.club_id)
    return ApiResponse(data={"date": date.isoformat(), "grid": grid})


MAX_AVAILABILITY_SPAN_DAYS = 31  # 單一場地 15 天檢視用;上限防範圍濫用


@router.get("/bookings/availability-range")
async def availability_range(
    user: ClubUser, db: DbDep, start: date, end: date, venue: int | None = None
) -> ApiResponse[dict]:
    """區間逐日場況(單一場地多天檢視):取代前端逐日並行請求。

    venue 給定時 SQL 端即縮小到該場地(15 天檢視本就單場地,不必撈全校)。
    """
    if end < start:
        raise validation_error("結束日期不得早於開始日期")
    if (end - start).days + 1 > MAX_AVAILABILITY_SPAN_DAYS:
        raise validation_error(f"查詢區間最多 {MAX_AVAILABILITY_SPAN_DAYS} 天")
    grids = await svc.availability_grids(db, start, end, user.club_id, venue_id=venue)
    return ApiResponse(
        data={"days": [{"date": d.isoformat(), "grid": g} for d, g in grids.items()]}
    )


# ---- 教室固定借用 ----


@router.get("/room-bookings/window")
async def fixed_window(user: ClubUser, db: DbDep) -> ApiResponse[FixedWindowOut]:
    """開放窗狀態:系統設定的日期區間(open_from/open_until),期間外不受理。"""
    window = await get_setting(db, "fixed_booking_window")
    return ApiResponse(
        data=FixedWindowOut(
            open=svc.fixed_window_open(window),
            open_from=window.get("open_from"),
            open_until=window.get("open_until"),
        )
    )


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

    window = await get_setting(db, "fixed_booking_window")
    if not svc.fixed_window_open(window):
        raise conflict("目前未開放固定場地借用申請", code="WINDOW_CLOSED")

    venue = await db.get(Venue, body.venue_id)
    if venue is None or not venue.is_active or not venue.allow_fixed:
        raise validation_error("該場地不開放固定借用")

    # 晚間時段規則:同一星期內含第 10 節或 A–D 節的連續區段需 ≥3 節
    by_weekday: dict[int, list[str]] = {}
    for slot in body.slots:
        by_weekday.setdefault(slot.weekday, []).append(slot.period)
    for weekday, periods in sorted(by_weekday.items()):
        error = svc.late_rule_error(periods)
        if error:
            raise validation_error(f"週{'一二三四五六日'[weekday - 1]}:{error}")

    # 申請自動歸屬「下一學期」(2026-07-17 拍板),起訖快照存入申請單
    sem_start, sem_end = next_semester_range(datetime.now(TAIPEI).date())

    # 每社至多 10 節/學期:同目標學期的未退回申請(審核中+已核准)合計
    used_count = (
        await db.scalar(
            sa.select(sa.func.count())
            .select_from(RoomBookingSlot)
            .join(RoomBookingRequest, RoomBookingSlot.request_id == RoomBookingRequest.id)
            .where(
                RoomBookingRequest.club_id == user.club_id,
                RoomBookingRequest.status != BookingStatus.REJECTED,
                RoomBookingRequest.start_date == sem_start,
            )
        )
        or 0
    )
    if used_count + len(body.slots) > svc.MAX_FIXED_SLOTS:
        raise conflict(
            f"每社團固定借用至多 {svc.MAX_FIXED_SLOTS} 節"
            f"(本學期已佔 {used_count} 節)",
            code="SLOT_LIMIT",
        )

    row = RoomBookingRequest(
        club_id=user.club_id,
        venue_id=venue.id,
        purpose=body.purpose,
        start_date=sem_start,
        end_date=sem_end,
    )
    row.slots = [RoomBookingSlot(weekday=s.weekday, period=s.period) for s in body.slots]
    db.add(row)
    audit.record(db, action="room_booking_submitted", user=user, ip=client_ip(request))
    await db.commit()
    await _notify_submit(
        background,
        db,
        user,
        "教室固定借用申請",
        f"{user.name}:{venue.name}({len(body.slots)} 個每週時段)",
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
        sa.select(VenueBooking, Venue.name, Activity.name)
        .join(Venue, VenueBooking.venue_id == Venue.id)
        .outerjoin(Activity, VenueBooking.activity_id == Activity.id)
        .where(VenueBooking.club_id == user.club_id)
        # 借用日新到舊(同日再依建立序);log 型清單「新的在上」以借用日為準
        .order_by(VenueBooking.date.desc(), VenueBooking.id.desc())
    )
    total = await db.scalar(sa.select(sa.func.count()).select_from(query.subquery()))
    rows = await db.execute(query.offset(page.offset).limit(page.page_size))
    data = []
    for booking, venue_name, activity_name in rows:
        out = VenueBookingOut.model_validate(booking)
        out.venue_name = venue_name
        out.activity_name = activity_name
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
    activity = await _approved_activity(db, user, body.activity_id)

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
        activity_id=activity.id,
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
    out.activity_name = activity.name
    return ApiResponse(data=out)


# ---- 器材借用 ----


@router.get("/equipment-loans")
async def list_equipment_loans(
    user: ClubUser, db: DbDep, page: Pagination
) -> ApiResponse[list[EquipmentLoanOut]]:
    query = (
        sa.select(EquipmentLoan, Equipment.name, Activity.name)
        .join(Equipment, EquipmentLoan.equipment_id == Equipment.id)
        .outerjoin(Activity, EquipmentLoan.activity_id == Activity.id)
        .where(EquipmentLoan.club_id == user.club_id)
        # 借用起始日新到舊(同日再依建立序)
        .order_by(EquipmentLoan.start_date.desc(), EquipmentLoan.id.desc())
    )
    total = await db.scalar(sa.select(sa.func.count()).select_from(query.subquery()))
    rows = await db.execute(query.offset(page.offset).limit(page.page_size))
    return_time = await get_setting(db, "equipment_return_time")
    holidays = await svc.load_holidays(db)
    data = []
    for loan, equipment_name, activity_name in rows:
        out = EquipmentLoanOut.model_validate(loan)
        out.equipment_name = equipment_name
        out.activity_name = activity_name
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
    activity = await _approved_activity(db, user, body.activity_id)

    # 借用區間=活動起訖 ± 工作天緩衝(申請當下推導後寫入,設定調整不回溯)
    buffer = await get_setting(db, "equipment_workday_buffer")
    holidays = await svc.load_holidays(db)
    start, end = svc.loan_window(activity, buffer, holidays)

    # 以器材為鍵序列化檢核與寫入:兩筆並發申請不會同時以同一份佔用量通過檢核
    await svc.lock_resource(db, "equipment", equipment.id)
    available = await svc.equipment_available_in_window(
        db, equipment.id, equipment.total_qty, start, end
    )
    if body.qty > available:
        raise conflict(f"借用區間內可借數量不足(目前可借 {available})")

    loan = EquipmentLoan(
        club_id=user.club_id,
        equipment_id=equipment.id,
        activity_id=activity.id,
        qty=body.qty,
        start_date=start,
        end_date=end,
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
        f"{user.name}:{equipment.name} ×{body.qty}({start}~{end},活動:{activity.name})",
    )
    out = EquipmentLoanOut.model_validate(loan)
    out.equipment_name = equipment.name
    out.activity_name = activity.name
    return ApiResponse(data=out)
