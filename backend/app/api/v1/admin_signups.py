"""行政端:報名簽到登錄(2026-07-15 定案)。

活動結束後由管理員於報名管理登錄簽到;評鑑僅採計簽到,僅報名不計分。
- 場次制活動(如負責人會議):逐場登錄(session_id 必填)
- 非場次制活動(如幹訓):免帶 session_id,自動建立/沿用單一預設場次
簽到寫入 session_attendance,行政分 ad7/ad8 由此即時彙算。
"""

from datetime import UTC, datetime
from typing import Annotated

import sqlalchemy as sa
from fastapi import APIRouter, Depends, Request

from app.core.deps import CurrentUser, DbDep, client_ip, require_permission
from app.core.errors import conflict, not_found, validation_error
from app.core.semesters import TAIPEI, semester_of
from app.models import SessionAttendance, Signup, SignupItem, SignupItemSession
from app.schemas.admin import AttendanceIn
from app.schemas.common import ApiResponse
from app.services import audit

router = APIRouter(prefix="/admin/signup-items", tags=["admin"])

RegAdmin = Annotated[CurrentUser, Depends(require_permission("areg"))]


async def _default_session(db, item: SignupItem) -> SignupItemSession:
    """非場次制活動的簽到落點:單一預設場次(get or create)。"""
    session = await db.scalar(
        sa.select(SignupItemSession)
        .where(SignupItemSession.item_id == item.id)
        .order_by(SignupItemSession.id)
        .limit(1)
    )
    if session is not None:
        return session
    day = item.event_date or datetime.now(UTC).astimezone(TAIPEI).date()
    session = SignupItemSession(
        item_id=item.id, name=item.name, date=day, semester=semester_of(day)
    )
    db.add(session)
    await db.flush()
    return session


@router.put("/{item_id}/attendance")
async def mark_attendance(
    item_id: int,
    body: AttendanceIn,
    user: RegAdmin,
    db: DbDep,
    request: Request,
) -> ApiResponse[dict]:
    item = await db.get(SignupItem, item_id)
    if item is None:
        raise not_found("找不到報名活動")

    # 僅報名的社團才有簽到可登錄(評鑑僅採計簽到,報名是前提)
    signed = await db.scalar(
        sa.select(Signup.id).where(Signup.item_id == item.id, Signup.club_id == body.club_id)
    )
    if signed is None:
        raise conflict("該社團未報名此活動,無法登錄簽到")

    if body.session_id is not None:
        session = await db.get(SignupItemSession, body.session_id)
        if session is None or session.item_id != item.id:
            raise not_found("找不到場次")
    elif item.session_based:
        raise validation_error("場次制活動必須指定場次")
    else:
        # 非場次制:自動建立/沿用單一預設場次
        session = await _default_session(db, item)

    # 活動結束後登錄:場次日期(或活動日)未到不受理
    today = datetime.now(UTC).astimezone(TAIPEI).date()
    if session.date > today:
        raise conflict("活動尚未結束,不可登錄簽到")

    row = await db.scalar(
        sa.select(SessionAttendance).where(
            SessionAttendance.session_id == session.id,
            SessionAttendance.club_id == body.club_id,
        )
    )
    now = datetime.now(UTC)
    if row is None:
        db.add(
            SessionAttendance(
                session_id=session.id,
                club_id=body.club_id,
                attended=body.attended,
                marked_by=user.id,
                marked_at=now,
            )
        )
    else:
        row.attended = body.attended
        row.marked_by = user.id
        row.marked_at = now

    audit.record(
        db,
        action="signup_attendance_marked",
        user=user,
        detail=f"item={item.id};session={session.id};club={body.club_id};attended={body.attended}",
        ip=client_ip(request),
    )
    await db.commit()

    attended_total = (
        await db.scalar(
            sa.select(sa.func.count())
            .select_from(SessionAttendance)
            .join(SignupItemSession, SessionAttendance.session_id == SignupItemSession.id)
            .where(
                SignupItemSession.item_id == item.id,
                SessionAttendance.club_id == body.club_id,
                SessionAttendance.attended.is_(True),
            )
        )
    ) or 0
    return ApiResponse(data={"session_id": session.id, "attended_sessions": attended_total})
