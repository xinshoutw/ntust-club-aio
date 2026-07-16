"""行政端:教室固定借用審核(/admin/room-bookings,權限鍵 aroom)。

固定借用=整學期每週固定時段,一單多時段(dow×節次);
衝突由管理員整單擇一核准(不做部分核准);退回必填原因;簽核走 approval_records。
"""

from typing import Annotated

import sqlalchemy as sa
from fastapi import APIRouter, BackgroundTasks, Depends, Query, Request

from app.api.pagination import Pagination, parse_sort
from app.core.deps import CurrentUser, DbDep, client_ip, require_permission
from app.core.errors import conflict, not_found
from app.models import ApprovalRecord, Club, RoomBookingRequest, Venue
from app.models.enums import ApprovalDecision, ApprovalSubject, BookingStatus
from app.schemas.admin import AdminRoomBookingOut, RejectIn
from app.schemas.common import ApiResponse
from app.services import audit, notify

router = APIRouter(prefix="/admin/room-bookings", tags=["admin"])

RoomAdmin = Annotated[CurrentUser, Depends(require_permission("aroom"))]

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
