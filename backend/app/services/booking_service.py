"""借用領域的推導規則:節次、固定借用規則、器材可借數與借用區間、逾期判定、場地色格。"""

from collections.abc import Sequence
from datetime import UTC, date, datetime, time, timedelta

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.semesters import TAIPEI, next_semester_range
from app.models import (
    Activity,
    Club,
    EquipmentLoan,
    Holiday,
    RoomBookingRequest,
    RoomBookingSlot,
    VenueBlockRule,
    VenueBooking,
)
from app.models.enums import BookingStatus, LoanStatus

# 14 節次(原型 PERIODS/BK_SLOTS)
PERIODS: tuple[str, ...] = ("1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "A", "B", "C", "D")

# 節次起訖時刻(權威來源為舊系統 clubclass)。
# 前端沒有第二份:period_catalogue() 隨 /auth/me 下發,改這裡前端就跟著變
PERIOD_TIMES: dict[str, tuple[time, time]] = {
    "1": (time(8, 10), time(9, 0)),
    "2": (time(9, 10), time(10, 0)),
    "3": (time(10, 20), time(11, 10)),
    "4": (time(11, 20), time(12, 10)),
    "5": (time(12, 20), time(13, 10)),
    "6": (time(13, 20), time(14, 10)),
    "7": (time(14, 20), time(15, 10)),
    "8": (time(15, 30), time(16, 20)),
    "9": (time(16, 30), time(17, 20)),
    "10": (time(17, 30), time(18, 20)),
    "A": (time(18, 25), time(19, 15)),
    "B": (time(19, 20), time(20, 10)),
    "C": (time(20, 15), time(21, 5)),
    "D": (time(21, 10), time(22, 0)),
}


def period_catalogue() -> list[dict[str, str]]:
    """節次目錄(依上課順序);前端的節次軸與起訖時刻全部讀這一份。"""
    return [
        {
            "key": p,
            "start": PERIOD_TIMES[p][0].strftime("%H:%M"),
            "end": PERIOD_TIMES[p][1].strftime("%H:%M"),
        }
        for p in PERIODS
    ]


def now_utc() -> datetime:
    """借用領域的單一時鐘來源;「今天已過節次」等牆鐘敏感測試以 monkeypatch 注入。"""
    return datetime.now(UTC)


def today_taipei(now: datetime | None = None) -> date:
    return (now or now_utc()).astimezone(TAIPEI).date()


def booking_start_at(day: date, periods: list[str]) -> datetime:
    """借用起始時刻=最早節次的起點(台北時區);periods 不保證有序,取全部節次最早者。

    periods 不得為空(schema 保證 min_length=1)。
    """
    first = min(periods, key=PERIODS.index)
    return datetime.combine(day, PERIOD_TIMES[first][0], tzinfo=TAIPEI)


def booking_started(day: date, periods: list[str], now: datetime | None = None) -> bool:
    """時間是否已經過申請起始時刻(含相等=已開始)。

    空 periods(正常流程不會產生)退回日粒度,與 venue_booking_started_expr 的
    SQL 判斷一致(空陣列與任何集合皆不重疊,只剩 date < today)。
    """
    now = now or now_utc()
    if not periods:
        return day < today_taipei(now)
    return booking_start_at(day, periods) <= now


def started_periods(now: datetime | None = None) -> list[str]:
    """今天(台北)已開始的節次(起點 ≤ now);供 SQL 以陣列重疊(&&)判斷已開始。"""
    local = (now or now_utc()).astimezone(TAIPEI).time()
    return [p for p in PERIODS if PERIOD_TIMES[p][0] <= local]


def venue_booking_started_expr(now: datetime | None = None) -> sa.ColumnElement[bool]:
    """SQL 條件:臨時借用已開始(申請起始時刻=最早節次起點 ≤ now)。

    正在申請/最近申請的分界:時間經過申請起始時刻即移到「最近」。
    遷移自舊系統的資料 periods 未必有序,不能只看陣列第一個元素;
    以「與今天已開始節次集合重疊(&&)」逐元素比對,結果與元素順序無關
    (新資料由 VenueBookingIn 依節次順序排序後存入,兩種資料皆正確)。
    """
    today = today_taipei(now)
    expr: sa.ColumnElement[bool] = VenueBooking.date < today
    started = started_periods(now)
    if started:
        expr = sa.or_(
            expr,
            sa.and_(VenueBooking.date == today, VenueBooking.periods.op("&&")(started)),
        )
    return expr


# 「進行中」的界線。狀態不夠用 —— 借用不會因為日期過了就換狀態,
# 只篩 status 會把整段歷史當成進行中。
#
# 每條界線都對齊「那一端還動得了什麼」:清單看不到的單就沒有入口,
# 所以看得到的範圍必須涵蓋動得了的範圍(見 AGENTS.md「看得到與動得了是兩個判定」)。
# 固定借用與器材兩端的可動範圍相同,共用一支;臨時借用兩端不同,分兩支。


def room_booking_ongoing_expr(now: datetime | None = None) -> sa.ColumnElement[bool]:
    """固定借用進行中:審核中,或已核准且學期尚未結束。

    社團端取消與行政端撤銷都擋在 `end_date < today`,兩端同一條界線。
    """
    return sa.and_(
        RoomBookingRequest.status.in_([BookingStatus.PENDING, BookingStatus.APPROVED]),
        RoomBookingRequest.end_date >= today_taipei(now),
    )


def venue_booking_ongoing_expr(now: datetime | None = None) -> sa.ColumnElement[bool]:
    """臨時借用未結束:審核中或已核准,且借用日未過。

    行政端「借用中」用這條 —— 與撤銷端點 `date < today` 同一界線。
    比 upcoming 寬:當天已開始的單社團動不了了,承辦仍可撤銷到當日結束,
    卡片就必須繼續列出來,否則誤核的單當天就再也解不開。
    """
    return sa.and_(
        VenueBooking.status.in_([BookingStatus.PENDING, BookingStatus.APPROVED]),
        VenueBooking.date >= today_taipei(now),
    )


def venue_booking_upcoming_expr(now: datetime | None = None) -> sa.ColumnElement[bool]:
    """臨時借用尚未開始:審核中或已核准,且最早節次起點未到。

    社團端「正在申請」用這條 —— 與社團端取消的界線相同(起始時刻一過即不可取消),
    「正在申請」表內必有取消入口。起點一過即落到「最近申請」。
    """
    return sa.and_(
        VenueBooking.status.in_([BookingStatus.PENDING, BookingStatus.APPROVED]),
        sa.not_(venue_booking_started_expr(now)),
    )


def equipment_loan_ongoing_expr() -> sa.ColumnElement[bool]:
    """器材借用進行中:審核中、已核准、借出中。

    只看狀態即可 —— 器材有點交流程,歸還會把狀態推到 returned,
    不像場地借用要靠日期才分得出結束。
    """
    return EquipmentLoan.status.in_(
        [LoanStatus.PENDING, LoanStatus.APPROVED, LoanStatus.CHECKED_OUT]
    )

# 固定借用規則
MAX_FIXED_SLOTS = 10  # 每社至多 10 節(1 節 = 1 小時)
LATE_PERIODS = frozenset({"10", "A", "B", "C", "D"})  # 晚間時段:需至少連續 3 節起借
MIN_LATE_RUN = 3


def runs_of(periods: list[str]) -> list[list[str]]:
    """依 PERIODS 順序把已選節次切成連續區段(與前端 FixedRoomPage.runsOf 同規則)。"""
    idx = sorted(PERIODS.index(p) for p in periods)
    runs: list[list[int]] = []
    cur: list[int] = []
    for i in idx:
        if cur and i == cur[-1] + 1:
            cur.append(i)
        else:
            if cur:
                runs.append(cur)
            cur = [i]
    if cur:
        runs.append(cur)
    return [[PERIODS[i] for i in run] for run in runs]


def late_rule_error(periods: list[str]) -> str | None:
    """晚間時段規則:含第 10 節或 A–D 節的連續區段需 ≥3 節(合法如 9–A、8–10、A–C、B–D)。"""
    for run in runs_of(periods):
        if any(p in LATE_PERIODS for p in run) and len(run) < MIN_LATE_RUN:
            return f"第 10 節及 A–D 節至少需連續 {MIN_LATE_RUN} 節,目前為 {len(run)} 節"
    return None


def fixed_window_state(window: dict, today: date | None = None) -> str:
    """受理期間狀態:unset(沒設)/ upcoming(還沒開始)/ open / closed(已結束)。

    `fixed_window_open()` 只有真假兩種,而「還沒開始」與「已經結束」對使用者是
    完全相反的兩句話 —— 說錯的話承辦剛排好下一輪受理期間就會看到「受理期間已結束」。
    """
    today = today or today_taipei()
    open_from = window.get("open_from")
    open_until = window.get("open_until")
    if not (open_from and open_until):
        return "unset"
    if today < date.fromisoformat(open_from):
        return "upcoming"
    if today > date.fromisoformat(open_until):
        return "closed"
    return "open"


def fixed_window_open(window: dict, now: datetime | None = None) -> bool:
    """固定借用開放窗:日期區間 open_from/open_until(含頭含尾;台北時區)。

    取代「開放月份+手動加開」;未設定區間即不開放。
    """
    today = (now or datetime.now(UTC)).astimezone(TAIPEI).date()
    open_from = window.get("open_from")
    open_until = window.get("open_until")
    if not (open_from and open_until):
        return False
    return date.fromisoformat(open_from) <= today <= date.fromisoformat(open_until)


def fixed_target_semester(window: dict, now: date | None = None) -> tuple[date, date]:
    """固定借用這一輪受理的目標學期起訖(含頭含尾)。

    以**受理期間結束日**推導,而不是「今天」:開放窗跨學期邊界時(例 7/25–8/5),
    按今天推導會讓同一輪申請落到兩個不同學期,每社 10 節的額度跟著重置。
    一律取較後面的那個學期(decisions.md ISS-33)。

    推出來的學期**已經結束**時(或根本沒設過受理期間)才退回以今天推導:
    夾成 `max(open_until, today)` 的話,目標學期一開學就會往前跳一格 ——
    社團的已用節數會在學期中途歸零、場況圖清空。
    """
    today = now or today_taipei()
    open_until = window.get("open_until")
    if not open_until:
        return next_semester_range(today)
    start, end = next_semester_range(date.fromisoformat(open_until))
    return (start, end) if end >= today else next_semester_range(today)


# 資源層 advisory lock:序列化「可用量/衝突檢核 → 寫入」的關鍵區段(隨交易釋放)。
# 申請/核准端點的列鎖只鎖單筆申請,擋不住兩筆不同申請並發通過同一份佔用量檢核;
# 以 (namespace, resource_id) 鎖資源本身,申請端與核准端用同一把鍵。
# 臨時借用與固定借用搶的是同一間場地,必須同一個命名空間才會互相序列化 ——
# 分成 venue/room 兩把鍵時,就算補上交叉查詢也擋不住兩邊同時核准
# club 鎖的是社團自己(每社額度、同社重複申請守門),不是場地:
# 那些檢核的鍵都是社團,照場地鎖不會讓「同社兩張不同場地的申請」互相序列化
# signup_item:報名活動本身(非場次制的預設場次是 get-or-create,兩支並發登錄會各建一列)
_LOCK_NS = {"equipment": 411001, "venue": 411002, "club": 411003, "signup_item": 411004}


async def lock_resource(db: AsyncSession, kind: str, resource_id: int) -> None:
    await db.execute(
        sa.text("SELECT pg_advisory_xact_lock(:ns, :id)"),
        {"ns": _LOCK_NS[kind], "id": resource_id},
    )


async def fixed_slots_taken_on(
    db: AsyncSession, venue_id: int, day: date, periods: list[str]
) -> bool:
    """該日是否已有已核准的**固定**借用佔用這些時段。

    臨時借用核准原本只查其他臨時借用,固定借用核准只查其他固定借用,兩邊互不檢核
    —— 同一間場地同一時段可被雙重核准,DB 也沒有兜底約束。
    """
    return bool(
        await db.scalar(
            sa.select(sa.func.count())
            .select_from(RoomBookingSlot)
            .join(RoomBookingRequest, RoomBookingRequest.id == RoomBookingSlot.request_id)
            .where(
                RoomBookingRequest.venue_id == venue_id,
                RoomBookingRequest.status == BookingStatus.APPROVED,
                RoomBookingRequest.start_date <= day,
                RoomBookingRequest.end_date >= day,
                RoomBookingSlot.weekday == day.isoweekday(),
                RoomBookingSlot.period.in_(periods),
            )
        )
    )


async def fixed_slots_blocked(
    db: AsyncSession, venue_id: int, start: date, end: date, pairs: list[tuple[int, str]]
) -> list[tuple[int, str]]:
    """學期區間內撞到場地不開放規則的 (星期, 節次)。

    以 blocked_map 逐日展開再比對,而不是直接查規則:規則帶自己的日期區間,
    「只封 3/5 那天」的規則對整學期每週借用一樣是衝突,但「只封 3/2–3/4」對週五就不是。
    """
    if not pairs:
        return []
    blocked = await blocked_map(db, start, end, venue_id)
    hit = {
        (weekday, period)
        for (day, _venue), cells in blocked.items()
        for weekday, period in pairs
        if day.isoweekday() == weekday and period in cells
    }
    return sorted(hit)


# 待審固定借用的衝突種類,由重到輕(precedence 與 `fixed_occupancy` 同一組):
# 不開放規則 > 已核准固定 > 已核准臨時 > 其他待審單。前三者核准必被擋
# (SLOT_BLOCKED / SLOT_TAKEN),只能退回或先撤銷那筆;最後一種才是「擇一核准」。
CONFLICT_BLOCKED = "blocked"
CONFLICT_TAKEN = "taken"
CONFLICT_TEMP = "temp"
CONFLICT_PENDING = "pending"
_CONFLICT_RANK = {CONFLICT_BLOCKED: 4, CONFLICT_TAKEN: 3, CONFLICT_TEMP: 2, CONFLICT_PENDING: 1}


async def fixed_conflict_slots(
    db: AsyncSession, requests: Sequence[RoomBookingRequest]
) -> dict[int, dict[tuple[int, str], str]]:
    """逐張待審固定借用算出「哪幾格會撞、撞到什麼」。

    判定軸與核准端的三項檢核同一份(`approve_room_booking`)—— 畫面若自己再算一份,
    漏掉的那一種就是「標成無衝突、按下核准才被擋」。臨時借用那一種尤其容易漏:
    它要把學期區間展開成每週的哪幾天才比得出來,那段邏輯只該存在一處。

    回傳 `request_id → {(星期, 節次): 種類}`;非待審單不算。
    """
    pending = [r for r in requests if r.status == BookingStatus.PENDING]
    if not pending:
        return {}
    venue_ids = {r.venue_id for r in pending}
    span_start = min(r.start_date for r in pending)
    span_end = max(r.end_date for r in pending)

    # 對照名單一次取足:全量待審 + 全量已核准(只限用到的場地與涵蓋得到的區間)。
    # 只比對當前這一頁的話,跨頁的兩社搶同一格會被判成無衝突
    rivals = (
        await db.scalars(
            sa.select(RoomBookingRequest)
            .where(
                RoomBookingRequest.venue_id.in_(venue_ids),
                RoomBookingRequest.status.in_([BookingStatus.PENDING, BookingStatus.APPROVED]),
                RoomBookingRequest.start_date <= span_end,
                RoomBookingRequest.end_date >= span_start,
            )
            .options(sa.orm.selectinload(RoomBookingRequest.slots))
        )
    ).all()

    # 已核准的單日臨時借用:核准端會用它擋下整學期的固定佔用
    today = today_taipei()
    temps = (
        await db.execute(
            sa.select(VenueBooking.venue_id, VenueBooking.date, VenueBooking.periods).where(
                VenueBooking.venue_id.in_(venue_ids),
                VenueBooking.status == BookingStatus.APPROVED,
                VenueBooking.date >= max(span_start, today),
                VenueBooking.date <= span_end,
            )
        )
    ).all()

    # 場地不開放規則:送出後才新增的規則,核准這關同樣擋(SLOT_BLOCKED)
    blocked = await blocked_map(db, span_start, span_end)

    def put(found: dict[tuple[int, str], str], slot: tuple[int, str], kind: str) -> None:
        if _CONFLICT_RANK[kind] > _CONFLICT_RANK.get(found.get(slot, ""), 0):
            found[slot] = kind

    # 對手單的節次集合先建好:放在內圈的話,每張待審單都會把它重建一次
    rival_slots = {r.id: {(s.weekday, s.period) for s in r.slots} for r in rivals}

    # ponytail: 逐對比對 O(n²),一輪開放窗的待審單頂多百餘筆(前端原本也是這樣算);
    # 真的長到會卡時再依場地分桶
    out: dict[int, dict[tuple[int, str], str]] = {}
    for req in pending:
        mine = {(s.weekday, s.period) for s in req.slots}
        found: dict[tuple[int, str], str] = {}
        for other in rivals:
            if other.id == req.id or other.venue_id != req.venue_id:
                continue
            if other.start_date > req.end_date or other.end_date < req.start_date:
                continue
            kind = (
                CONFLICT_TAKEN if other.status == BookingStatus.APPROVED else CONFLICT_PENDING
            )
            for slot in mine & rival_slots[other.id]:
                put(found, slot, kind)
        # 學期已開始後才核准的固定借用,不該被學期內早已過去的臨時借用擋死(與核准端同一條)
        first_day = max(req.start_date, today)
        for venue_id, day, periods in temps:
            if venue_id != req.venue_id or not (first_day <= day <= req.end_date):
                continue
            for period in periods:
                if (day.isoweekday(), period) in mine:
                    put(found, (day.isoweekday(), period), CONFLICT_TEMP)
        # 不開放規則逐日展開後比對(規則帶自己的日期區間,只封某幾天的規則對整學期
        # 每週借用一樣是衝突,但只封週一到週三的對週五就不是)
        for (day, venue_id), cells in blocked.items():
            if venue_id != req.venue_id or not (req.start_date <= day <= req.end_date):
                continue
            for period in cells:
                if (day.isoweekday(), period) in mine:
                    put(found, (day.isoweekday(), period), CONFLICT_BLOCKED)
        if found:
            out[req.id] = found
    return out


async def temp_days_hitting_slots(
    db: AsyncSession, venue_id: int, start: date, end: date, pairs: list[tuple[int, str]]
) -> bool:
    """區間內是否有已核准的**臨時**借用落在這些 (星期, 時段) 上。"""
    if not pairs:
        return False
    # 學期已開始後才核准的固定借用,不該被學期內早已過去的臨時借用擋死
    start = max(start, today_taipei())
    if start > end:
        return False
    by_weekday: dict[int, list[str]] = {}
    for wd, period in pairs:
        by_weekday.setdefault(wd, []).append(period)
    weekday = sa.cast(sa.extract("isodow", VenueBooking.date), sa.Integer)
    clauses = [
        sa.and_(weekday == wd, VenueBooking.periods.op("&&")(ps))
        for wd, ps in by_weekday.items()
    ]
    return bool(
        await db.scalar(
            sa.select(sa.func.count()).where(
                VenueBooking.venue_id == venue_id,
                VenueBooking.status == BookingStatus.APPROVED,
                VenueBooking.date >= start,
                VenueBooking.date <= end,
                sa.or_(*clauses),
            )
        )
    )


async def fixed_occupancy(
    db: AsyncSession, venue_id: int, start: date, end: date
) -> dict[tuple[int, str], str]:
    """該場地在學期區間內每週 (星期, 節次) 的佔用原因,供申請畫面標示。

    三條來源與**核准**關檢核的完全同一份判定(送出關只擋不開放規則 —— 多社競爭同一時段
    本來就允許,由承辦整單擇一,所以固定/臨時是核准時才擋):
    `blocked`=場地不開放規則、`fixed`=已核准的固定借用、`temp`=已核准的單日臨時借用。
    同一格多重命中時取最硬的那條(不開放 > 已核准固定 > 已核准臨時)。
    """
    out: dict[tuple[int, str], str] = {}

    # 已核准的臨時借用(逐日展開成星期):學期已開始的話,過去的日子不再擋
    temp_start = max(start, today_taipei())
    if temp_start <= end:
        weekday = sa.cast(sa.extract("isodow", VenueBooking.date), sa.Integer)
        rows = await db.execute(
            sa.select(weekday, sa.func.unnest(VenueBooking.periods)).where(
                VenueBooking.venue_id == venue_id,
                VenueBooking.status == BookingStatus.APPROVED,
                VenueBooking.date >= temp_start,
                VenueBooking.date <= end,
            )
        )
        for wd, period in rows:
            out[(int(wd), period)] = "temp"

    # 已核准的固定借用(同場地、學期區間重疊)
    rows = await db.execute(
        sa.select(RoomBookingSlot.weekday, RoomBookingSlot.period)
        .join(RoomBookingRequest, RoomBookingRequest.id == RoomBookingSlot.request_id)
        .where(
            RoomBookingRequest.venue_id == venue_id,
            RoomBookingRequest.status == BookingStatus.APPROVED,
            RoomBookingRequest.start_date <= end,
            RoomBookingRequest.end_date >= start,
        )
    )
    for wd, period in rows:
        out[(int(wd), period)] = "fixed"

    # 場地不開放規則:區間內只要有一天的該星期該節次被封,整個每週時段就不受理
    for (day, _venue), cells in (await blocked_map(db, start, end, venue_id)).items():
        for period in cells:
            out[(day.isoweekday(), period)] = "blocked"
    return out


async def equipment_available_in_window(
    db: AsyncSession,
    equipment_id: int,
    total_qty: int,
    start: date,
    end: date,
    *,
    exclude_loan_id: int | None = None,
) -> int:
    """指定區間可借數 = total − 佔用量(pending/approved/checked_out)。

    佔用 = 區間重疊者。**查詢區間涵蓋今天或未來時,再加上所有已借出未歸還者** ——
    逾期未還的單子原區間已過,只比對區間重疊會把它算成沒佔用,東西實體還在別人手上
    可借數卻照常給,直接超賣。反過來,補登歷史借用問的是「當時借不借得到」,
    不該被今天實體借出中的數量擋死。

    exclude_loan_id:行政端審核檢核時排除本單(避免把待審單自己算進佔用)。
    """
    query = sa.select(sa.func.coalesce(sa.func.sum(EquipmentLoan.qty), 0)).where(
        EquipmentLoan.equipment_id == equipment_id, _occupies_window(start, end)
    )
    if exclude_loan_id is not None:
        query = query.where(EquipmentLoan.id != exclude_loan_id)
    out = await db.scalar(query)
    return max(total_qty - int(out or 0), 0)


def _occupies_window(start: date, end: date) -> sa.ColumnElement[bool]:
    """佔用該區間的借用單條件;逐筆版與批次版共用一份(判定分兩份就會各自漂移)。"""
    occupied = [sa.and_(EquipmentLoan.start_date <= end, EquipmentLoan.end_date >= start)]
    if end >= today_taipei():
        occupied.append(EquipmentLoan.status == LoanStatus.CHECKED_OUT)
    return sa.and_(
        EquipmentLoan.status.notin_(
            [LoanStatus.REJECTED, LoanStatus.RETURNED, LoanStatus.CANCELLED]
        ),
        sa.or_(*occupied),
    )


async def equipment_available_map(
    db: AsyncSession, totals: dict[int, int], window: tuple[date, date] | None = None
) -> dict[int, int]:
    """一次算完整份器材主檔的可借數:逐列查詢時往返次數會隨器材數成長。

    window=None 時與 equipment_available 同義(只扣借出中);給定時同 equipment_available_in_window。
    """
    if not totals:
        return {}
    occupied = (
        EquipmentLoan.status == LoanStatus.CHECKED_OUT
        if window is None
        else _occupies_window(*window)
    )
    rows = await db.execute(
        sa.select(EquipmentLoan.equipment_id, sa.func.coalesce(sa.func.sum(EquipmentLoan.qty), 0))
        .where(EquipmentLoan.equipment_id.in_(totals), occupied)
        .group_by(EquipmentLoan.equipment_id)
    )
    used = {equipment_id: int(qty) for equipment_id, qty in rows}
    return {eid: max(total - used.get(eid, 0), 0) for eid, total in totals.items()}


def next_workday_in(d: date, holidays: set[date]) -> date:
    """下一個上班日(跳過週末與政府行事曆假日);純函式,假日集合由呼叫端提供。"""
    cursor = d + timedelta(days=1)
    while cursor.weekday() >= 5 or cursor in holidays:
        cursor += timedelta(days=1)
    return cursor


def add_workdays(d: date, n: int, holidays: set[date]) -> date:
    """往前/往後 n 個工作天(跳過週末與 holidays 表的政府行事曆假日)。

    holidays 每年由行政匯入(data-model.md §3.2);未匯入年度僅排除週六日。
    """
    step = 1 if n > 0 else -1
    left = abs(n)
    cursor = d
    while left > 0:
        cursor += timedelta(days=step)
        if cursor.weekday() < 5 and cursor not in holidays:
            left -= 1
    return cursor


def loan_window(activity: Activity, buffer: dict, holidays: set[date]) -> tuple[date, date]:
    """器材借用區間=活動開始日 −before 個工作天 ~ 活動結束日 +after 個工作天。"""
    start = add_workdays(activity.date, -int(buffer.get("before", 2)), holidays)
    end = add_workdays(activity.end_date or activity.date, int(buffer.get("after", 1)), holidays)
    return start, end


def overdue_deadline_in(end_date: date, return_time: str, holidays: set[date]) -> datetime:
    """歸還期限:結束日之隔天上班日 HH:MM(台北時區)。"""
    workday = next_workday_in(end_date, holidays)
    hour, minute = (int(x) for x in return_time.split(":"))
    return datetime.combine(workday, time(hour, minute), tzinfo=TAIPEI)


def is_overdue_in(loan: EquipmentLoan, return_time: str, holidays: set[date]) -> bool:
    if loan.status != LoanStatus.CHECKED_OUT:
        return False
    return datetime.now(UTC) >= overdue_deadline_in(loan.end_date, return_time, holidays)


def overdue_threshold_in(now: datetime, return_time: str, holidays: set[date]) -> date:
    """最晚的已逾期結束日:end_date <= 回傳值 ⟺ 已逾期(以 status=checked_out 為前提)。

    歸還期限對 end_date 單調不減,故存在單一門檻日;供列表端點以 SQL 篩選
    「逾期」(推導不儲存),避免逐列計算破壞分頁。
    """
    cursor = now.astimezone(TAIPEI).date()
    while overdue_deadline_in(cursor, return_time, holidays) > now:
        cursor -= timedelta(days=1)
    return cursor


async def load_holidays(db: AsyncSession) -> set[date]:
    """全表撈一次(一年不過百餘筆);列表端點每請求呼叫一次,避免逐列查詢。"""
    return set(await db.scalars(sa.select(Holiday.date)))


async def next_workday(db: AsyncSession, d: date) -> date:
    return next_workday_in(d, await load_holidays(db))


async def overdue_deadline(db: AsyncSession, end_date: date, return_time: str) -> datetime:
    return overdue_deadline_in(end_date, return_time, await load_holidays(db))


async def blocked_map(
    db: AsyncSession, start: date, end: date, venue_id: int | None = None
) -> dict[tuple[date, int], dict[str, str]]:
    """區間內各(日,場地)的不開放節次 → {節次: 原因}(venue_block_rules 展開)。

    weekdays NULL=區間內每天;有值=僅列出的 ISO 星期(1=一…7=日)。
    """
    query = sa.select(VenueBlockRule).where(
        VenueBlockRule.start_date <= end, VenueBlockRule.end_date >= start
    )
    if venue_id is not None:
        query = query.where(VenueBlockRule.venue_id == venue_id)
    out: dict[tuple[date, int], dict[str, str]] = {}
    for rule in (await db.scalars(query)).all():
        day = max(rule.start_date, start)
        stop = min(rule.end_date, end)
        while day <= stop:
            if not rule.weekdays or day.isoweekday() in rule.weekdays:
                cell = out.setdefault((day, rule.venue_id), {})
                for period in rule.periods:
                    cell[period] = rule.reason
            day += timedelta(days=1)
    return out


async def blocked_periods(
    db: AsyncSession, venue_id: int, day: date, periods: list[str]
) -> list[str]:
    """申請/核准檢核:回傳與不開放規則重疊的節次(空=無衝突)。"""
    blocked = await blocked_map(db, day, day, venue_id)
    hit = blocked.get((day, venue_id), {})
    return [p for p in periods if p in hit]


async def availability_grid(
    db: AsyncSession, day: date, own_club_id: int | None
) -> dict[int, dict[str, dict]]:
    """單日場況(區間版的特例);格式見 availability_grids。"""
    return (await availability_grids(db, day, day, own_club_id))[day]


async def availability_grids(
    db: AsyncSession,
    start: date,
    end: date,
    own_club_id: int | None,
    venue_id: int | None = None,
) -> dict[date, dict[int, dict[str, dict]]]:
    """逐日場況:日 → 場地 × 節次 → {status, club}。
    status:pending(審核中)/temp(臨時)/fixed(固定)/mine(自己已核准);club=借用社團名(hover 顯示)。

    - 只回傳被佔用/審核中的格子;其餘由前端依 venue 開放旗標補 available/closed
    - 固定借用僅在其目標學期起訖內顯示(先前無學期界限,未退回申請永久佔格);
      已核准標 fixed/mine,審核中標 pending
    - 審核中(含本社)一律標 pending;本社已核准才標 mine(2026-07-17 修正:自己審核中不再誤標我的借用)
    - 區間一次撈(單一場地 15 天檢視原逐日 15 請求,2026-07-17 改批次);
      venue_id 給定時(單一場地檢視)SQL 端即縮小到該場地
    - 兩查詢皆 ORDER BY id:同一格多筆待審時,hover 顯示哪一社不隨 PG 回傳順序變動
    """
    grids: dict[date, dict[int, dict[str, dict]]] = {
        start + timedelta(days=i): {} for i in range((end - start).days + 1)
    }

    def mark(day: date, venue_id: int, period: str, status: str, club: str) -> None:
        cell = grids[day].setdefault(venue_id, {})
        # mine 優先顯示;已核准蓋過審核中;不開放(blocked)蓋過一切
        rank = {"pending": 0, "temp": 1, "fixed": 1, "mine": 2, "blocked": 3}
        current = cell.get(period)
        if current is None or rank[status] > rank[current["status"]]:
            cell[period] = {"status": status, "club": club}

    temp_query = (
        sa.select(VenueBooking, Club.name)
        .outerjoin(Club, VenueBooking.club_id == Club.id)  # NULL club=行政手動借用
        .where(
            VenueBooking.date >= start,
            VenueBooking.date <= end,
            VenueBooking.status.notin_([BookingStatus.REJECTED, BookingStatus.CANCELLED]),
        )
        .order_by(VenueBooking.id)
    )
    if venue_id is not None:
        temp_query = temp_query.where(VenueBooking.venue_id == venue_id)
    for booking, club_name in (await db.execute(temp_query)).all():
        # 本社已核准=mine;其餘已核准=temp;審核中(含本社)=pending
        if booking.status == BookingStatus.APPROVED:
            status = "mine" if booking.club_id == own_club_id else "temp"
        else:
            status = "pending"
        for period in booking.periods:
            mark(booking.date, booking.venue_id, period, status, club_name or "學務處")

    fixed_query = (
        sa.select(RoomBookingSlot, RoomBookingRequest, Club.name)
        .join(RoomBookingRequest, RoomBookingSlot.request_id == RoomBookingRequest.id)
        .join(Club, RoomBookingRequest.club_id == Club.id)
        .where(
            RoomBookingRequest.status.notin_(
                [BookingStatus.REJECTED, BookingStatus.CANCELLED]
            ),
            RoomBookingRequest.start_date <= end,
            RoomBookingRequest.end_date >= start,
            RoomBookingSlot.weekday.in_({d.isoweekday() for d in grids}),
        )
        .order_by(RoomBookingRequest.id)
    )
    if venue_id is not None:
        fixed_query = fixed_query.where(RoomBookingRequest.venue_id == venue_id)
    fixed_rows = (await db.execute(fixed_query)).all()
    for day in grids:
        for slot, request, club_name in fixed_rows:
            if slot.weekday != day.isoweekday():
                continue
            if not (request.start_date <= day <= request.end_date):
                continue  # 該日不在申請的目標學期內
            # 審核中固定借用標 pending;本社已核准 mine、他社已核准 fixed
            if request.status != BookingStatus.APPROVED:
                status = "pending"
            else:
                status = "mine" if request.club_id == own_club_id else "fixed"
            mark(day, request.venue_id, slot.period, status, club_name)

    # 不開放規則:蓋過一切;hover 顯示原因
    for (day, vid), cells in (await blocked_map(db, start, end, venue_id)).items():
        for period, reason in cells.items():
            mark(day, vid, period, "blocked", reason)

    return grids


async def admin_availability_grid(db: AsyncSession, day: date) -> dict[int, dict[str, dict]]:
    """行政端全校單日場況:格值 {status, club, pending}。

    - status:pending(審核中)/temp(已核准臨時借用)/fixed(已核准固定借用)/blocked(不開放)
    - club:決定該格顏色的借用社團名(行政手動借用為「學務處」;blocked 格為不開放原因)
    - pending:該格**全部**待審單 [{id, club, kind}];id 僅臨時借用有(供點格開審核彈窗),
      固定借用要到 /admin/rooms 審
    - 無「自己借用」概念;已核准蓋過審核中(與 club 端同權重規則)——但被蓋掉的待審單
      仍留在 pending 裡:承辦最需要看見的正是「這格已被核准,底下還壓著誰的申請」
    - 兩查詢皆 ORDER BY id:同一格多筆待審時,誰決定格色與列表順序才不隨 PG 回傳順序變動
    """
    grid: dict[int, dict[str, dict]] = {}
    rank = {"pending": 0, "temp": 1, "fixed": 1, "blocked": 2}

    def mark(venue_id: int, period: str, status: str, club: str | None) -> dict:
        cell = grid.setdefault(venue_id, {}).setdefault(
            period, {"status": status, "club": club, "pending": []}
        )
        if rank[status] > rank[cell["status"]]:
            cell["status"], cell["club"] = status, club
        return cell

    temp_rows = await db.execute(
        sa.select(VenueBooking, Club.name)
        .outerjoin(Club, VenueBooking.club_id == Club.id)  # NULL club=行政手動借用
        .where(
            VenueBooking.date == day,
            VenueBooking.status.notin_([BookingStatus.REJECTED, BookingStatus.CANCELLED]),
        )
        .order_by(VenueBooking.id)
    )
    for booking, club_name in temp_rows:
        approved = booking.status == BookingStatus.APPROVED
        name = club_name or "學務處"
        for period in booking.periods:
            cell = mark(booking.venue_id, period, "temp" if approved else "pending", name)
            if not approved:
                cell["pending"].append({"id": booking.id, "club": name, "kind": "temp"})

    fixed_rows = await db.execute(
        # 一單最多 10 個時段,整個 request 會被 join 複製 10 次:只取畫格用得到的欄位
        sa.select(
            RoomBookingSlot.period,
            RoomBookingRequest.venue_id,
            RoomBookingRequest.status,
            Club.name,
        )
        .join(RoomBookingRequest, RoomBookingSlot.request_id == RoomBookingRequest.id)
        .join(Club, RoomBookingRequest.club_id == Club.id)
        .where(
            RoomBookingSlot.weekday == day.isoweekday(),
            RoomBookingRequest.status.notin_([BookingStatus.REJECTED, BookingStatus.CANCELLED]),
            RoomBookingRequest.start_date <= day,
            RoomBookingRequest.end_date >= day,
        )
        .order_by(RoomBookingRequest.id)
    )
    for period, fixed_venue_id, status, club_name in fixed_rows:
        # 審核中的固定借用也要標:承辦人核准臨時借用時,若這格在螢幕上是空白的,
        # 雙重核准連目視都攔不下來
        approved = status == BookingStatus.APPROVED
        cell = mark(fixed_venue_id, period, "fixed" if approved else "pending", club_name)
        if not approved:
            cell["pending"].append({"id": None, "club": club_name, "kind": "fixed"})

    for (_, vid), cells in (await blocked_map(db, day, day)).items():
        for period, reason in cells.items():
            mark(vid, period, "blocked", reason)

    return grid
