"""側欄徽章:每個角色「還等著誰動作」的筆數。

只給**有時效性、或在等使用者下一步**的頁面出數字 —— 主檔維護、查詢型清單一律不給,
徽章一多就沒有人會看。定義與該頁的預設漏斗一致,否則側欄說 3 筆、點進去看到 5 筆;
申請審核算的是**簽得下去**的關卡(`actionable_statuses`),與待審佇列同一集合。

一個角色一次 SELECT:每個徽章是一個純量子查詢,往返次數不隨項目數成長。
鍵名即前端 nav item 的 key,前端不需要第二份對照表。
"""

from datetime import UTC, datetime

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.semesters import TAIPEI
from app.models import (
    Activity,
    EquipmentLoan,
    EvalGroup,
    EvalGroupClub,
    EvalGroupReviewer,
    File,
    MaintenanceRequest,
    OfficerCertificate,
    PostalAccountChange,
    ReviewScore,
    RoomBookingRequest,
    Signup,
    SignupItem,
    User,
    VenueBooking,
    Violation,
)
from app.models.enums import (
    ActivityStatus,
    ApplicationStatus,
    BookingStatus,
    LoanStatus,
    MaintenanceStatus,
    UserRole,
    ViolationStatus,
)
from app.services import booking_service as svc
from app.services.activity_service import actionable_statuses, can_close_sql
from app.services.evaluation import get_eval_window
from app.services.settings_service import get_setting

# 報修與郵局異動的佐證必附,但兩段式流程只能由列表收口(decisions.md D-06):
# 0 份的單要社團自己回來補傳,那正是「等使用者下一步」
_MAINTENANCE_SUBJECT = "maintenance"
_POSTAL_SUBJECT = "postal_change"


def _count(*where: sa.ColumnElement[bool], of: type) -> sa.ScalarSelect[int]:
    return (
        sa.select(sa.func.count()).select_from(of).where(*where).scalar_subquery()
    )


def _missing_attachment(subject: str, model: type) -> sa.ColumnElement[bool]:
    """這張單一份佐證都沒有(已歸檔的不算,與上傳守衛同一條判準)。"""
    return sa.not_(
        sa.exists().where(
            File.subject_type == subject,
            File.subject_id == model.id,
            File.archived_at.is_(None),
        )
    )


async def _overdue_loan_filter(db: AsyncSession) -> sa.ColumnElement[bool]:
    """逾期未還:與工讀生端、行政端逾期清單同一條門檻日判定。"""
    return_time = await get_setting(db, "equipment_return_time")
    holidays = await svc.load_holidays(db)
    threshold = svc.overdue_threshold_in(datetime.now(UTC), return_time, holidays)
    return sa.and_(
        EquipmentLoan.status == LoanStatus.CHECKED_OUT,
        EquipmentLoan.end_date <= threshold,
    )


async def _club(db: AsyncSession, club_id: int, lock_days: int) -> dict[str, int]:
    today = datetime.now(TAIPEI).date()
    now = datetime.now(TAIPEI)
    mine = Activity.club_id == club_id

    columns = {
        # 活動結案:已結束、未鎖定、還沒送出結案
        "act-close": _count(mine, can_close_sql(lock_days), of=Activity),
        # 活動列表:被退回,等社團修改重送
        "act-list": _count(mine, Activity.status == ActivityStatus.REJECTED, of=Activity),
        # 借用總覽:已核准待領取 + 借出中已逾期
        "booking-overview": _count(
            EquipmentLoan.club_id == club_id,
            sa.or_(
                sa.and_(
                    EquipmentLoan.status == LoanStatus.APPROVED,
                    EquipmentLoan.end_date >= today,
                ),
                await _overdue_loan_filter(db),
            ),
            of=EquipmentLoan,
        ),
        # 線上報名:受理中且本社還沒報名
        "signup": _count(
            SignupItem.is_open.is_(True),
            SignupItem.signup_start <= now,
            sa.or_(SignupItem.signup_end.is_(None), SignupItem.signup_end >= now),
            sa.not_(
                sa.exists().where(Signup.item_id == SignupItem.id, Signup.club_id == club_id)
            ),
            of=SignupItem,
        ),
        # 報修 / 郵局:未完成且一份佐證都沒有 → 要回來補傳
        "maintenance": _count(
            MaintenanceRequest.club_id == club_id,
            MaintenanceRequest.status != MaintenanceStatus.DONE,
            _missing_attachment(_MAINTENANCE_SUBJECT, MaintenanceRequest),
            of=MaintenanceRequest,
        ),
        "postal": _count(
            PostalAccountChange.club_id == club_id,
            PostalAccountChange.status != ApplicationStatus.COMPLETED,
            _missing_attachment(_POSTAL_SUBJECT, PostalAccountChange),
            of=PostalAccountChange,
        ),
        # 違規勸導:未結案,等社團改善
        "violations": _count(
            Violation.club_id == club_id,
            Violation.status == ViolationStatus.OPEN,
            of=Violation,
        ),
    }
    return await _run(db, columns)


async def _admin(db: AsyncSession, user: User, lock_days: int) -> dict[str, int]:
    """受限管理員只拿得到自己看得到的頁面 —— 徽章也是資料量,不對無權限者揭露。"""
    # 徽章=待審佇列的筆數,不是「看得到幾件」:只持 areview 的帳號看得到全部卻一件也簽不了,
    # 那個差額正是它無權過問的件數(services/activity_service.actionable_statuses)
    columns = {
        "a-review": _count(Activity.status.in_(actionable_statuses(user)), of=Activity),
        "a-close": _count(
            Activity.status == ActivityStatus.CLOSING_PENDING_ADVISOR, of=Activity
        ),
        "a-booking": _count(VenueBooking.status == BookingStatus.PENDING, of=VenueBooking),
        "a-room": _count(
            RoomBookingRequest.status == BookingStatus.PENDING, of=RoomBookingRequest
        ),
        "a-overdue": _count(await _overdue_loan_filter(db), of=EquipmentLoan),
        "a-certificates": _count(
            OfficerCertificate.status == ApplicationStatus.PENDING, of=OfficerCertificate
        ),
        "a-postal": _count(
            PostalAccountChange.status == ApplicationStatus.PENDING, of=PostalAccountChange
        ),
        "a-maintenance": _count(
            MaintenanceRequest.status == MaintenanceStatus.PENDING, of=MaintenanceRequest
        ),
        "a-violations": _count(Violation.status == ViolationStatus.OPEN, of=Violation),
    }
    # 器材待審與臨時場地待審共用同一個側欄項目
    loans_pending = _count(EquipmentLoan.status == LoanStatus.PENDING, of=EquipmentLoan)
    allowed = {k: v for k, v in columns.items() if _may_see(user, k)}
    counts = await _run(db, allowed)
    if "a-booking" in allowed:
        counts["a-booking"] += await db.scalar(sa.select(loans_pending)) or 0
    return counts


# 側欄項目 key → 該頁的權限鍵(core.permissions.ADMIN_PAGES)
_ADMIN_KEYS = {
    "a-review": ("areview", "approve_advisor", "approve_chief", "approve_dean"),
    "a-close": ("aclose", "approve_advisor"),
    "a-booking": ("abooking",),
    "a-room": ("aroom",),
    "a-overdue": ("aoverdue",),
    "a-certificates": ("acert",),
    "a-postal": ("apostal",),
    "a-maintenance": ("amaint",),
    "a-violations": ("aviol",),
}


def _may_see(user: User, key: str) -> bool:
    return user.is_super or any(k in user.permissions for k in _ADMIN_KEYS[key])


async def _staff(db: AsyncSession) -> dict[str, int]:
    today = datetime.now(TAIPEI).date()
    columns = {
        # 借出點交:已核准、區間還沒過去
        "pt-checkout": _count(
            EquipmentLoan.status == LoanStatus.APPROVED,
            EquipmentLoan.end_date >= today,
            of=EquipmentLoan,
        ),
        "pt-checkin": _count(EquipmentLoan.status == LoanStatus.CHECKED_OUT, of=EquipmentLoan),
        "pt-overdue": _count(await _overdue_loan_filter(db), of=EquipmentLoan),
    }
    return await _run(db, columns)


async def _viewer(db: AsyncSession, user: User) -> dict[str, int]:
    """待評分:被指派的(分組 × 獎項 × 社團)還沒有我的分數。"""
    window = await get_eval_window(db)
    assigned = (
        sa.select(sa.func.count())
        .select_from(EvalGroup)
        .join(EvalGroupReviewer, EvalGroupReviewer.group_id == EvalGroup.id)
        .join(EvalGroupClub, EvalGroupClub.group_id == EvalGroup.id)
        .where(
            EvalGroup.year == window.year,
            EvalGroupReviewer.user_id == user.id,
            sa.not_(
                sa.exists().where(
                    ReviewScore.year == window.year,
                    ReviewScore.award_id == EvalGroup.award_id,
                    ReviewScore.club_id == EvalGroupClub.club_id,
                    ReviewScore.reviewer_id == user.id,
                )
            ),
        )
        .scalar_subquery()
    )
    return await _run(db, {"v-my": assigned, "v-score": assigned})


async def _run(db: AsyncSession, columns: dict[str, sa.ScalarSelect[int]]) -> dict[str, int]:
    """一次往返取回全部;沒有徽章的角色不打 DB。"""
    if not columns:
        return {}
    keys = list(columns)
    row = (await db.execute(sa.select(*(columns[k] for k in keys)))).one()
    return {k: int(v or 0) for k, v in zip(keys, row, strict=True)}


async def for_user(db: AsyncSession, user: User) -> dict[str, int]:
    """該使用者側欄的徽章數;0 也照回,前端才知道是「沒有待辦」而不是「還沒算」。"""
    match user.role:
        case UserRole.CLUB if user.club_id is not None:
            lock_days = int(await get_setting(db, "close_lock_days"))
            return await _club(db, user.club_id, lock_days)
        case UserRole.ADMIN:
            lock_days = int(await get_setting(db, "close_lock_days"))
            return await _admin(db, user, lock_days)
        case UserRole.STAFF:
            return await _staff(db)
        case UserRole.VIEWER:
            return await _viewer(db, user)
        case _:
            return {}
