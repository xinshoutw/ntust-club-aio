"""借用領域的推導規則:節次、固定借用規則、器材可借數與借用區間、逾期判定、場地色格。"""

from datetime import UTC, date, datetime, time, timedelta

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.semesters import TAIPEI
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

# 節次起訖時刻(退役舊系統 clubclass 的權威對照,2026-07-21 需求方確認;
# 前端鏡射於 frontend/src/api/bookings.ts 的 PERIOD_TIMES,改動須同步)
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


def now_utc() -> datetime:
    """借用領域的單一時鐘來源;「今天已過節次」等牆鐘敏感測試以 monkeypatch 注入。"""
    return datetime.now(UTC)


def today_taipei(now: datetime | None = None) -> date:
    return (now or now_utc()).astimezone(TAIPEI).date()


def booking_start_at(day: date, periods: list[str]) -> datetime:
    """借用起始時刻=最早節次的起點(台北時區);periods 不保證有序,取全部節次最早者。"""
    first = min(periods, key=PERIODS.index)
    return datetime.combine(day, PERIOD_TIMES[first][0], tzinfo=TAIPEI)


def booking_started(day: date, periods: list[str], now: datetime | None = None) -> bool:
    """時間是否已經過申請起始時刻(含相等=已開始)。"""
    return booking_start_at(day, periods) <= (now or now_utc())


def started_periods(now: datetime | None = None) -> list[str]:
    """今天(台北)已開始的節次(起點 ≤ now);供 SQL 以陣列重疊(&&)判斷已開始。"""
    local = (now or now_utc()).astimezone(TAIPEI).time()
    return [p for p in PERIODS if PERIOD_TIMES[p][0] <= local]

# 固定借用規則(2026-07-15 需求方定案)
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


def fixed_window_open(window: dict, now: datetime | None = None) -> bool:
    """固定借用開放窗:日期區間 open_from/open_until(含頭含尾;台北時區)。

    2026-07-16 第八輪:取代「開放月份+手動加開」;未設定區間即不開放。
    """
    today = (now or datetime.now(UTC)).astimezone(TAIPEI).date()
    open_from = window.get("open_from")
    open_until = window.get("open_until")
    if not (open_from and open_until):
        return False
    return date.fromisoformat(open_from) <= today <= date.fromisoformat(open_until)


# 資源層 advisory lock:序列化「可用量/衝突檢核 → 寫入」的關鍵區段(隨交易釋放)。
# 申請/核准端點的列鎖只鎖單筆申請,擋不住兩筆不同申請並發通過同一份佔用量檢核;
# 以 (namespace, resource_id) 鎖資源本身,申請端與核准端用同一把鍵
_LOCK_NS = {"equipment": 411001, "venue": 411002, "room": 411003}


async def lock_resource(db: AsyncSession, kind: str, resource_id: int) -> None:
    await db.execute(
        sa.text("SELECT pg_advisory_xact_lock(:ns, :id)"),
        {"ns": _LOCK_NS[kind], "id": resource_id},
    )


async def equipment_available(db: AsyncSession, equipment_id: int, total_qty: int) -> int:
    """目前可借數 = total − 借出中數量(推導不儲存;未指定活動區間時的粗略值)。"""
    out = await db.scalar(
        sa.select(sa.func.coalesce(sa.func.sum(EquipmentLoan.qty), 0)).where(
            EquipmentLoan.equipment_id == equipment_id,
            EquipmentLoan.status == LoanStatus.CHECKED_OUT,
        )
    )
    return max(total_qty - int(out or 0), 0)


async def equipment_available_in_window(
    db: AsyncSession,
    equipment_id: int,
    total_qty: int,
    start: date,
    end: date,
    *,
    exclude_loan_id: int | None = None,
) -> int:
    """指定區間可借數 = total − 區間重疊之未歸還且未退回借用量(pending/approved/checked_out)。

    exclude_loan_id:行政端審核檢核時排除本單(避免把待審單自己算進佔用)。
    """
    query = sa.select(sa.func.coalesce(sa.func.sum(EquipmentLoan.qty), 0)).where(
        EquipmentLoan.equipment_id == equipment_id,
        EquipmentLoan.status.notin_(
            [LoanStatus.REJECTED, LoanStatus.RETURNED, LoanStatus.CANCELLED]
        ),
        EquipmentLoan.start_date <= end,
        EquipmentLoan.end_date >= start,
    )
    if exclude_loan_id is not None:
        query = query.where(EquipmentLoan.id != exclude_loan_id)
    out = await db.scalar(query)
    return max(total_qty - int(out or 0), 0)


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
    - 固定借用僅在其目標學期起訖內顯示(2026-07-17:先前無學期界限,未退回申請永久佔格);
      已核准標 fixed/mine,審核中標 pending
    - 審核中(含本社)一律標 pending;本社已核准才標 mine(2026-07-17 修正:自己審核中不再誤標我的借用)
    - 區間一次撈(單一場地 15 天檢視原逐日 15 請求,2026-07-17 改批次);
      venue_id 給定時(單一場地檢視)SQL 端即縮小到該場地
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
    """行政端全校單日場況:格值 {status, booking_id}。

    - status:pending(審核中臨時借用)/temp(已核准臨時借用)/fixed(已核准固定借用)
    - booking_id:僅審核中的臨時借用帶申請 id(供點格開審核彈窗);其餘為 None
    - 無「自己借用」概念;已核准蓋過審核中(與 club 端同權重規則)
    """
    grid: dict[int, dict[str, dict]] = {}
    rank = {"pending": 0, "temp": 1, "fixed": 1, "blocked": 2}

    def mark(venue_id: int, period: str, status: str, booking_id: int | None = None) -> None:
        cell = grid.setdefault(venue_id, {})
        current = cell.get(period)
        if current is None or rank[status] > rank[current["status"]]:
            cell[period] = {"status": status, "booking_id": booking_id}

    temp_rows = await db.execute(
        sa.select(VenueBooking).where(
            VenueBooking.date == day,
            VenueBooking.status.notin_([BookingStatus.REJECTED, BookingStatus.CANCELLED]),
        )
    )
    for booking in temp_rows.scalars():
        approved = booking.status == BookingStatus.APPROVED
        for period in booking.periods:
            mark(
                booking.venue_id,
                period,
                "temp" if approved else "pending",
                None if approved else booking.id,
            )

    fixed_rows = await db.execute(
        sa.select(RoomBookingSlot, RoomBookingRequest.venue_id)
        .join(RoomBookingRequest, RoomBookingSlot.request_id == RoomBookingRequest.id)
        .where(
            RoomBookingSlot.weekday == day.isoweekday(),
            RoomBookingRequest.status == BookingStatus.APPROVED,
            RoomBookingRequest.start_date <= day,
            RoomBookingRequest.end_date >= day,
        )
    )
    for slot, venue_id in fixed_rows:
        mark(venue_id, slot.period, "fixed")

    for (_, vid), cells in (await blocked_map(db, day, day)).items():
        for period in cells:
            mark(vid, period, "blocked")

    return grid
