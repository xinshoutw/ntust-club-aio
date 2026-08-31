"""活動申請/結案的推導規則與共用查詢。"""

from datetime import UTC, datetime, time, timedelta

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.errors import not_found, validation_error
from app.core.semesters import TAIPEI, semester_of
from app.models import Activity, ActivityBudgetItem, ActivityReport, ApprovalRecord, File, User
from app.models.enums import ActivityStatus, ApprovalDecision, ApprovalSubject

# 結案照片、結案附件與申請附件在 files 表的定位
PHOTO_SUBJECT = "activity"
PHOTO_SLOT = "report_photo"
DOC_SLOT = "report_doc"
ATTACHMENT_SLOT = "proposal"

# 送出結案的照片下限(前端同值:frontend/src/features/activities/types.ts MIN_PHOTOS)
MIN_PHOTOS = 5

# 申請簽核三關,順序即申請表的 初核 / 複核 / 決行 三格
# (顯示詞是 承辦人 / 組長 / 學務長,見 admin_activities._STAGE_LABEL)
APPLY_STAGES = ("advisor", "chief", "dean")


def end_datetime(activity: Activity) -> datetime:
    """活動結束時刻(台北時區):end_date + end_time;未填時間以當日 23:59 計。"""
    t = activity.end_time or time(23, 59)
    return datetime.combine(activity.end_date or activity.date, t, tzinfo=TAIPEI)


# 只持簽核關卡鍵的帳號(如學務長)視野受限;持這些頁面鍵才看得到全部狀態
# (申請審核、所有活動、社團活動列表 —— 後兩頁的用途就是查閱全部狀態的活動)
FULL_VIEW_KEYS = ("areview", "aactivity", "aclubact")


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


def is_close_locked(activity: Activity, lock_days: int, now: datetime | None = None) -> bool:
    """逾期鎖定(推導):已核准、活動結束日(end_date)+N 天已過、未送結案、未解鎖。"""
    if activity.status != ActivityStatus.APPROVED or activity.close_unlocked:
        return False
    now = now or datetime.now(UTC)
    base = activity.end_date or activity.date
    deadline = datetime.combine(
        base + timedelta(days=int(lock_days) + 1), time(0, 0), tzinfo=TAIPEI
    )
    return now >= deadline


def close_overdue_sql(lock_days: int) -> sa.ColumnElement[bool]:
    """同一條期限的 SQL 版(逾期清單在 DB 端篩);PG 的 date + 整數即加天數。"""
    return (
        sa.func.coalesce(Activity.end_date, Activity.date) + int(lock_days)
        < datetime.now(TAIPEI).date()
    )


def ended_sql() -> sa.ColumnElement[bool]:
    """活動已結束(SQL 版):結束日 + 結束時間(未填以 23:59 計)已過台北當下。"""
    return (
        sa.func.coalesce(Activity.end_date, Activity.date)
        + sa.func.coalesce(Activity.end_time, sa.literal(time(23, 59)))
    ) <= datetime.now(TAIPEI).replace(tzinfo=None)


def close_locked_sql(lock_days: int) -> sa.ColumnElement[bool]:
    """`is_close_locked` 的 SQL 版:已核准、未解鎖、結案期限已過。

    畫面把這種列顯示成「已逾期」而不是「已核准」,清單的狀態篩選要跟著同一條判定。
    """
    return sa.and_(
        Activity.status == ActivityStatus.APPROVED,
        Activity.close_unlocked.is_(False),
        close_overdue_sql(lock_days),
    )


# 經費欄顯示「自籌 / 擬請補助」,排序以兩者合計(逐項加總,無經費列為 0)
BUDGET_TOTAL_SQL = (
    sa.select(
        sa.func.coalesce(
            sa.func.sum(ActivityBudgetItem.self_fund + ActivityBudgetItem.requested_subsidy), 0
        )
    )
    .where(ActivityBudgetItem.activity_id == Activity.id)
    .correlate(Activity)
    .scalar_subquery()
)

# 狀態排序照畫面的流程順序,不是列舉字面值(VARCHAR 排出來會是 approved→closed→…)。
# 社團端與行政端清單共用:同一個「狀態」欄在兩頁點下去要排出同一個順序
STATUS_ORDER_SQL = sa.case(
    (Activity.status == ActivityStatus.DRAFT, 0),
    (
        Activity.status.in_(
            [
                ActivityStatus.PENDING_ADVISOR,
                ActivityStatus.PENDING_CHIEF,
                ActivityStatus.PENDING_DEAN,
            ]
        ),
        1,
    ),
    (Activity.status == ActivityStatus.APPROVED, 2),
    (Activity.status == ActivityStatus.CLOSING_PENDING_ADVISOR, 3),
    (Activity.status == ActivityStatus.CLOSED, 4),
    else_=5,  # rejected
)


# 清單的 status 篩的是**畫面顯示的狀態**:已核准且逾期鎖定的列顯示成「已逾期」,
# 所以 approved 不含它們,locked 是獨立的一種(推導,非 ActivityStatus 成員)。
# 社團端與行政端清單共用這一份 —— 各寫一份的話同一個標籤在兩頁會篩出不同的集合
LOCKED_STATUS = "locked"
DISPLAY_STATUSES = frozenset({s.value for s in ActivityStatus} | {LOCKED_STATUS})


def display_status_filter(values: list[str], lock_days: int) -> sa.ColumnElement[bool]:
    """把顯示狀態標籤(含推導的 locked)轉成 WHERE 條件;未知值 422。"""
    unknown = [s for s in values if s not in DISPLAY_STATUSES]
    if unknown:
        raise validation_error(f"未知的狀態:{','.join(unknown)}")
    locked = close_locked_sql(lock_days)
    conds = []
    for key in values:
        if key == LOCKED_STATUS:
            conds.append(locked)
        elif key == ActivityStatus.APPROVED:
            conds.append(sa.and_(Activity.status == ActivityStatus.APPROVED, sa.not_(locked)))
        else:
            conds.append(Activity.status == ActivityStatus(key))
    return sa.or_(*conds)


def can_close_sql(lock_days: int) -> sa.ColumnElement[bool]:
    """can_close 的 SQL 版(結案清單在 DB 端篩,不是抓回全部已核准再過濾)。

    「已結束」在 PG 以 date + time 相加成 timestamp 比對台北當下;
    「未鎖定」沿用 close_overdue_sql,兩邊的期限推導保持同源。
    """
    return sa.and_(
        Activity.status == ActivityStatus.APPROVED,
        ended_sql(),
        sa.not_(close_locked_sql(lock_days)),
    )


def can_close(activity: Activity, lock_days: int, now: datetime | None = None) -> bool:
    """結案資格:已核准且活動已結束且未被鎖定。"""
    now = now or datetime.now(UTC)
    return (
        activity.status == ActivityStatus.APPROVED
        and now >= end_datetime(activity)
        and not is_close_locked(activity, lock_days, now)
    )


def decorate(out, activity: Activity, lock_days: int) -> None:
    """填 ActivityOut 的推導欄位。"""
    items = activity.budget_items
    out.self_fund_total = sum(i.self_fund for i in items)
    out.requested_total = sum(i.requested_subsidy for i in items)
    approved = [i.approved_subsidy for i in items if i.approved_subsidy is not None]
    out.approved_total = sum(approved) if approved else None
    # 部分填寫的草稿可能無日期;日期推導欄位留空
    out.semester = semester_of(activity.date) if activity.date else ""
    out.close_locked = is_close_locked(activity, lock_days)
    base = activity.end_date or activity.date
    out.close_deadline = base + timedelta(days=int(lock_days)) if base else None
    out.can_close = can_close(activity, lock_days)
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


async def apply_approvals(
    db: AsyncSession, activity_id: int
) -> dict[str, tuple[str, datetime]]:
    """申請簽核各關最後一次核准的 (簽核者姓名, 時間);沒簽到的關卡不在字典裡。

    **以關卡取,不是把核准列依序排**:退回是回到社團重送,重送後承辦人會再核一次,
    核准列就變成 承辦人/承辦人/組長/學務長 —— 依序取會把第二次的承辦人印在「複核」、
    組長印在「決行」,而那張紙是要送出去的。同一關多次核准取最後一次。

    申請表的三格與審核彈窗的簽核章軌都讀這一份 —— 兩邊各推一次就會各錯一種。
    """
    rows = await db.execute(
        sa.select(ApprovalRecord.stage, User.name, ApprovalRecord.created_at)
        .join(User, ApprovalRecord.actor_id == User.id)
        .where(
            ApprovalRecord.subject_type == ApprovalSubject.ACTIVITY,
            ApprovalRecord.subject_id == activity_id,
            ApprovalRecord.decision == ApprovalDecision.APPROVE,
        )
        .order_by(ApprovalRecord.id)
    )
    return {stage: (name, at) for stage, name, at in rows}


async def approver_names(db: AsyncSession, activity_id: int) -> list[str]:
    """申請表 初核/複核/決行 三格的簽核者姓名;該關沒簽到就留空字串。"""
    latest = await apply_approvals(db, activity_id)
    return [latest[stage][0] if stage in latest else "" for stage in APPLY_STAGES]
