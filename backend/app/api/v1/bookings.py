"""社團端:空間與器材借用(固定教室/臨時場地/器材)+ 借用總覽色格圖。

2026-07-15 規則:
- 固定借用=整學期每週固定時段(星期×節次);僅開放窗受理;每社至多 10 節;
  晚間時段(第 10 節及 A–D 節)至少連續 3 節
- 臨時借用/器材借用綁定審核通過活動;器材借用區間由活動起訖 ± 工作天緩衝推導
"""

from datetime import date, datetime

import sqlalchemy as sa
from fastapi import APIRouter, BackgroundTasks, Query, Request

from app.api.pagination import Pagination
from app.core.deps import ClubUser, DbDep, client_ip
from app.core.errors import conflict, forbidden, not_found, validation_error
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
from app.models.enums import ActivityStatus, BookingStatus, LoanStatus
from app.schemas.bookings import (
    ClubFixedWindowOut,
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
from app.services import activity_service, audit, notify
from app.services import booking_service as svc
from app.services.settings_service import get_setting

router = APIRouter(prefix="/club", tags=["bookings"])


async def _notify_submit(background: BackgroundTasks, db, user, title: str, desc: str) -> None:
    club = await db.get(Club, user.club_id)
    background.add_task(notify.club_event, "submit", title, desc, club.discord_webhook_url)


async def _ensure_not_suspended(db, user) -> None:
    """停權中的社團不得申請借用(器材逾期停權管理的執行點)。"""
    club = await db.get(Club, user.club_id)
    today_tw = svc.today_taipei()
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


def _require_not_ended(activity: Activity, what: str) -> None:
    """已結束的活動不得再借。

    「借用須綁審核通過活動」若不看時間就形同虛設:帶一個去年辦完的活動 id
    就能預約未來任何時段。前端下拉雖已濾掉,但那只是 UI。
    """
    if activity_service.end_datetime(activity) < svc.now_utc():
        raise validation_error(f"所選活動已結束,無法申請{what}")


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
    # 可借數一次算完:逐列查詢時往返次數等於器材數
    available = await svc.equipment_available_map(db, {eq.id: eq.total_qty for eq in rows}, window)
    out = []
    for eq in rows:
        item = EquipmentOut.model_validate(eq)
        item.available = available[eq.id]
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


# ---- 固定場地借用 ----


async def _used_fixed_periods(db, club_id: int, sem_start) -> int:
    """該社在目標學期已佔用的固定借用節數(審核中+已核准;退回/取消不算)。"""
    return (
        await db.scalar(
            sa.select(sa.func.count())
            .select_from(RoomBookingSlot)
            .join(RoomBookingRequest, RoomBookingSlot.request_id == RoomBookingRequest.id)
            .where(
                RoomBookingRequest.club_id == club_id,
                RoomBookingRequest.status.notin_(
                    [BookingStatus.REJECTED, BookingStatus.CANCELLED]
                ),
                RoomBookingRequest.start_date == sem_start,
            )
        )
        or 0
    )


@router.get("/room-bookings/window")
async def fixed_window(user: ClubUser, db: DbDep) -> ApiResponse[ClubFixedWindowOut]:
    """開放窗狀態:系統設定的日期區間(open_from/open_until),期間外不受理。"""
    window = await get_setting(db, "fixed_booking_window")
    sem_start, _ = next_semester_range(datetime.now(TAIPEI).date())
    return ApiResponse(
        data=ClubFixedWindowOut(
            open=svc.fixed_window_open(window),
            open_from=window.get("open_from"),
            open_until=window.get("open_until"),
            used_periods=await _used_fixed_periods(db, user.club_id, sem_start),
            max_periods=svc.MAX_FIXED_SLOTS,
        )
    )


@router.get("/room-bookings")
async def list_room_bookings(
    user: ClubUser, db: DbDep, page: Pagination, active: bool | None = None
) -> ApiResponse[list[RoomBookingOut]]:
    # active=true 僅回「正在借用」(審核中或學期未結束的已核准);false 僅回其餘
    query = (
        sa.select(RoomBookingRequest, Venue.name)
        .join(Venue, RoomBookingRequest.venue_id == Venue.id)
        .where(RoomBookingRequest.club_id == user.club_id)
        .options(sa.orm.selectinload(RoomBookingRequest.slots))
    )
    if active is not None:
        ongoing = sa.and_(
            RoomBookingRequest.status.in_([BookingStatus.PENDING, BookingStatus.APPROVED]),
            RoomBookingRequest.end_date >= svc.today_taipei(),
        )
        query = query.where(ongoing if active else sa.not_(ongoing))
    if active:
        # 正在借用:開始日早的在前(即將到來優先;同日依建立序穩定分頁)
        query = query.order_by(RoomBookingRequest.start_date.asc(), RoomBookingRequest.id.asc())
    else:
        query = query.order_by(RoomBookingRequest.id.desc())
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

    # 申請自動歸屬「下一學期」,起訖快照存入申請單
    sem_start, sem_end = next_semester_range(datetime.now(TAIPEI).date())

    # 每社至多 10 節/學期:同目標學期的未退回申請(審核中+已核准)合計。
    # 先鎖住這個社團的額度,兩張並發送出的申請才不會各自通過同一份合計
    await svc.lock_resource(db, "club", user.club_id)
    used_count = await _used_fixed_periods(db, user.club_id, sem_start)
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
        "固定場地借用申請",
        f"{user.name}:{venue.name}({len(body.slots)} 個每週時段)",
    )
    out = RoomBookingOut.model_validate(row)
    out.venue_name = venue.name
    return ApiResponse(data=out)


# ---- 臨時場地借用 ----


@router.get("/venue-bookings")
async def list_venue_bookings(
    user: ClubUser, db: DbDep, page: Pagination, active: bool | None = None
) -> ApiResponse[list[VenueBookingOut]]:
    # active=true=「正在申請」:審核中或已核准,且申請起始時刻(最早節次起點)未到;
    # 起始時刻一過即移到「最近申請」(active=false 為其補集)
    query = (
        sa.select(VenueBooking, Venue.name, Activity.name)
        .join(Venue, VenueBooking.venue_id == Venue.id)
        .outerjoin(Activity, VenueBooking.activity_id == Activity.id)
        .where(VenueBooking.club_id == user.club_id)
    )
    if active is not None:
        ongoing = sa.and_(
            VenueBooking.status.in_([BookingStatus.PENDING, BookingStatus.APPROVED]),
            sa.not_(svc.venue_booking_started_expr()),
        )
        query = query.where(ongoing if active else sa.not_(ongoing))
    if active:
        # 正在申請:借用日早的在前(即將到來優先)
        query = query.order_by(VenueBooking.date.asc(), VenueBooking.id.asc())
    else:
        # 借用日新到舊(同日再依建立序);log 型清單「新的在上」以借用日為準
        query = query.order_by(VenueBooking.date.desc(), VenueBooking.id.desc())
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
    _require_not_ended(activity, "場地借用")

    # 過去時間全面禁止:過去日期直接擋;
    # 今天則以節次時刻表擋「最早節次已開始」的申請
    if body.date < svc.today_taipei():
        raise validation_error("借用日期不得早於今天")
    if svc.booking_started(body.date, body.periods):
        raise validation_error("所選時段已開始,請選擇尚未開始的時段")

    # 場地不開放規則:申請時即擋,核准端亦驗(與社團無關,放在鎖外)
    hit = await svc.blocked_periods(db, venue.id, body.date, body.periods)
    if hit:
        raise validation_error(f"所選時段不開放借用(時段 {','.join(hit)})")

    # 同社同場地同日「節次重疊」才算重複(不同社的衝突由審核關把關)。
    # 節次不重疊的兩張單是兩件事:上午擺攤、晚上彩排本來就該各送一張。
    # 先鎖住這個社團:守門是先查再寫,雙擊送出的第二筆會查不到第一筆
    await svc.lock_resource(db, "club", user.club_id)
    dup = await db.scalar(
        sa.select(VenueBooking.id).where(
            VenueBooking.club_id == user.club_id,
            VenueBooking.venue_id == venue.id,
            VenueBooking.date == body.date,
            VenueBooking.periods.overlap(body.periods),
            VenueBooking.status.notin_([BookingStatus.REJECTED, BookingStatus.CANCELLED]),
        )
    )
    if dup:
        raise conflict("同一場地同一天的相同節次已有申請")

    row = VenueBooking(
        club_id=user.club_id,
        venue_id=venue.id,
        activity_id=activity.id,
        date=body.date,
        periods=body.periods,
        purpose=body.purpose,
        phone=body.phone,
    )
    db.add(row)
    audit.record(db, action="venue_booking_submitted", user=user, ip=client_ip(request))
    await db.commit()
    await _notify_submit(
        background,
        db,
        user,
        "臨時場地借用申請",
        f"{user.name}:{venue.name}({body.date} 時段 {','.join(body.periods)})",
    )
    out = VenueBookingOut.model_validate(row)
    out.venue_name = venue.name
    out.activity_name = activity.name
    return ApiResponse(data=out)


# ---- 器材借用 ----


@router.get("/equipment-loans")
async def list_equipment_loans(
    user: ClubUser,
    db: DbDep,
    page: Pagination,
    active: bool | None = None,
    status: LoanStatus | None = None,
) -> ApiResponse[list[EquipmentLoanOut]]:
    # active=true=審核中/已核准/借出中;false=其餘;status=精確過濾(已歸還分頁用)
    query = (
        sa.select(EquipmentLoan, Equipment.name, Activity.name)
        .join(Equipment, EquipmentLoan.equipment_id == Equipment.id)
        .outerjoin(Activity, EquipmentLoan.activity_id == Activity.id)
        .where(EquipmentLoan.club_id == user.club_id)
    )
    if active is not None:
        ongoing = EquipmentLoan.status.in_(
            [LoanStatus.PENDING, LoanStatus.APPROVED, LoanStatus.CHECKED_OUT]
        )
        query = query.where(ongoing if active else sa.not_(ongoing))
    if status is not None:
        query = query.where(EquipmentLoan.status == status)
    if active and status is None:
        # 正在借用:起始日早的在前(即將到來優先)
        query = query.order_by(EquipmentLoan.start_date.asc(), EquipmentLoan.id.asc())
    else:
        # 借用起始日新到舊(同日再依建立序)
        query = query.order_by(EquipmentLoan.start_date.desc(), EquipmentLoan.id.desc())
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
    # 單次可借上限(NULL=不限)
    if equipment.max_lease_count is not None and body.qty > equipment.max_lease_count:
        raise validation_error(f"{equipment.name} 單次至多借用 {equipment.max_lease_count} 件")
    activity = await _approved_activity(db, user, body.activity_id)
    _require_not_ended(activity, "器材借用")

    # 借用區間=活動起訖 ± 工作天緩衝(申請當下推導後寫入,設定調整不回溯)
    buffer = await get_setting(db, "equipment_workday_buffer")
    holidays = await svc.load_holidays(db)
    start, end = svc.loan_window(activity, buffer, holidays)
    if end < svc.today_taipei():
        raise validation_error("推導的借用區間已過去,無法申請")

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
        phone=body.phone,
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


# ---- 取消(審核中或已核准未開始者可取消) ----


def _ensure_cancellable(status: object, pending: object, approved: object, start: date) -> None:
    """固定/器材(日粒度):審核中隨時可取消;已核准需尚未開始(開始日在今天之後)。"""
    if status == pending:
        return
    if status == approved:
        if start > svc.today_taipei():
            return
        raise conflict("已開始或已結束的借用無法取消")
    raise conflict("此狀態的申請無法取消")


def _ensure_venue_cancellable(row: VenueBooking) -> None:
    """臨時場地(節次粒度):審核中與已核准一致,申請起始時刻(最早節次起點)前可取消。

    起始時刻一過即不可取消——與 active 過濾同一條分界,「正在申請」表內必有取消入口。
    """
    if row.status not in (BookingStatus.PENDING, BookingStatus.APPROVED):
        raise conflict("此狀態的申請無法取消")
    if svc.booking_started(row.date, row.periods):
        raise conflict("已開始或已結束的借用無法取消")


@router.post("/venue-bookings/{booking_id}/cancel")
async def cancel_venue_booking(
    booking_id: int, user: ClubUser, db: DbDep, request: Request
) -> ApiResponse[None]:
    row = await db.scalar(
        sa.select(VenueBooking)
        .where(VenueBooking.id == booking_id, VenueBooking.club_id == user.club_id)
        .with_for_update()
    )
    if row is None:
        raise not_found("找不到借用申請")
    _ensure_venue_cancellable(row)
    row.status = BookingStatus.CANCELLED
    audit.record(
        db,
        action="venue_booking_cancelled",
        user=user,
        detail=f"venue_booking={row.id}",
        ip=client_ip(request),
    )
    await db.commit()
    return ApiResponse()


@router.post("/room-bookings/{booking_id}/cancel")
async def cancel_room_booking(
    booking_id: int, user: ClubUser, db: DbDep, request: Request
) -> ApiResponse[None]:
    row = await db.scalar(
        sa.select(RoomBookingRequest)
        .where(RoomBookingRequest.id == booking_id, RoomBookingRequest.club_id == user.club_id)
        .with_for_update()
    )
    if row is None:
        raise not_found("找不到借用申請")
    _ensure_cancellable(
        row.status, BookingStatus.PENDING, BookingStatus.APPROVED, row.start_date
    )
    row.status = BookingStatus.CANCELLED
    audit.record(
        db,
        action="room_booking_cancelled",
        user=user,
        detail=f"room_booking={row.id}",
        ip=client_ip(request),
    )
    await db.commit()
    return ApiResponse()


@router.post("/equipment-loans/{loan_id}/cancel")
async def cancel_equipment_loan(
    loan_id: int, user: ClubUser, db: DbDep, request: Request
) -> ApiResponse[None]:
    row = await db.scalar(
        sa.select(EquipmentLoan)
        .where(EquipmentLoan.id == loan_id, EquipmentLoan.club_id == user.club_id)
        .with_for_update()
    )
    if row is None:
        raise not_found("找不到借用申請")
    _ensure_cancellable(row.status, LoanStatus.PENDING, LoanStatus.APPROVED, row.start_date)
    row.status = LoanStatus.CANCELLED
    audit.record(
        db,
        action="equipment_loan_cancelled",
        user=user,
        detail=f"equipment_loan={row.id}",
        ip=client_ip(request),
    )
    await db.commit()
    return ApiResponse()
