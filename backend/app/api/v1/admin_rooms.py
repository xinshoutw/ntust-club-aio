"""行政端:教室固定借用審核(/admin/room-bookings,權限鍵 aroom)。

固定借用=整學期每週固定時段,一單多時段(dow×節次);
衝突由管理員整單擇一核准(不做部分核准);退回必填原因;簽核走 approval_records。
"""

from typing import Annotated

import sqlalchemy as sa
from fastapi import APIRouter, BackgroundTasks, Depends, Query, Request

from app.api.pagination import Pagination, parse_sort
from app.core.deps import CurrentUser, DbDep, client_ip, require_permission, require_role
from app.core.errors import conflict, not_found
from app.models import ApprovalRecord, Club, RoomBookingRequest, RoomBookingSlot, Venue
from app.models.enums import ApprovalDecision, ApprovalSubject, BookingStatus, UserRole
from app.schemas.admin import AdminRoomBookingOut, RejectIn
from app.schemas.bookings import FixedWindowOut
from app.schemas.common import ApiResponse
from app.services import audit, notify
from app.services import booking_service as svc
from app.services.settings_service import get_setting

router = APIRouter(prefix="/admin/room-bookings", tags=["admin"])

RoomAdmin = Annotated[CurrentUser, Depends(require_permission("aroom"))]
# 開放窗查詢供側欄反灰用:一般 admin 即可讀,不綁 aroom(與社團端 /club/room-bookings/window 同形)
AnyAdmin = Annotated[CurrentUser, Depends(require_role(UserRole.ADMIN))]


@router.get("/window")
async def fixed_window(user: AnyAdmin, db: DbDep) -> ApiResponse[FixedWindowOut]:
    """固定借用開放窗狀態:未開放時行政端側欄項目反灰置底、頁面顯示未開放。"""
    window = await get_setting(db, "fixed_booking_window")
    return ApiResponse(
        data=FixedWindowOut(
            open=svc.fixed_window_open(window),
            open_from=window.get("open_from"),
            open_until=window.get("open_until"),
        )
    )

_SORTABLE = {
    "club": Club.name,
    "venue": Venue.name,
    "status": RoomBookingRequest.status,
    "created_at": RoomBookingRequest.created_at,
}


@router.get("")
async def list_room_bookings(
    user: RoomAdmin,
    db: DbDep,
    page: Pagination,
    sort: str | None = None,
    status: BookingStatus | None = None,
    club_id: int | None = Query(None),
) -> ApiResponse[list[AdminRoomBookingOut]]:
    query = (
        sa.select(RoomBookingRequest, Club.name, Venue.name)
        .join(Club, RoomBookingRequest.club_id == Club.id)
        .join(Venue, RoomBookingRequest.venue_id == Venue.id)
        .options(sa.orm.selectinload(RoomBookingRequest.slots))
    )
    if status:
        query = query.where(RoomBookingRequest.status == status)
    if club_id:
        query = query.where(RoomBookingRequest.club_id == club_id)

    if sort:
        query = query.order_by(*parse_sort(sort, _SORTABLE, None), RoomBookingRequest.id)
    else:
        # 預設:待審佇列在前(送件早在前)
        pending_first = sa.case((RoomBookingRequest.status == BookingStatus.PENDING, 0), else_=1)
        query = query.order_by(pending_first, RoomBookingRequest.id.asc())

    total = await db.scalar(sa.select(sa.func.count()).select_from(query.subquery()))
    rows = await db.execute(query.offset(page.offset).limit(page.page_size))
    data = []
    for booking, club_name, venue_name in rows:
        out = AdminRoomBookingOut.model_validate(booking)
        out.club_name = club_name
        out.venue_name = venue_name
        data.append(out)
    return ApiResponse(data=data, meta=page.meta(total or 0))


async def _pending_request(db, request_id: int) -> RoomBookingRequest:
    booking = await db.scalar(
        sa.select(RoomBookingRequest)
        .where(RoomBookingRequest.id == request_id)
        .options(sa.orm.selectinload(RoomBookingRequest.slots))
        .with_for_update(of=RoomBookingRequest)
    )
    if booking is None:
        raise not_found("找不到借用申請")
    if booking.status != BookingStatus.PENDING:
        raise conflict("此申請不在待審狀態")
    return booking


def _record_approval(db, request_id: int, decision, user, reason=None) -> None:
    db.add(
        ApprovalRecord(
            subject_type=ApprovalSubject.ROOM_BOOKING,
            subject_id=request_id,
            stage="single",  # 管理員單關(整單擇一)
            decision=decision,
            actor_id=user.id,
            reason=reason,
        )
    )


async def _notify_club(
    background: BackgroundTasks, db, club_id: int, kind: str, title: str, desc: str
) -> None:
    club = await db.get(Club, club_id)
    background.add_task(notify.club_event, kind, title, desc, club.discord_webhook_url)


@router.post("/{request_id}/approve")
async def approve_room_booking(
    request_id: int,
    user: RoomAdmin,
    db: DbDep,
    request: Request,
    background: BackgroundTasks,
) -> ApiResponse[AdminRoomBookingOut]:
    booking = await _pending_request(db, request_id)
    # 核准前確認同場地同學期沒有已核准單佔用相同(星期,節次);advisory lock 序列化並發核准
    # (整單擇一是人工判斷,但「已核准 vs 再核准」的重疊必須由系統擋下)
    await svc.lock_resource(db, "venue", booking.venue_id)
    pairs = [(s.weekday, s.period) for s in booking.slots]
    taken = await db.scalar(
        sa.select(sa.func.count())
        .select_from(RoomBookingSlot)
        .join(RoomBookingRequest, RoomBookingRequest.id == RoomBookingSlot.request_id)
        .where(
            RoomBookingRequest.venue_id == booking.venue_id,
            RoomBookingRequest.status == BookingStatus.APPROVED,
            RoomBookingRequest.start_date <= booking.end_date,
            RoomBookingRequest.end_date >= booking.start_date,
            sa.tuple_(RoomBookingSlot.weekday, RoomBookingSlot.period).in_(pairs),
        )
    )
    if taken:
        raise conflict("該場地已有已核准的固定借用佔用相同時段", code="SLOT_TAKEN")
    # 交叉檢核:整學期每週固定佔用會蓋到已核准的單日臨時借用
    if await svc.temp_days_hitting_slots(
        db, booking.venue_id, booking.start_date, booking.end_date, pairs
    ):
        raise conflict("學期內有已核准的臨時借用佔用相同時段", code="SLOT_TAKEN")
    booking.status = BookingStatus.APPROVED
    _record_approval(db, booking.id, ApprovalDecision.APPROVE, user)
    audit.record(
        db,
        action="room_booking_approved",
        user=user,
        detail=f"room_booking={booking.id}",
        ip=client_ip(request),
    )
    await db.commit()

    venue = await db.get(Venue, booking.venue_id)
    await _notify_club(
        background,
        db,
        booking.club_id,
        "approve",
        "教室固定借用已核准",
        f"{venue.name}({len(booking.slots)} 個每週時段)",
    )
    out = AdminRoomBookingOut.model_validate(booking)
    out.venue_name = venue.name
    return ApiResponse(data=out)


@router.post("/{request_id}/revoke")
async def revoke_room_booking(
    request_id: int,
    body: RejectIn,
    user: RoomAdmin,
    db: DbDep,
    request: Request,
    background: BackgroundTasks,
) -> ApiResponse[None]:
    """撤銷已核准的固定借用。

    固定借用的開始日是學期起日,學期一開始社團就取消不了、行政也沒端點撤銷,教室
    時段與該社 10 節額度整學期鎖死。狀態復用 cancelled:額度判定排除 cancelled,
    額度自動回歸,不必另寫回歸邏輯。
    """
    booking = await db.scalar(
        sa.select(RoomBookingRequest)
        .where(RoomBookingRequest.id == request_id)
        .options(sa.orm.selectinload(RoomBookingRequest.slots))
        .with_for_update(of=RoomBookingRequest)
    )
    if booking is None:
        raise not_found("找不到借用申請")
    if booking.status != BookingStatus.APPROVED:
        raise conflict("只有已核准的借用可以撤銷")
    if booking.end_date < svc.today_taipei():
        raise conflict("已結束的借用不需撤銷")
    booking.status = BookingStatus.CANCELLED
    _record_approval(db, booking.id, ApprovalDecision.REVOKE, user, body.reason)
    audit.record(
        db,
        action="room_booking_revoked",
        user=user,
        detail=f"room_booking={booking.id};reason={body.reason}",
        ip=client_ip(request),
    )
    await db.commit()

    venue = await db.get(Venue, booking.venue_id)
    await _notify_club(
        background,
        db,
        booking.club_id,
        "reject",
        "固定場地借用已撤銷",
        f"{venue.name}({len(booking.slots)} 個每週時段):{body.reason}",
    )
    return ApiResponse()


@router.post("/{request_id}/reject")
async def reject_room_booking(
    request_id: int,
    body: RejectIn,
    user: RoomAdmin,
    db: DbDep,
    request: Request,
    background: BackgroundTasks,
) -> ApiResponse[None]:
    booking = await _pending_request(db, request_id)
    booking.status = BookingStatus.REJECTED
    _record_approval(db, booking.id, ApprovalDecision.REJECT, user, body.reason)
    audit.record(
        db,
        action="room_booking_rejected",
        user=user,
        detail=f"room_booking={booking.id}",
        ip=client_ip(request),
    )
    await db.commit()

    venue = await db.get(Venue, booking.venue_id)
    await _notify_club(
        background,
        db,
        booking.club_id,
        "reject",
        "教室固定借用退回",
        f"{venue.name}:{body.reason}",
    )
    return ApiResponse()
