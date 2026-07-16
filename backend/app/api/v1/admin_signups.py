"""行政端:報名管理(2026-07-16 第八輪)+ 簽到登錄(2026-07-15 定案)。

- 建立報名活動(自訂表單欄位含順序)、列表(已報名社團數/人數、待確認數)
- 審核制活動:報名後待確認,管理員確認(confirm)後才算報名成功
- 簽到:活動結束後登錄;評鑑僅採計簽到,僅報名不計分
  - 場次制活動(如負責人會議):逐場登錄(session_id 必填)
  - 非場次制活動(如幹訓):免帶 session_id,自動建立/沿用單一預設場次
簽到寫入 session_attendance,行政分 ad7/ad8 由此即時彙算。
"""

from datetime import UTC, datetime
from typing import Annotated

import sqlalchemy as sa
from fastapi import APIRouter, BackgroundTasks, Depends, Request

from app.api.pagination import Pagination
from app.core.deps import CurrentUser, DbDep, client_ip, require_permission
from app.core.errors import conflict, not_found, validation_error
from app.core.semesters import TAIPEI, semester_of
from app.models import Club, SessionAttendance, Signup, SignupEntry, SignupItem, SignupItemSession
from app.models.enums import SignupKind
from app.schemas.admin import AttendanceIn, SessionAttendanceOut, SessionIn, SessionOut
from app.schemas.common import ApiResponse
from app.schemas.signups import (
    AdminSignupItemOut,
    EntryOut,
    RegistrationOut,
    SignupItemCreateIn,
)
from app.services import audit, notify
from app.services import signup_service as svc

router = APIRouter(prefix="/admin/signup-items", tags=["admin"])

# areg=既有後端鍵、asignup=前端權限彈窗鍵(尚未統一,任一即通過)
RegAdmin = Annotated[CurrentUser, Depends(require_permission("areg", "asignup"))]


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
    day = (
        item.event_at.astimezone(TAIPEI).date()
        if item.event_at
        else datetime.now(UTC).astimezone(TAIPEI).date()
    )
    session = SignupItemSession(
        item_id=item.id, name=item.name, date=day, semester=semester_of(day)
    )
    db.add(session)
    await db.flush()
    return session


# ---- 報名活動建立與列表(2026-07-16 第八輪) ----


@router.post("", status_code=201)
async def create_item(
    body: SignupItemCreateIn,
    user: RegAdmin,
    db: DbDep,
    request: Request,
) -> ApiResponse[AdminSignupItemOut]:
    try:
        fields = svc.normalize_fields([f.model_dump() for f in body.fields])
    except ValueError as exc:
        raise validation_error(str(exc)) from None

    item = SignupItem(
        name=body.name,
        kind=body.kind,
        place=body.place,
        description=body.description,
        event_at=body.event_at,
        signup_start=body.signup_start or datetime.now(UTC),
        signup_end=body.signup_end,
        max_participants=body.max_participants,
        requires_confirmation=body.requires_confirmation,
        is_eval=body.is_eval,
        is_open=body.is_open,
        session_based=body.kind == SignupKind.LEADER_MEETING,  # 負責人會議=場次制
        fields=fields,
        created_by=user.id,
    )
    db.add(item)
    audit.record(
        db,
        action="signup_item_created",
        user=user,
        detail=f"name={body.name[:50]};kind={body.kind};capacity={body.max_participants}",
        ip=client_ip(request),
    )
    await db.commit()
    await db.refresh(item)
    out = AdminSignupItemOut.model_validate(item)
    out.accepting = svc.window_open(item)
    return ApiResponse(data=out)


@router.get("")
async def list_items(
    user: RegAdmin, db: DbDep, page: Pagination
) -> ApiResponse[list[AdminSignupItemOut]]:
    """報名管理總表:各活動已報名社團數/人數、待確認數。"""
    query = sa.select(SignupItem).order_by(SignupItem.id.desc())
    total = await db.scalar(sa.select(sa.func.count()).select_from(query.subquery()))
    items = (await db.scalars(query.offset(page.offset).limit(page.page_size))).all()
    ids = [i.id for i in items]

    stats: dict[int, list[int]] = {i: [0, 0] for i in ids}  # item_id → [社團數, 待確認數]
    people: dict[int, int] = dict.fromkeys(ids, 0)
    if ids:
        rows = await db.execute(
            sa.select(
                Signup.item_id,
                sa.func.count(),
                sa.func.count().filter(Signup.confirmed.is_(False)),
            )
            .where(Signup.item_id.in_(ids))
            .group_by(Signup.item_id)
        )
        for item_id, clubs, pending in rows:
            stats[item_id] = [int(clubs), int(pending)]
        entry_rows = await db.execute(
            sa.select(Signup.item_id, sa.func.count())
            .select_from(SignupEntry)
            .join(Signup, SignupEntry.signup_id == Signup.id)
            .where(Signup.item_id.in_(ids))
            .group_by(Signup.item_id)
        )
        for item_id, count in entry_rows:
            people[item_id] = int(count)

    data = []
    for item in items:
        out = AdminSignupItemOut.model_validate(item)
        out.accepting = svc.window_open(item)
        out.clubs_count, out.pending_count = stats[item.id]
        out.people_count = people[item.id]
        data.append(out)
    return ApiResponse(data=data, meta=page.meta(total or 0))


@router.get("/{item_id}/registrations")
async def list_registrations(
    item_id: int, user: RegAdmin, db: DbDep
) -> ApiResponse[list[RegistrationOut]]:
    """單活動管理彈窗:報名社團名單(人數、確認狀態、已簽到場次)。"""
    item = await db.get(SignupItem, item_id)
    if item is None:
        raise not_found("找不到報名活動")

    signups = (
        await db.scalars(
            sa.select(Signup)
            .where(Signup.item_id == item.id)
            .options(sa.orm.selectinload(Signup.entries))
            .order_by(Signup.id)
        )
    ).all()
    club_names = {
        cid: name
        for cid, name in await db.execute(
            sa.select(Club.id, Club.name).where(Club.id.in_([s.club_id for s in signups] or [0]))
        )
    }
    attended: dict[int, int] = {}
    rows = await db.execute(
        sa.select(SessionAttendance.club_id, sa.func.count())
        .join(SignupItemSession, SessionAttendance.session_id == SignupItemSession.id)
        .where(SignupItemSession.item_id == item.id, SessionAttendance.attended.is_(True))
        .group_by(SessionAttendance.club_id)
    )
    for club_id, count in rows:
        attended[club_id] = int(count)

    data = [
        RegistrationOut(
            club_id=s.club_id,
            club_name=club_names.get(s.club_id, ""),
            count=len(s.entries),
            confirmed=s.confirmed,
            created_at=s.created_at,
            attended_sessions=attended.get(s.club_id, 0),
            entries=[EntryOut.model_validate(e) for e in s.entries],
        )
        for s in signups
    ]
    return ApiResponse(data=data)


@router.put("/{item_id}/registrations/{club_id}/confirm")
async def confirm_registration(
    item_id: int,
    club_id: int,
    user: RegAdmin,
    db: DbDep,
    request: Request,
    background: BackgroundTasks,
) -> ApiResponse[None]:
    """審核制活動的報名確認:確認後才算報名成功。"""
    item = await db.get(SignupItem, item_id)
    if item is None:
        raise not_found("找不到報名活動")
    signup = await db.scalar(
        sa.select(Signup).where(Signup.item_id == item.id, Signup.club_id == club_id)
    )
    if signup is None:
        raise not_found("該社團未報名此活動")
    if signup.confirmed:
        raise conflict("此報名已確認")

    signup.confirmed = True
    audit.record(
        db,
        action="signup_confirmed",
        user=user,
        detail=f"item={item.id};club={club_id}",
        ip=client_ip(request),
    )
    await db.commit()

    club = await db.get(Club, club_id)
    background.add_task(
        notify.club_event,
        "approve",
        "報名已確認",
        f"{club.name}:{item.name}",
        club.discord_webhook_url,
    )
    return ApiResponse()


# ---- 簽到登錄(2026-07-15 定案) ----


# ---- 場次(負責人會議逐場簽到;2026-07-16 第九輪) ----


@router.get("/{item_id}/sessions")
async def list_sessions(item_id: int, user: RegAdmin, db: DbDep) -> ApiResponse[list[SessionOut]]:
    item = await db.get(SignupItem, item_id)
    if item is None:
        raise not_found("找不到報名活動")
    sessions = (
        await db.scalars(
            sa.select(SignupItemSession)
            .where(SignupItemSession.item_id == item.id)
            .order_by(SignupItemSession.date, SignupItemSession.id)
        )
    ).all()
    rows = (
        await db.scalars(
            sa.select(SessionAttendance).where(
                SessionAttendance.session_id.in_([x.id for x in sessions] or [0])
            )
        )
    ).all()
    by_session: dict[int, list[SessionAttendanceOut]] = {}
    for row in rows:
        by_session.setdefault(row.session_id, []).append(
            SessionAttendanceOut(club_id=row.club_id, attended=row.attended)
        )
    data = []
    for x in sessions:
        out = SessionOut.model_validate(x)
        out.attendance = by_session.get(x.id, [])
        data.append(out)
    return ApiResponse(data=data)


@router.post("/{item_id}/sessions", status_code=201)
async def create_session(
    item_id: int, body: SessionIn, user: RegAdmin, db: DbDep, request: Request
) -> ApiResponse[SessionOut]:
    item = await db.get(SignupItem, item_id)
    if item is None:
        raise not_found("找不到報名活動")
    if not item.session_based:
        raise conflict("非場次制活動不需建立場次")
    session = SignupItemSession(
        item_id=item.id, name=body.name, date=body.date, semester=semester_of(body.date)
    )
    db.add(session)
    audit.record(
        db,
        action="signup_session_created",
        user=user,
        detail=f"item={item.id} {body.name} {body.date}",
        ip=client_ip(request),
    )
    await db.commit()
    await db.refresh(session)
    return ApiResponse(data=SessionOut.model_validate(session))


@router.delete("/{item_id}/sessions/{session_id}")
async def delete_session(
    item_id: int, session_id: int, user: RegAdmin, db: DbDep, request: Request
) -> ApiResponse[None]:
    session = await db.get(SignupItemSession, session_id)
    if session is None or session.item_id != item_id:
        raise not_found("找不到場次")
    await db.delete(session)  # session_attendance 隨 FK CASCADE 一併刪除
    audit.record(
        db,
        action="signup_session_deleted",
        user=user,
        detail=f"item={item_id} session={session_id}",
        ip=client_ip(request),
    )
    await db.commit()
    return ApiResponse()


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
        sa.select(Signup).where(Signup.item_id == item.id, Signup.club_id == body.club_id)
    )
    if signed is None:
        raise conflict("該社團未報名此活動,無法登錄簽到")
    if item.requires_confirmation and not signed.confirmed:
        raise conflict("該社團報名尚未確認,請先確認報名")

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
