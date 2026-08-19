"""活動申請/結案的推導規則與共用查詢。"""

from datetime import UTC, date, datetime, time, timedelta

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.errors import not_found
from app.core.semesters import TAIPEI, semester_of
from app.models import Activity, ActivityBudgetItem, ActivityReport, File, User
from app.models.enums import ActivityStatus

# 結案照片與申請附件在 files 表的定位
PHOTO_SUBJECT = "activity"
PHOTO_SLOT = "report_photo"
ATTACHMENT_SLOT = "proposal"


def end_datetime(activity: Activity) -> datetime:
    """活動結束時刻(台北時區):end_date + end_time;未填時間以當日 23:59 計。"""
    t = activity.end_time or time(23, 59)
    return datetime.combine(activity.end_date or activity.date, t, tzinfo=TAIPEI)


def add_months(d: date, months: int) -> date:
    month = d.month - 1 + months
    year = d.year + month // 12
    month = month % 12 + 1
    day = min(
        d.day,
        [
            31,
            29 if year % 4 == 0 and (year % 100 != 0 or year % 400 == 0) else 28,
            31,
            30,
            31,
            30,
            31,
            31,
            30,
            31,
            30,
            31,
        ][month - 1],
    )
    return date(year, month, day)


# 只持簽核關卡鍵的帳號(如學務長)視野受限;持 areview 才看得到全部
FULL_VIEW_KEYS = ("areview",)


def visible_statuses(user) -> set[ActivityStatus] | None:
    """受限關卡帳號**看得到**哪些狀態;None=不限(super 或持活動審核頁權限)。

    列表與詳情用它。側欄徽章要的是「簽得下去」而非「看得到」,走 `actionable_statuses`。
    """
    if user.is_super or any(k in user.permissions for k in FULL_VIEW_KEYS):
        return None
    visible: set[ActivityStatus] = set()
    if "approve_advisor" in user.permissions:
        visible |= {ActivityStatus.PENDING_ADVISOR, ActivityStatus.CLOSING_PENDING_ADVISOR}
    if "approve_chief" in user.permissions:
        visible.add(ActivityStatus.PENDING_CHIEF)
    if "approve_dean" in user.permissions:
        visible.add(ActivityStatus.PENDING_DEAN)
    if "aclose" in user.permissions:
        visible |= {
            ActivityStatus.CLOSING_PENDING_ADVISOR,
            ActivityStatus.APPROVED,
            ActivityStatus.CLOSED,
        }
    return visible


def actionable_statuses(user) -> set[ActivityStatus]:
    """該帳號**簽得下去**的待審狀態(徽章與待審佇列用;`visible_statuses` 是看得到的範圍)。

    與 `_require_stage_key` 同一條規則:學務長關卡即使 super 也要明確持有 `approve_dean`。
    只持頁面鍵 `areview` 的帳號看得到全部、一件也簽不了 —— 徽章要跟著佇列是 0。
    """
    out: set[ActivityStatus] = set()
    if user.is_super or "approve_advisor" in user.permissions:
        out.add(ActivityStatus.PENDING_ADVISOR)
    if user.is_super or "approve_chief" in user.permissions:
        out.add(ActivityStatus.PENDING_CHIEF)
    if "approve_dean" in user.permissions:
        out.add(ActivityStatus.PENDING_DEAN)
    return out


def is_close_locked(activity: Activity, lock_months: int, now: datetime | None = None) -> bool:
    """逾期鎖定(推導):已核准、活動結束日(end_date)+N 個月已過、未送結案、未解鎖。"""
    if activity.status != ActivityStatus.APPROVED or activity.close_unlocked:
        return False
    now = now or datetime.now(UTC)
    base = activity.end_date or activity.date
    deadline = datetime.combine(
        add_months(base, lock_months) + timedelta(days=1), time(0, 0), tzinfo=TAIPEI
    )
    return now >= deadline


def close_overdue_sql(lock_months: int) -> sa.ColumnElement[bool]:
    """同一條期限的 SQL 版(逾期清單在 DB 端篩);PG 月加法與 add_months 同為日夾底。"""
    return (
        sa.func.coalesce(Activity.end_date, Activity.date)
        + sa.func.make_interval(0, int(lock_months))
        < datetime.now(TAIPEI).date()
    )


def ended_sql() -> sa.ColumnElement[bool]:
    """活動已結束(SQL 版):結束日 + 結束時間(未填以 23:59 計)已過台北當下。"""
    return (
        sa.func.coalesce(Activity.end_date, Activity.date)
        + sa.func.coalesce(Activity.end_time, sa.literal(time(23, 59)))
    ) <= datetime.now(TAIPEI).replace(tzinfo=None)


def close_locked_sql(lock_months: int) -> sa.ColumnElement[bool]:
    """`is_close_locked` 的 SQL 版:已核准、未解鎖、結案期限已過。

    畫面把這種列顯示成「已逾期」而不是「已核准」,清單的狀態篩選要跟著同一條判定。
    """
    return sa.and_(
        Activity.status == ActivityStatus.APPROVED,
        Activity.close_unlocked.is_(False),
        close_overdue_sql(lock_months),
    )


def can_close_sql(lock_months: int) -> sa.ColumnElement[bool]:
    """can_close 的 SQL 版(結案清單在 DB 端篩,不是抓回全部已核准再過濾)。

    「已結束」在 PG 以 date + time 相加成 timestamp 比對台北當下;
    「未鎖定」沿用 close_overdue_sql,兩邊的期限推導保持同源。
    """
    return sa.and_(
        Activity.status == ActivityStatus.APPROVED,
        ended_sql(),
        sa.not_(close_locked_sql(lock_months)),
    )


def can_close(activity: Activity, lock_months: int, now: datetime | None = None) -> bool:
    """結案資格:已核准且活動已結束且未被鎖定。"""
    now = now or datetime.now(UTC)
    return (
        activity.status == ActivityStatus.APPROVED
        and now >= end_datetime(activity)
        and not is_close_locked(activity, lock_months, now)
    )


def decorate(out, activity: Activity, lock_months: int) -> None:
    """填 ActivityOut 的推導欄位。"""
    items = activity.budget_items
    out.self_fund_total = sum(i.self_fund for i in items)
    out.requested_total = sum(i.requested_subsidy for i in items)
    approved = [i.approved_subsidy for i in items if i.approved_subsidy is not None]
    out.approved_total = sum(approved) if approved else None
    # 部分填寫的草稿可能無日期;日期推導欄位留空
    out.semester = semester_of(activity.date) if activity.date else ""
    out.close_locked = is_close_locked(activity, lock_months)
    base = activity.end_date or activity.date
    out.close_deadline = add_months(base, lock_months) if base else None
    out.can_close = can_close(activity, lock_months)
    out.has_close_draft = activity.close_draft is not None


async def get_own_activity(
    db: AsyncSession, user: User, activity_id: int, *, with_detail: bool = False
) -> Activity:
    query = sa.select(Activity).where(Activity.id == activity_id, Activity.club_id == user.club_id)
    if with_detail:
        query = query.options(
            selectinload(Activity.budget_items),
            selectinload(Activity.report).selectinload(ActivityReport.reflections),
        )
    else:
        query = query.options(selectinload(Activity.budget_items))
    activity = await db.scalar(query)
    if activity is None:
        raise not_found("找不到活動")
    return activity


def replace_budget_items(activity: Activity, items) -> None:
    activity.budget_items.clear()
    for item in items:
        activity.budget_items.append(
            ActivityBudgetItem(
                category=item.category,
                description=item.description,
                self_fund=item.self_fund,
                requested_subsidy=item.requested_subsidy,
            )
        )


async def activity_files(db: AsyncSession, activity: Activity, slot: str) -> list[File]:
    rows = await db.scalars(
        sa.select(File)
        .where(
            File.subject_type == PHOTO_SUBJECT,
            File.subject_id == activity.id,
            File.slot == slot,
            File.archived_at.is_(None),
        )
        .order_by(File.created_at)
    )
    return list(rows)
