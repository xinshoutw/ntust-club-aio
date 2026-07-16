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
    out.semester = semester_of(activity.date)
    out.close_locked = is_close_locked(activity, lock_months)
    out.close_deadline = add_months(activity.end_date or activity.date, lock_months)
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
