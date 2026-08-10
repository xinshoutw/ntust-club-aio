"""行政端:臨時場地與器材借用審核(權限鍵 abooking)+ 全校單日場況。

- 臨時場地/器材:pending → approved/rejected(退回必填原因);簽核走 approval_records
- 器材待審單附「該區間可借數(排除本單)」檢核資訊——推導不儲存,不足時前端紅字警示,
  是否核准由管理員裁量(不強制擋)
- 逾期=推導:結束日之隔天上班日 10:30(?status=overdue 以單調門檻日於 SQL 篩選)
- 場況格:審核中格帶申請 id,供點格開審核彈窗
"""

from datetime import UTC, date, datetime
from typing import Annotated, Literal

import sqlalchemy as sa
from fastapi import APIRouter, BackgroundTasks, Depends, Query, Request

from app.api.pagination import Pagination, parse_sort
from app.core.deps import CurrentUser, DbDep, client_ip, require_permission, require_super
from app.core.errors import conflict, not_found
from app.models import (
    Activity,
    ApprovalRecord,
    Club,
    Equipment,
    EquipmentLoan,
    Venue,
    VenueBooking,
)
from app.models.enums import (
    ApprovalDecision,
    ApprovalSubject,
    BookingStatus,
    LoanStatus,
)
from app.schemas.admin import AdminEquipmentLoanOut, AdminVenueBookingOut, RejectIn
from app.schemas.bookings import ManualEquipmentLoanIn, ManualVenueBookingIn, VenueOut
from app.schemas.common import ApiResponse
from app.services import audit, notify
from app.services import booking_service as svc
from app.services.settings_service import get_setting

router = APIRouter(prefix="/admin", tags=["admin"])

BookingAdmin = Annotated[CurrentUser, Depends(require_permission("abooking"))]
SuperAdmin = Annotated[CurrentUser, Depends(require_super)]

_VENUE_SORTABLE = {
    "date": VenueBooking.date,
    "club": Club.name,
    "venue": Venue.name,
    "status": VenueBooking.status,
    "created_at": VenueBooking.created_at,
}

_LOAN_SORTABLE = {
    "club": Club.name,
    "equipment": Equipment.name,
    "start_date": EquipmentLoan.start_date,
    "end_date": EquipmentLoan.end_date,
    "status": EquipmentLoan.status,
    "created_at": EquipmentLoan.created_at,
}

LoanStatusFilter = Literal["pending", "approved", "rejected", "checked_out", "returned", "overdue"]


async def _notify_club(
    background: BackgroundTasks, db, club_id: int | None, kind: str, title: str, desc: str
) -> None:
    # NULL club=行政手動借用(遷移的歷史行政借用可為 pending):無社團可通知
    if club_id is None:
        return
    club = await db.get(Club, club_id)
    if club is None:
        return
    background.add_task(notify.club_event, kind, title, desc, club.discord_webhook_url)


def _record_approval(db, subject: ApprovalSubject, subject_id: int, decision, user, reason=None):
    db.add(
        ApprovalRecord(
            subject_type=subject,
            subject_id=subject_id,
            stage="single",  # 臨時場地/器材:管理員單關
            decision=decision,
            actor_id=user.id,
            reason=reason,
        )
    )


# ---- 場地主檔(場況圖列首) ----


@router.get("/venues")
async def list_venues(user: BookingAdmin, db: DbDep) -> ApiResponse[list[VenueOut]]:
    """啟用中場地(沿用社團端 VenueOut):場況圖以 venue_id 對照列首名稱與容納人數。"""
    rows = await db.scalars(
        sa.select(Venue).where(Venue.is_active.is_(True)).order_by(Venue.sort, Venue.id)
    )
    return ApiResponse(data=[VenueOut.model_validate(v) for v in rows])


# ---- 臨時場地借用審核 ----


@router.get("/venue-bookings")
async def list_venue_bookings(
    user: BookingAdmin,
    db: DbDep,
    page: Pagination,
    sort: str | None = None,
    status: BookingStatus | None = None,
    club_id: int | None = Query(None),
) -> ApiResponse[list[AdminVenueBookingOut]]:
    query = (
        sa.select(VenueBooking, Club.name, Venue.name, Activity.name)
        .outerjoin(Club, VenueBooking.club_id == Club.id)  # NULL club=行政手動借用
        .join(Venue, VenueBooking.venue_id == Venue.id)
        .outerjoin(Activity, VenueBooking.activity_id == Activity.id)
    )
    if status:
        query = query.where(VenueBooking.status == status)
    if club_id:
        query = query.where(VenueBooking.club_id == club_id)

    if sort:
        query = query.order_by(*parse_sort(sort, _VENUE_SORTABLE, None), VenueBooking.id)
    else:
        # 預設:待審佇列在前,組內借用日升冪
        pending_first = sa.case((VenueBooking.status == BookingStatus.PENDING, 0), else_=1)
        query = query.order_by(pending_first, VenueBooking.date.asc(), VenueBooking.id)

    total = await db.scalar(sa.select(sa.func.count()).select_from(query.subquery()))
    rows = await db.execute(query.offset(page.offset).limit(page.page_size))
    data = []
    for booking, club_name, venue_name, activity_name in rows:
        club_name = club_name or "學務處"  # NULL club=行政手動借用
        out = AdminVenueBookingOut.model_validate(booking)
        out.club_name = club_name
        out.venue_name = venue_name
        out.activity_name = activity_name
        data.append(out)
    return ApiResponse(data=data, meta=page.meta(total or 0))


async def _pending_venue_booking(db, booking_id: int) -> VenueBooking:
    booking = await db.scalar(
        sa.select(VenueBooking).where(VenueBooking.id == booking_id).with_for_update()
    )
    if booking is None:
        raise not_found("找不到借用申請")
    if booking.status != BookingStatus.PENDING:
        raise conflict("此申請不在待審狀態")
    return booking


@router.post("/venue-bookings/{booking_id}/approve")
async def approve_venue_booking(
    booking_id: int,
    user: BookingAdmin,
    db: DbDep,
    request: Request,
    background: BackgroundTasks,
) -> ApiResponse[AdminVenueBookingOut]:
    booking = await _pending_venue_booking(db, booking_id)
    # 核准前確認同場地同日時段沒有已核准的借用;advisory lock 序列化並發核准
    # (兩張互相衝突的待審單各自持有自己的列鎖,擋不住彼此)
    await svc.lock_resource(db, "venue", booking.venue_id)
    taken = await db.scalar(
        sa.select(sa.func.count()).where(
            VenueBooking.venue_id == booking.venue_id,
            VenueBooking.date == booking.date,
            VenueBooking.status == BookingStatus.APPROVED,
            VenueBooking.periods.op("&&")(booking.periods),
        )
    )
    if taken:
        raise conflict("該場地時段已有已核准的借用", code="SLOT_TAKEN")
    hit = await svc.blocked_periods(db, booking.venue_id, booking.date, booking.periods)
    if hit:
        raise conflict(f"該時段不開放借用(節次 {','.join(hit)})", code="SLOT_BLOCKED")
    booking.status = BookingStatus.APPROVED
    _record_approval(
        db, ApprovalSubject.VENUE_BOOKING, booking.id, ApprovalDecision.APPROVE, user
    )
    audit.record(
        db,
        action="venue_booking_approved",
        user=user,
        detail=f"venue_booking={booking.id}",
        ip=client_ip(request),
    )
    await db.commit()

    venue = await db.get(Venue, booking.venue_id)
    await _notify_club(
        background,
        db,
        booking.club_id,
        "approve",
        "臨時場地借用已核准",
        f"{venue.name}({booking.date} 節次 {','.join(booking.periods)})",
    )
    out = AdminVenueBookingOut.model_validate(booking)
    out.venue_name = venue.name
    return ApiResponse(data=out)


@router.post("/venue-bookings/{booking_id}/reject")
async def reject_venue_booking(
    booking_id: int,
    body: RejectIn,
    user: BookingAdmin,
    db: DbDep,
    request: Request,
    background: BackgroundTasks,
) -> ApiResponse[None]:
    booking = await _pending_venue_booking(db, booking_id)
    booking.status = BookingStatus.REJECTED
    _record_approval(
        db, ApprovalSubject.VENUE_BOOKING, booking.id, ApprovalDecision.REJECT, user, body.reason
    )
    audit.record(
        db,
        action="venue_booking_rejected",
        user=user,
        detail=f"venue_booking={booking.id}",
        ip=client_ip(request),
    )
    await db.commit()

    venue = await db.get(Venue, booking.venue_id)
    await _notify_club(
        background,
        db,
        booking.club_id,
        "reject",
        "臨時場地借用退回",
        f"{venue.name}({booking.date}):{body.reason}",
    )
    return ApiResponse()


# ---- 器材借用審核(含逾期列表) ----


@router.get("/equipment-loans")
async def list_equipment_loans(
    user: BookingAdmin,
    db: DbDep,
    page: Pagination,
    sort: str | None = None,
    status: LoanStatusFilter | None = None,
    club_id: int | None = Query(None),
) -> ApiResponse[list[AdminEquipmentLoanOut]]:
    """status=overdue:逾期=checked_out 且過了結束日之隔天上班日 10:30(推導不儲存)。"""
    return_time = await get_setting(db, "equipment_return_time")
    holidays = await svc.load_holidays(db)

    query = (
        sa.select(EquipmentLoan, Club.name, Equipment.name, Equipment.total_qty, Activity.name)
        .outerjoin(Club, EquipmentLoan.club_id == Club.id)  # NULL club=行政手動借用
        .join(Equipment, EquipmentLoan.equipment_id == Equipment.id)
        .outerjoin(Activity, EquipmentLoan.activity_id == Activity.id)
    )
    if status == "overdue":
        threshold = svc.overdue_threshold_in(datetime.now(UTC), return_time, holidays)
        query = query.where(
            EquipmentLoan.status == LoanStatus.CHECKED_OUT,
            EquipmentLoan.end_date <= threshold,
        )
    elif status:
        query = query.where(EquipmentLoan.status == LoanStatus(status))
    if club_id:
        query = query.where(EquipmentLoan.club_id == club_id)

    if sort:
        query = query.order_by(*parse_sort(sort, _LOAN_SORTABLE, None), EquipmentLoan.id)
    elif status == "overdue":
        # 逾期追蹤:逾越最久(結束日最早)在前
        query = query.order_by(EquipmentLoan.end_date.asc(), EquipmentLoan.id)
    else:
        # 預設:待審佇列在前,組內借用起日升冪
        pending_first = sa.case((EquipmentLoan.status == LoanStatus.PENDING, 0), else_=1)
        query = query.order_by(pending_first, EquipmentLoan.start_date.asc(), EquipmentLoan.id)

    total = await db.scalar(sa.select(sa.func.count()).select_from(query.subquery()))
    rows = await db.execute(query.offset(page.offset).limit(page.page_size))
    data = []
    for loan, club_name, equipment_name, total_qty, activity_name in rows:
        club_name = club_name or "學務處"  # NULL club=行政手動借用
        out = AdminEquipmentLoanOut.model_validate(loan)
        out.club_name = club_name
        out.equipment_name = equipment_name
        out.activity_name = activity_name
        out.overdue = svc.is_overdue_in(loan, return_time, holidays)
        if loan.status == LoanStatus.PENDING:
            # 審核檢核:該區間可借數(排除本單);推導不儲存
            out.available_excluding_self = await svc.equipment_available_in_window(
                db, loan.equipment_id, total_qty, loan.start_date, loan.end_date,
                exclude_loan_id=loan.id,
            )
        data.append(out)
    return ApiResponse(data=data, meta=page.meta(total or 0))


async def _pending_loan(db, loan_id: int) -> EquipmentLoan:
    loan = await db.scalar(
        sa.select(EquipmentLoan).where(EquipmentLoan.id == loan_id).with_for_update()
    )
    if loan is None:
        raise not_found("找不到借用申請")
    if loan.status != LoanStatus.PENDING:
        raise conflict("此申請不在待審狀態")
    return loan


@router.post("/equipment-loans/{loan_id}/approve")
async def approve_equipment_loan(
    loan_id: int,
    user: BookingAdmin,
    db: DbDep,
    request: Request,
    background: BackgroundTasks,
) -> ApiResponse[AdminEquipmentLoanOut]:
    loan = await _pending_loan(db, loan_id)
    equipment = await db.get(Equipment, loan.equipment_id)
    # 可借數不足仍可核准:屬管理員裁量,列表以紅字警示。
    # 是否改為硬性檢核尚未拍板,勿逕行加擋
    loan.status = LoanStatus.APPROVED
    _record_approval(db, ApprovalSubject.EQUIPMENT_LOAN, loan.id, ApprovalDecision.APPROVE, user)
    audit.record(
        db,
        action="equipment_loan_approved",
        user=user,
        detail=f"equipment_loan={loan.id}",
        ip=client_ip(request),
    )
    await db.commit()

    await _notify_club(
        background,
        db,
        loan.club_id,
        "approve",
        "器材借用已核准",
        f"{equipment.name} ×{loan.qty}({loan.start_date}~{loan.end_date})",
    )
    out = AdminEquipmentLoanOut.model_validate(loan)
    out.equipment_name = equipment.name
    return ApiResponse(data=out)


@router.post("/equipment-loans/{loan_id}/reject")
async def reject_equipment_loan(
    loan_id: int,
    body: RejectIn,
    user: BookingAdmin,
    db: DbDep,
    request: Request,
    background: BackgroundTasks,
) -> ApiResponse[None]:
    loan = await _pending_loan(db, loan_id)
    loan.status = LoanStatus.REJECTED
    _record_approval(
        db, ApprovalSubject.EQUIPMENT_LOAN, loan.id, ApprovalDecision.REJECT, user, body.reason
    )
    audit.record(
        db,
        action="equipment_loan_rejected",
        user=user,
        detail=f"equipment_loan={loan.id}",
        ip=client_ip(request),
    )
    await db.commit()

    equipment = await db.get(Equipment, loan.equipment_id)
    await _notify_club(
        background,
        db,
        loan.club_id,
        "reject",
        "器材借用退回",
        f"{equipment.name} ×{loan.qty}:{body.reason}",
    )
    return ApiResponse()


# ---- 全校單日場況 ----


@router.get("/bookings/availability")
async def availability(user: BookingAdmin, db: DbDep, date: date) -> ApiResponse[dict]:
    """全校單日場況格;審核中格帶臨時借用申請 id,供點格開審核彈窗。"""
    grid = await svc.admin_availability_grid(db, date)
    return ApiResponse(data={"date": date.isoformat(), "grid": grid})


# ---- 最高權限手動借用:club NULL=行政,顯示「學務處」 ----
# 刻意不擋過去日期(社團端申請已全面禁止):補登歷史資料是本功能的用途之一,
# 舊系統遷移後的資料補正也靠這裡回填


@router.post("/bookings/manual-venue", status_code=201)
async def manual_venue_booking(
    body: ManualVenueBookingIn, user: SuperAdmin, db: DbDep, request: Request
) -> ApiResponse[AdminVenueBookingOut]:
    venue = await db.get(Venue, body.venue_id)
    if venue is None or not venue.is_active:
        raise not_found("找不到場地")
    # 與核准端同鎖同檢核;行政借用不受不開放規則限制(封鎖常配合行政徵用)、
    # 器材端亦不受單次可借上限限制(super override)
    await svc.lock_resource(db, "venue", venue.id)
    taken = await db.scalar(
        sa.select(sa.func.count()).where(
            VenueBooking.venue_id == venue.id,
            VenueBooking.date == body.date,
            VenueBooking.status == BookingStatus.APPROVED,
            VenueBooking.periods.op("&&")(body.periods),
        )
    )
    if taken:
        raise conflict("該場地時段已有已核准的借用", code="SLOT_TAKEN")
    row = VenueBooking(
        club_id=None,
        venue_id=venue.id,
        activity_id=None,
        date=body.date,
        periods=body.periods,
        purpose=body.purpose,
        phone=body.phone,
        status=BookingStatus.APPROVED,
    )
    db.add(row)
    audit.record(
        db,
        action="manual_venue_booking_created",
        user=user,
        detail=f"{venue.name} {body.date} 節次 {','.join(body.periods)}",
        ip=client_ip(request),
    )
    await db.commit()
    out = AdminVenueBookingOut.model_validate(row)
    out.club_name = "學務處"
    out.venue_name = venue.name
    return ApiResponse(data=out)


@router.post("/bookings/manual-equipment", status_code=201)
async def manual_equipment_loan(
    body: ManualEquipmentLoanIn, user: SuperAdmin, db: DbDep, request: Request
) -> ApiResponse[AdminEquipmentLoanOut]:
    equipment = await db.get(Equipment, body.equipment_id)
    if equipment is None or not equipment.is_active:
        raise not_found("找不到器材")
    await svc.lock_resource(db, "equipment", equipment.id)
    available = await svc.equipment_available_in_window(
        db, equipment.id, equipment.total_qty, body.start_date, body.end_date
    )
    if body.qty > available:
        raise conflict(f"借用區間內可借數量不足(目前可借 {available})")
    loan = EquipmentLoan(
        club_id=None,
        equipment_id=equipment.id,
        activity_id=None,
        qty=body.qty,
        start_date=body.start_date,
        end_date=body.end_date,
        purpose=body.purpose,
        phone=body.phone,
        status=LoanStatus.APPROVED,
    )
    db.add(loan)
    audit.record(
        db,
        action="manual_equipment_loan_created",
        user=user,
        detail=f"{equipment.name} ×{body.qty}({body.start_date}~{body.end_date})",
        ip=client_ip(request),
    )
    await db.commit()
    out = AdminEquipmentLoanOut.model_validate(loan)
    out.club_name = "學務處"
    out.equipment_name = equipment.name
    return ApiResponse(data=out)
