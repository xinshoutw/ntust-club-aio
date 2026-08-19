"""行政端:報名管理與簽到登錄。

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
from fastapi import APIRouter, BackgroundTasks, Depends, Query, Request

from app.api.pagination import Pagination
from app.core.deps import CurrentUser, DbDep, client_ip, require_permission
from app.core.errors import conflict, not_found, validation_error
from app.core.semesters import TAIPEI, semester_of
from app.models import (
    Award,
    Club,
    SessionAttendance,
    Signup,
    SignupAward,
    SignupEntry,
    SignupItem,
    SignupItemSession,
)
from app.models.enums import SignupKind
from app.schemas.admin import AttendanceIn, SessionAttendanceOut, SessionIn, SessionOut
from app.schemas.common import ApiResponse
from app.schemas.signups import (
    AdminSignupItemOut,
    EntryOut,
    ManualRegistrationIn,
    RegistrationOut,
    SignupItemCreateIn,
    SignupItemUpdateIn,
)
from app.services import audit, notify
from app.services import booking_service as booking_svc  # advisory lock 工具在此
from app.services import signup_service as svc

router = APIRouter(prefix="/admin/signup-items", tags=["admin"])

RegAdmin = Annotated[CurrentUser, Depends(require_permission("asignup"))]


async def _default_session(db, item: SignupItem) -> SignupItemSession:
    """非場次制活動的簽到落點:單一預設場次(get or create)。

    先取該活動的 advisory lock:兩支簽到登錄並發時,查無場次→建立之間會彼此穿插,
    各建一列預設場次,之後的簽到就散在兩個場次上(評鑑採計的是簽到,數字會少一半)。
    """
    await booking_svc.lock_resource(db, "signup_item", item.id)
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


async def _item_out(db, item: SignupItem) -> AdminSignupItemOut:
    """單活動輸出:統計欄位要算出來,不能讓 schema 的預設 0 冒充「沒有人報名」。"""
    out = AdminSignupItemOut.model_validate(item)
    out.accepting = svc.window_open(item)
    clubs, pending = (
        await db.execute(
            sa.select(sa.func.count(), sa.func.count().filter(Signup.confirmed.is_(False)))
            .select_from(Signup)
            .where(Signup.item_id == item.id)
        )
    ).one()
    out.clubs_count, out.pending_count = int(clubs), int(pending)
    out.people_count = int(
        await db.scalar(
            sa.select(sa.func.count())
            .select_from(SignupEntry)
            .join(Signup, SignupEntry.signup_id == Signup.id)
            .where(Signup.item_id == item.id)
        )
        or 0
    )
    return out


# ---- 報名活動建立與列表 ----


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
    return ApiResponse(data=await _item_out(db, item))


@router.patch("/{item_id}")
async def update_item(
    item_id: int,
    body: SignupItemUpdateIn,
    user: RegAdmin,
    db: DbDep,
    request: Request,
) -> ApiResponse[AdminSignupItemOut]:
    """修改已建立的報名活動(decisions.md D-09)。

    **不發通知**:打錯字改回來、把地點寫清楚,每改一次推一則只會淹掉頻道。
    截止時間可改,但只能改到現在或未來 —— 往回改等於用系統時鐘偽造「當時就截止了」。
    名額上限可以往下調:已報名的名單不受影響(每社人數上限只在社團送出那一刻檢核),
    畫面顯示的是實際人數,不是上限。
    """
    item = await db.scalar(
        sa.select(SignupItem).where(SignupItem.id == item_id).with_for_update()
    )
    if item is None:
        raise not_found("找不到報名活動")
    changes = body.model_dump(exclude_unset=True)

    now = datetime.now(UTC)
    signup_end = changes.get("signup_end", item.signup_end)
    if "signup_end" in changes and signup_end < now:
        raise validation_error("報名截止只能改到現在或未來")
    signup_start = changes.get("signup_start", item.signup_start)
    if signup_start is not None and signup_end is not None and signup_end <= signup_start:
        raise validation_error("報名截止須晚於報名開始")

    if "fields" in changes:
        # 已經有人報名之後就不動欄位:既有回答是以現行 key 存的,改名或刪欄
        # 會讓那些答案在管理彈窗與匯出裡憑空消失,而畫面上看不出來
        registered = await db.scalar(
            sa.select(sa.func.count()).select_from(Signup).where(Signup.item_id == item.id)
        )
        if registered:
            raise conflict("已有社團報名,不可再修改表單欄位", code="SIGNUP_FIELDS_LOCKED")
        try:
            changes["fields"] = svc.normalize_fields([f.model_dump() for f in body.fields or []])
        except ValueError as exc:
            raise validation_error(str(exc)) from None

    for field, value in changes.items():
        setattr(item, field, value)
    audit.record(
        db,
        action="signup_item_updated",
        user=user,
        detail=f"item={item.id};fields={','.join(sorted(changes))}",
        ip=client_ip(request),
    )
    await db.commit()
    await db.refresh(item)
    return ApiResponse(data=await _item_out(db, item))


@router.get("")
async def list_items(
    user: RegAdmin,
    db: DbDep,
    page: Pagination,
    accepting: bool | None = Query(None),
) -> ApiResponse[list[AdminSignupItemOut]]:
    """報名管理總表:各活動已報名社團數/人數、待確認數。

    accepting 篩「報名窗開著的活動」(判定與 `svc.window_open` 同源)。
    """
    query = sa.select(SignupItem).order_by(SignupItem.id.desc())
    if accepting is not None:
        window = svc.window_open_sql()
        query = query.where(window if accepting else sa.not_(window))
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

    awards: dict[int, list[str]] = {}
    if item.is_eval:
        award_rows = await db.execute(
            sa.select(SignupAward.signup_id, Award.name)
            .join(Award, Award.id == SignupAward.award_id)
            .where(SignupAward.signup_id.in_([s.id for s in signups] or [0]))
            .order_by(Award.sort, Award.id)
        )
        for signup_id, name in award_rows:
            awards.setdefault(signup_id, []).append(name)

    data = [
        RegistrationOut(
            club_id=s.club_id,
            club_name=club_names.get(s.club_id, ""),
            count=len(s.entries),
            confirmed=s.confirmed,
            created_at=s.created_at,
            attended_sessions=attended.get(s.club_id, 0),
            entries=[EntryOut.model_validate(e) for e in s.entries],
            awards=awards.get(s.id, []),
        )
        for s in signups
    ]
    return ApiResponse(data=data)


@router.post("/{item_id}/registrations", status_code=201)
async def add_registration(
    item_id: int,
    body: ManualRegistrationIn,
    user: RegAdmin,
    db: DbDep,
    request: Request,
    background: BackgroundTasks,
) -> ApiResponse[None]:
    """補登一個沒有線上報名的社團(decisions.md DEC-07)。

    簽到硬性要求先有 `signups` 列,所以實際到場卻沒報名的社團原本登錄不了,
    行政分就少算一場。補登的單直接視為已確認(承辦本人在現場點的名),
    參加人名單留空 —— 系統確實不知道來的是誰,不編造。
    """
    item = await db.get(SignupItem, item_id)
    if item is None:
        raise not_found("找不到報名活動")
    club = await db.get(Club, body.club_id)
    if club is None:
        raise not_found("找不到社團")
    # 併發補登與社團自己送出報名會撞唯一鍵;先鎖住這個活動再判定
    await booking_svc.lock_resource(db, "signup_item", item.id)
    existing = await db.scalar(
        sa.select(Signup).where(Signup.item_id == item.id, Signup.club_id == club.id)
    )
    if existing is not None:
        raise conflict("該社團已在報名名單中")

    db.add(Signup(item_id=item.id, club_id=club.id, confirmed=True))
    audit.record(
        db,
        action="signup_added_by_admin",
        user=user,
        detail=f"item={item.id};club={club.id}",
        ip=client_ip(request),
    )
    await db.commit()
    # 社團會在「我的報名」看到一筆自己沒送過的紀錄:不說一聲的話,
    # 從它的角度像是自己報過名而名單不見了
    background.add_task(
        notify.club_event,
        "announce",
        "學務處已為貴社補登報名",
        f"{club.name}:{item.name}(現場到場,參加人名單從缺)",
        club.discord_webhook_url,
    )
    return ApiResponse()


@router.delete("/{item_id}/registrations/{club_id}")
async def remove_registration(
    item_id: int,
    club_id: int,
    user: RegAdmin,
    db: DbDep,
    request: Request,
    background: BackgroundTasks,
) -> ApiResponse[None]:
    """撤掉一筆補登(decisions.md DEC-07)。

    補登只有 POST 的話,下拉選錯一個社團按下去就再也回不去:那筆報名永久留在名單上,
    而該社團自己想報名會被「一經報名不得更改」擋掉、想存草稿也被擋 ——
    誤按一次等於讓一個社團永久報不了這個活動。

    只撤得掉補登的單:有參加人名單的是社團自己送的(要退就走社團端),
    已經登錄過簽到的也不動(那是行政分的資料源)。
    """
    item = await db.get(SignupItem, item_id)
    if item is None:
        raise not_found("找不到報名活動")
    signup = await db.scalar(
        sa.select(Signup)
        .where(Signup.item_id == item.id, Signup.club_id == club_id)
        .options(sa.orm.selectinload(Signup.entries))
        .with_for_update(of=Signup)
    )
    if signup is None:
        raise not_found("該社團不在報名名單中")
    if signup.entries:
        raise conflict("這是社團自己送出的報名,不可由行政端移除")
    attended = await db.scalar(
        sa.select(sa.func.count())
        .select_from(SessionAttendance)
        .join(SignupItemSession, SessionAttendance.session_id == SignupItemSession.id)
        .where(SignupItemSession.item_id == item.id, SessionAttendance.club_id == club_id)
    )
    if attended:
        raise conflict("已登錄過簽到,請先取消簽到再移除")

    await db.delete(signup)
    audit.record(
        db,
        action="signup_removed_by_admin",
        user=user,
        detail=f"item={item.id};club={club_id}",
        ip=client_ip(request),
    )
    await db.commit()
    # 補登通知過一次(K10),撤除是同一件事的反面 —— 名單這次是真的不見了
    club = await db.get(Club, club_id)
    background.add_task(
        notify.club_event,
        "alert",
        "學務處已撤除貴社的補登報名",
        f"{club.name}:{item.name}",
        club.discord_webhook_url,
    )
    return ApiResponse()


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
    # 鎖住這張報名單再判定:兩次點擊都讀到未確認的話,兩邊都會推一則 Discord
    signup = await db.scalar(
        sa.select(Signup)
        .where(Signup.item_id == item.id, Signup.club_id == club_id)
        .with_for_update()
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


# ---- 簽到登錄 ----


# ---- 場次(負責人會議逐場簽到) ----


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
    item_id: int,
    session_id: int,
    user: RegAdmin,
    db: DbDep,
    request: Request,
    background: BackgroundTasks,
) -> ApiResponse[None]:
    session = await db.get(SignupItemSession, session_id)
    if session is None or session.item_id != item_id:
        raise not_found("找不到場次")
    # 這一場所有社團的簽到會一起消失(FK CASCADE),而簽到是行政分 ad7 的唯一資料源
    wiped = await db.scalar(
        sa.select(sa.func.count())
        .select_from(SessionAttendance)
        .where(SessionAttendance.session_id == session.id, SessionAttendance.attended.is_(True))
    )
    item = await db.get(SignupItem, item_id)
    session_name = session.name
    await db.delete(session)  # session_attendance 隨 FK CASCADE 一併刪除
    audit.record(
        db,
        action="signup_session_deleted",
        user=user,
        detail=f"item={item_id} session={session_id}",
        ip=client_ip(request),
    )
    await db.commit()
    background.add_task(
        notify.discord,
        "alert",
        "報名場次已刪除",
        f"{item.name}:{session_name}(連帶清掉 {wiped or 0} 筆簽到)",
    )
    return ApiResponse()


@router.put("/{item_id}/attendance")
async def mark_attendance(
    item_id: int,
    body: AttendanceIn,
    user: RegAdmin,
    db: DbDep,
    request: Request,
    background: BackgroundTasks,
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
    was_attended = bool(row and row.attended)
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
    # 簽到是行政分 ad7/ad8 的唯一資料源:社團要知道自己這一場被登錄了(GAP-18 K5)。
    # 只在真的翻面時推:同值再送一次不是事件(與公告蓋板同一條規則)
    if body.attended != was_attended:
        club = await db.get(Club, body.club_id)
        # 非場次制的預設場次名就是活動名,別把同一個名字印兩次
        where = "" if session.name == item.name else f"({session.name})"
        background.add_task(
            notify.club_event,
            "approve" if body.attended else "alert",
            "報名簽到已登錄" if body.attended else "報名簽到已取消",
            f"{club.name}:{item.name}{where}",
            club.discord_webhook_url,
        )
    return ApiResponse(data={"session_id": session.id, "attended_sessions": attended_total})
