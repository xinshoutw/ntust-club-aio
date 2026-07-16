"""行政端:活動申請三關/單關簽核、結案單關審核、逾期鎖定解鎖。

簽核規則(data-model.md §3.3):
- 有申請補助(擬請補助 >0):輔導老師 → 組長 → 學務長
- 無申請補助:輔導老師單關即核准
- 第一關認定經費來源與逐項核定金額;大型活動認可(is_large_approved)亦在此關
- 退回必填原因;結案為輔導老師單關
"""

from typing import Annotated

import sqlalchemy as sa
from fastapi import APIRouter, BackgroundTasks, Depends, Query, Request

from app.api.pagination import Pagination
from app.core.deps import CurrentUser, DbDep, client_ip, require_permission
from app.core.errors import conflict, forbidden, not_found, validation_error
from app.models import Activity, ActivityReport, ApprovalRecord, Club
from app.models.enums import (
    ActivityStatus,
    ActivityType,
    ApprovalDecision,
    ApprovalSubject,
    UserRole,
)
from app.schemas.activities import ActivityDetailOut, ActivityOut
from app.schemas.admin import ApproveActivityIn, CloseApproveIn, RejectIn
from app.schemas.common import ApiResponse
from app.services import activity_service as svc
from app.services import audit, notify
from app.services.settings_service import get_setting

router = APIRouter(prefix="/admin/activities", tags=["admin"])

# 各待審狀態 → 需要的簽核關卡鍵與關卡名
_STAGE_BY_STATUS = {
    ActivityStatus.PENDING_ADVISOR: ("approve_advisor", "advisor"),
    ActivityStatus.PENDING_CHIEF: ("approve_chief", "chief"),
    ActivityStatus.PENDING_DEAN: ("approve_dean", "dean"),
}

# aact=既有後端鍵、areview=前端權限彈窗鍵(尚未統一,任一即通過);
# aclose=結案審核頁:僅持該鍵的帳號也需要讀列表/詳情(動作端點另有各自關卡檢查),
# 但視野僅限結案範圍(_visible_statuses),不得看到申請中/已退回等非結案狀態
_FULL_VIEW_KEYS = ("aact", "areview")
_REVIEW_PAGE_KEYS = (*_FULL_VIEW_KEYS, "aclose")
_REVIEW_KEYS = (*_REVIEW_PAGE_KEYS, "approve_advisor", "approve_chief", "approve_dean")


async def _reviewer(user: CurrentUser) -> CurrentUser:
    """活動審核相關頁:持審核頁權限或任一簽核關卡鍵(學務長受限帳號僅持 approve_dean)。"""
    if user.role != UserRole.ADMIN:
        raise forbidden()
    if not user.is_super and not any(k in user.permissions for k in _REVIEW_KEYS):
        raise forbidden()
    return user


Reviewer = Annotated[CurrentUser, Depends(_reviewer)]


def _require_stage_key(user, key: str) -> None:
    # 學務長關卡=本人操作:即使 super 也必須明確持有 approve_dean(避免代簽)
    if key == "approve_dean":
        if key not in user.permissions:
            raise forbidden("學務長關卡須由本人簽核")
        return
    if not user.is_super and key not in user.permissions:
        raise forbidden("沒有此簽核關卡的權限")


def _visible_statuses(user) -> set[ActivityStatus] | None:
    """受限關卡帳號只看得到自己關卡相關的狀態;None=不限(super 或持活動審核頁權限)。"""
    if user.is_super or any(k in user.permissions for k in _FULL_VIEW_KEYS):
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


async def _get_activity(db, activity_id: int, *, for_update: bool = False) -> Activity:
    query = (
        sa.select(Activity)
        .where(Activity.id == activity_id)
        .options(sa.orm.selectinload(Activity.budget_items))
    )
    if for_update:
        # 狀態轉移一律鎖列:並行核准/退回不得留下矛盾狀態與稽核
        query = query.with_for_update()
    activity = await db.scalar(query)
    if activity is None:
        raise not_found("找不到活動")
    return activity


async def _notify_decision(
    background: BackgroundTasks, db, club_id: int, kind: str, title: str, desc: str
) -> None:
    club = await db.get(Club, club_id)
    background.add_task(notify.club_event, kind, title, desc, club.discord_webhook_url)


def _record(
    db, activity: Activity, subject: ApprovalSubject, stage: str, decision, user, reason=None
):
    db.add(
        ApprovalRecord(
            subject_type=subject,
            subject_id=activity.id,
            stage=stage,
            decision=decision,
            actor_id=user.id,
            reason=reason,
        )
    )


@router.get("")
async def list_activities(
    user: Reviewer,
    db: DbDep,
    page: Pagination,
    status: ActivityStatus | None = None,
    club_id: int | None = Query(None),
) -> ApiResponse[list[ActivityOut]]:
    query = (
        sa.select(Activity, Club.name)
        .join(Club, Activity.club_id == Club.id)
        .where(Activity.status != ActivityStatus.DRAFT)  # 草稿不進審核視野
        .options(sa.orm.selectinload(Activity.budget_items))
        .order_by(Activity.id.desc())
    )
    visible = _visible_statuses(user)
    if visible is not None:
        query = query.where(Activity.status.in_(visible))
    if status:
        query = query.where(Activity.status == status)
    if club_id:
        query = query.where(Activity.club_id == club_id)
    total = await db.scalar(sa.select(sa.func.count()).select_from(query.subquery()))
    rows = (await db.execute(query.offset(page.offset).limit(page.page_size))).all()
    lock_months = await get_setting(db, "close_lock_months")
    data = []
    for activity, club_name in rows:
        out = ActivityOut.model_validate(activity)
        svc.decorate(out, activity, lock_months)
        out.club_name = club_name
        data.append(out)
    return ApiResponse(data=data, meta=page.meta(total or 0))


@router.get("/{activity_id}")
async def get_activity(
    activity_id: int, user: Reviewer, db: DbDep
) -> ApiResponse[ActivityDetailOut]:
    from app.models import ActivityReport
    from app.schemas.activities import ApprovalOut, FileOut

    activity = await db.scalar(
        sa.select(Activity)
        .where(Activity.id == activity_id)
        .options(
            sa.orm.selectinload(Activity.budget_items),
            sa.orm.selectinload(Activity.report).selectinload(ActivityReport.reflections),
        )
    )
    if activity is None:
        raise not_found("找不到活動")
    visible = _visible_statuses(user)
    if visible is not None and activity.status not in visible:
        raise not_found("找不到活動")  # 受限關卡帳號視同不存在,避免探測
    lock_months = await get_setting(db, "close_lock_months")
    out = ActivityDetailOut.model_validate(activity)
    svc.decorate(out, activity, lock_months)
    club = await db.get(Club, activity.club_id)
    out.club_name = club.name if club else ""
    out.photos = [
        FileOut.model_validate(f) for f in await svc.activity_files(db, activity, svc.PHOTO_SLOT)
    ]
    out.attachments = [
        FileOut.model_validate(f)
        for f in await svc.activity_files(db, activity, svc.ATTACHMENT_SLOT)
    ]
    approvals = await db.scalars(
        sa.select(ApprovalRecord)
        .where(
            ApprovalRecord.subject_type.in_(
                [ApprovalSubject.ACTIVITY, ApprovalSubject.ACTIVITY_CLOSE]
            ),
            ApprovalRecord.subject_id == activity.id,
        )
        .order_by(ApprovalRecord.id)
    )
    out.approvals = [ApprovalOut.model_validate(r) for r in approvals]
    return ApiResponse(data=out)


@router.post("/{activity_id}/approve")
async def approve(
    activity_id: int,
    body: ApproveActivityIn,
    user: Reviewer,
    db: DbDep,
    request: Request,
    background: BackgroundTasks,
) -> ApiResponse[ActivityOut]:
    activity = await _get_activity(db, activity_id, for_update=True)
    stage_info = _STAGE_BY_STATUS.get(activity.status)
    if stage_info is None:
        raise conflict("此活動不在待審狀態")
    key, stage = stage_info
    _require_stage_key(user, key)

    requested_total = sum(i.requested_subsidy for i in activity.budget_items)
    if stage == "advisor":
        # 第一關:經費來源、逐項核定、大型活動認可
        if body.fund_source is not None:
            activity.fund_source = body.fund_source
        items_by_id = {i.id: i for i in activity.budget_items}
        for approval in body.budget:
            item = items_by_id.get(approval.item_id)
            if item is None:
                raise validation_error("核定金額對應的經費項目不存在")
            item.approved_subsidy = approval.approved_subsidy
        if requested_total > 0:
            # 有申請補助:經費來源必填、每個項目都要有核定金額,總額由後端加總
            if not activity.fund_source:
                raise validation_error("有申請補助的案件必須認定經費來源")
            missing = [i for i in activity.budget_items if i.approved_subsidy is None]
            if missing:
                raise validation_error("尚有經費項目未核定金額")
        # 大型活動認可:實心=已認可(含未申請但管理員逕行核定,2026-07-15 第七輪)
        if body.is_large_approved:
            if activity.type != ActivityType.EVENT:
                raise validation_error("僅類型為「活動」的案件可認定為大型活動")
            activity.is_large = True  # 未申請由管理員逕行核定
            activity.is_large_approved = True
        elif activity.is_large:
            activity.is_large_approved = (
                body.is_large_approved if body.is_large_approved is not None else False
            )
        activity.school_approved = sum(
            i.approved_subsidy for i in activity.budget_items if i.approved_subsidy is not None
        )

    if stage == "advisor" and requested_total > 0:
        activity.status = ActivityStatus.PENDING_CHIEF
    elif stage == "chief":
        activity.status = ActivityStatus.PENDING_DEAN
    else:  # advisor 無補助單關,或 dean 終關
        activity.status = ActivityStatus.APPROVED

    _record(db, activity, ApprovalSubject.ACTIVITY, stage, ApprovalDecision.APPROVE, user)
    audit.record(
        db,
        action="activity_approved",
        user=user,
        detail=f"activity={activity.id};stage={stage}",
        ip=client_ip(request),
    )
    await db.commit()

    final = activity.status == ActivityStatus.APPROVED
    await _notify_decision(
        background,
        db,
        activity.club_id,
        "approve" if final else "submit",
        "活動申請已核准" if final else "活動申請通過關卡",
        f"{activity.name}(關卡:{stage})",
    )
    lock_months = await get_setting(db, "close_lock_months")
    out = ActivityOut.model_validate(activity)
    svc.decorate(out, activity, lock_months)
    return ApiResponse(data=out)


@router.post("/{activity_id}/reject")
async def reject(
    activity_id: int,
    body: RejectIn,
    user: Reviewer,
    db: DbDep,
    request: Request,
    background: BackgroundTasks,
) -> ApiResponse[None]:
    activity = await _get_activity(db, activity_id, for_update=True)
    stage_info = _STAGE_BY_STATUS.get(activity.status)
    if stage_info is None:
        raise conflict("此活動不在待審狀態")
    key, stage = stage_info
    _require_stage_key(user, key)

    activity.status = ActivityStatus.REJECTED
    _record(
        db, activity, ApprovalSubject.ACTIVITY, stage, ApprovalDecision.REJECT, user, body.reason
    )
    audit.record(
        db,
        action="activity_rejected",
        user=user,
        detail=f"activity={activity.id};stage={stage}",
        ip=client_ip(request),
    )
    await db.commit()
    await _notify_decision(
        background,
        db,
        activity.club_id,
        "reject",
        "活動申請退回",
        f"{activity.name}:{body.reason}",
    )
    return ApiResponse()


@router.post("/{activity_id}/close-approve")
async def close_approve(
    activity_id: int,
    user: Reviewer,
    db: DbDep,
    request: Request,
    background: BackgroundTasks,
    body: CloseApproveIn | None = None,
) -> ApiResponse[None]:
    activity = await _get_activity(db, activity_id, for_update=True)
    if activity.status != ActivityStatus.CLOSING_PENDING_ADVISOR:
        raise conflict("此活動不在結案待審狀態")
    _require_stage_key(user, "approve_advisor")  # 結案:輔導老師單關

    activity.status = ActivityStatus.CLOSED
    # 繳交確認:未確認之項目評鑑以 0 分計(寫入 report,scoring 讀取)
    if body is not None:
        report = await db.get(ActivityReport, activity.id)
        if report is not None:
            report.photos_confirmed = body.photos_confirmed
            report.report_confirmed = body.report_confirmed
            report.reflections_confirmed = body.reflections_confirmed
    _record(db, activity, ApprovalSubject.ACTIVITY_CLOSE, "advisor", ApprovalDecision.APPROVE, user)
    audit.record(
        db,
        action="activity_close_approved",
        user=user,
        detail=f"activity={activity.id}",
        ip=client_ip(request),
    )
    await db.commit()
    await _notify_decision(
        background, db, activity.club_id, "approve", "活動結案已核准", activity.name
    )
    return ApiResponse()


@router.post("/{activity_id}/close-reject")
async def close_reject(
    activity_id: int,
    body: RejectIn,
    user: Reviewer,
    db: DbDep,
    request: Request,
    background: BackgroundTasks,
) -> ApiResponse[None]:
    activity = await _get_activity(db, activity_id, for_update=True)
    if activity.status != ActivityStatus.CLOSING_PENDING_ADVISOR:
        raise conflict("此活動不在結案待審狀態")
    _require_stage_key(user, "approve_advisor")

    activity.status = ActivityStatus.APPROVED  # 退回 → 可修正後重送結案
    _record(
        db,
        activity,
        ApprovalSubject.ACTIVITY_CLOSE,
        "advisor",
        ApprovalDecision.REJECT,
        user,
        body.reason,
    )
    audit.record(
        db,
        action="activity_close_rejected",
        user=user,
        detail=f"activity={activity.id}",
        ip=client_ip(request),
    )
    await db.commit()
    await _notify_decision(
        background,
        db,
        activity.club_id,
        "reject",
        "活動結案退回",
        f"{activity.name}:{body.reason}",
    )
    return ApiResponse()


@router.post("/{activity_id}/unlock", dependencies=[Depends(require_permission("aclose"))])
async def unlock(
    activity_id: int,
    user: CurrentUser,
    db: DbDep,
    request: Request,
    background: BackgroundTasks,
) -> ApiResponse[None]:
    activity = await _get_activity(db, activity_id, for_update=True)
    if activity.status != ActivityStatus.APPROVED:
        raise conflict("僅已核准且未結案的活動可解鎖")
    lock_months = await get_setting(db, "close_lock_months")
    if not svc.is_close_locked(activity, lock_months):
        # 未逾期不得預先解鎖,否則永久繞過結案鎖定
        raise conflict("此活動尚未逾期鎖定,無需解鎖")
    activity.close_unlocked = True
    _record(db, activity, ApprovalSubject.ACTIVITY_CLOSE, "advisor", ApprovalDecision.UNLOCK, user)
    audit.record(
        db,
        action="activity_close_unlocked",
        user=user,
        detail=f"activity={activity.id}",
        ip=client_ip(request),
    )
    await db.commit()
    await _notify_decision(
        background, db, activity.club_id, "alert", "結案鎖定已解除", activity.name
    )
    return ApiResponse()
