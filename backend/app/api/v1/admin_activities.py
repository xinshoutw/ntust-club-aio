"""行政端:活動申請三關/單關簽核、結案單關審核、逾期鎖定解鎖。

簽核規則(data-model.md §3.3;2026-07-21 需求方拍板第一關顯示詞改「承辦人」,程式鍵 advisor 不變):
- 有申請補助(擬請補助 >0):承辦人 → 組長 → 學務長
- 無申請補助:承辦人單關即核准
- 第一關認定經費來源與逐項核定金額;大型活動認可(is_large_approved)亦在此關
- 退回必填原因;結案為承辦人單關
"""

from typing import Annotated

import sqlalchemy as sa
from fastapi import APIRouter, BackgroundTasks, Depends, Query, Request, Response
from starlette.concurrency import run_in_threadpool

from app.api.pagination import NullsLast, Pagination, parse_sort
from app.core.deps import CurrentUser, DbDep, client_ip, require_permission
from app.core.errors import conflict, forbidden, not_found, validation_error
from app.core.semesters import semester_of, semester_range
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
from app.services import audit, notify, pdf
from app.services.settings_service import get_setting

router = APIRouter(prefix="/admin/activities", tags=["admin"])

# 各待審狀態 → 需要的簽核關卡鍵與關卡名
_STAGE_BY_STATUS = {
    ActivityStatus.PENDING_ADVISOR: ("approve_advisor", "advisor"),
    ActivityStatus.PENDING_CHIEF: ("approve_chief", "chief"),
    ActivityStatus.PENDING_DEAN: ("approve_dean", "dean"),
}

# 通知文案的關卡顯示詞(Discord 對外顯示,不得漏出英文鍵)
_STAGE_LABEL = {"advisor": "承辦人", "chief": "組長", "dean": "學務長"}

# aclose=結案審核頁:僅持該鍵的帳號也需要讀列表/詳情(動作端點另有各自關卡檢查),
# 但視野僅限結案範圍(svc.visible_statuses),不得看到申請中/已退回等非結案狀態
_FULL_VIEW_KEYS = svc.FULL_VIEW_KEYS
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


def _require_close_key(user) -> None:
    """結案核准與退回:`aclose` 或結案單關的 `approve_advisor` 皆可(decisions.md D-08)。

    原本只認 `approve_advisor`,結果只持結案審核鍵的帳號進得了頁面卻按不了核准 ——
    一頁一件事,能看就要能簽。
    """
    if user.is_super:
        return
    if not any(k in user.permissions for k in ("aclose", "approve_advisor")):
        raise forbidden("沒有結案審核的權限")


def _require_stage_key(user, key: str) -> None:
    # 學務長關卡=本人操作:即使 super 也必須明確持有 approve_dean(避免代簽)
    if key == "approve_dean":
        if key not in user.permissions:
            raise forbidden("學務長關卡須由本人簽核")
        return
    if not user.is_super and key not in user.permissions:
        raise forbidden("沒有此簽核關卡的權限")


_PREVIOUS_STAGE = {"chief": "advisor", "dean": "chief"}


async def _require_different_actor(db, activity: Activity, stage: str, user) -> None:
    """相鄰關卡不得由同一人簽核。

    列鎖只擋得住同一關被重放;同時持 approve_advisor + approve_chief 的帳號連按兩次
    就會走完 advisor → chief,組長關照樣寫一筆 actor 是同一人的紀錄。super 一樣適用
    —— 現行 _require_stage_key 讓 super 直通這兩關,反而是最容易發生的路徑。
    """
    previous = _PREVIOUS_STAGE.get(stage)
    if previous is None:
        return
    actor_id = await db.scalar(
        sa.select(ApprovalRecord.actor_id)
        .where(
            ApprovalRecord.subject_type == ApprovalSubject.ACTIVITY,
            ApprovalRecord.subject_id == activity.id,
            ApprovalRecord.stage == previous,
            ApprovalRecord.decision == ApprovalDecision.APPROVE,
        )
        .order_by(ApprovalRecord.id.desc())
        .limit(1)
    )
    if actor_id == user.id:
        raise forbidden(
            f"「{_STAGE_LABEL[previous]}」關卡已由本人簽核,不得再簽「{_STAGE_LABEL[stage]}」",
            code="SAME_ACTOR",
        )


def _require_visible(user, activity: Activity) -> None:
    """詳情與 PDF 的視野界線,與清單同一條(一律 404,避免探測)。

    **草稿也在這條界線內**:社團還沒送出的東西承辦看不到,清單的
    `status != DRAFT` 若只擋清單,直接打 `/admin/activities/{id}` 就繞過去了。
    """
    if activity.status == ActivityStatus.DRAFT:
        raise not_found("找不到活動")
    visible = svc.visible_statuses(user)
    if visible is not None and activity.status not in visible:
        raise not_found("找不到活動")


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


# 類型篩選標籤(前端 FilterButton;「大型活動」=類型活動且已認可或申請中未被否准)
_TYPE_LABELS = ("社課或會議", "活動", "大型活動")

# 名稱搜尋的 LIKE 跳脫表(escape 字元為反斜線)
_LIKE_ESCAPE = str.maketrans({"\\": "\\\\", "%": "\\%", "_": "\\_"})

# 最近審核時間:該活動申請/結案簽核紀錄的 max(created_at)。
# 彙總子查詢一次算完再 outerjoin(相關子查詢當 ORDER BY 會對過濾集逐列執行,
# 「最近審核」預設排序整個歷史集都吃,抵銷伺服器分頁的效益)
_REVIEWED_SUBQ = (
    sa.select(
        ApprovalRecord.subject_id.label("subject_id"),
        sa.func.max(ApprovalRecord.created_at).label("reviewed_at"),
    )
    .where(
        ApprovalRecord.subject_type.in_([ApprovalSubject.ACTIVITY, ApprovalSubject.ACTIVITY_CLOSE])
    )
    .group_by(ApprovalRecord.subject_id)
    .subquery("last_review")
)
_REVIEWED_AT = _REVIEWED_SUBQ.c.reviewed_at

# 排序白名單(伺服器端分頁;14k+ 筆不得整批撈取);
# reviewed_at 包 NullsLast:不論鍵位/升降冪皆 NULLS LAST(無審核紀錄者殿後),
# 出現於任一鍵位時 list_activities 另補 id 降冪 tiebreak
_SORTABLE = {
    "club": Club.name,
    "name": Activity.name,
    "type": Activity.type,
    "date": Activity.date,
    # 經費與狀態的排序運算式與社團端同一份:同一個欄名在兩頁要排出同一個順序
    "budget": svc.BUDGET_TOTAL_SQL,
    "status": svc.STATUS_ORDER_SQL,
    "created_at": Activity.created_at,
    "reviewed_at": NullsLast(_REVIEWED_AT),
}


def _large_condition():
    """「大型活動」的伺服器端定義(與前端 typeKey 同規則):
    類型=活動 且(已認可 或 申請中未被否准)。"""
    return sa.and_(
        Activity.type == ActivityType.EVENT,
        sa.or_(
            Activity.is_large_approved.is_(True),
            sa.and_(Activity.is_large.is_(True), Activity.is_large_approved.isnot(False)),
        ),
    )


@router.get("")
async def list_activities(
    user: Reviewer,
    db: DbDep,
    page: Pagination,
    semester: str | None = Query(None, pattern=r"^\d{3}-[12]$"),
    status: Annotated[list[str] | None, Query()] = None,
    club_id: Annotated[list[int] | None, Query()] = None,
    type_: Annotated[list[str] | None, Query(alias="type")] = None,
    q: Annotated[str | None, Query(max_length=100)] = None,
    locked: bool = Query(False),
    overdue: bool = Query(False),
    sort: str | None = None,
) -> ApiResponse[list[ActivityOut]]:
    # status/club_id/type 可重複帶多值;status 收的是**顯示狀態**(另有推導的 locked,
    # 與社團端同一份 svc.display_status_filter);q 以活動名稱模糊搜尋;
    # locked=true 僅回逾期鎖定(已核准+超過結案期限+未解鎖);
    # overdue=true 回全部逾期未結案(不分是否已解鎖,結案審核頁逾期表);
    # sort 走白名單(預設 id 降冪)——清單一律伺服器端分頁
    query = (
        sa.select(Activity, Club.name)
        .join(Club, Activity.club_id == Club.id)
        .where(Activity.status != ActivityStatus.DRAFT)  # 草稿不進審核視野
        .options(sa.orm.selectinload(Activity.budget_items))
    )
    visible = svc.visible_statuses(user)
    if visible is not None:
        query = query.where(Activity.status.in_(visible))
    lock_days = await get_setting(db, "close_lock_days")
    if status:
        query = query.where(svc.display_status_filter(status, lock_days))
    if semester:
        start, end = semester_range(semester)
        query = query.where(Activity.date >= start, Activity.date <= end)
    if q and q.strip():
        # 跳脫 LIKE 的萬用字元:搜「100%」是字面的百分號,不是「100 開頭的任何字」
        needle = q.strip().translate(_LIKE_ESCAPE)
        query = query.where(Activity.name.ilike(f"%{needle}%", escape="\\"))
    if club_id:
        query = query.where(Activity.club_id.in_(club_id))
    if type_:
        unknown = [t for t in type_ if t not in _TYPE_LABELS]
        if unknown:
            raise validation_error(f"未知的類型:{','.join(unknown)}")
        conds = []
        if "社課或會議" in type_:
            conds.append(Activity.type == ActivityType.COURSE_MEETING)
        if "活動" in type_:
            conds.append(sa.and_(Activity.type == ActivityType.EVENT, sa.not_(_large_condition())))
        if "大型活動" in type_:
            conds.append(_large_condition())
        query = query.where(sa.or_(*conds))
    may_see_approved = visible is None or ActivityStatus.APPROVED in visible
    if (locked or overdue) and not may_see_approved:
        # 逾期未結案全是 approved 狀態。看不到 approved 的帳號(例如只持 approve_advisor)
        # 原本會拿到空清單,畫面顯示「0 件」—— 承辦以為真的沒有逾期案件
        raise forbidden("沒有檢視逾期未結案的權限")
    if locked or overdue:
        # locked 僅未解鎖者,overdue 不分鎖定與否(是否鎖定由回應的 close_locked 區分)
        query = query.where(
            Activity.status == ActivityStatus.APPROVED,
            svc.close_overdue_sql(lock_days),
        )
        if locked:
            query = query.where(Activity.close_unlocked.is_(False))
    order = parse_sort(sort, _SORTABLE, Activity.id.desc())
    if sort:
        # 固定 id 降冪 tiebreak:任何使用者排序鍵(狀態/類型/日期…)都可能大量同值,
        # 無穩定全序時獨立 OFFSET 分頁會在換頁間重複/漏列
        order = [*order, Activity.id.desc()]
    total = await db.scalar(sa.select(sa.func.count()).select_from(query.subquery()))
    # 彙總 join 於計數後才加進查詢(count 不需要 reviewed_at)
    query = (
        query.outerjoin(_REVIEWED_SUBQ, _REVIEWED_SUBQ.c.subject_id == Activity.id)
        .add_columns(_REVIEWED_AT.label("reviewed_at"))
        .order_by(*order)
    )
    rows = (await db.execute(query.offset(page.offset).limit(page.page_size))).all()
    data = []
    for activity, club_name, reviewed_at in rows:
        out = ActivityOut.model_validate(activity)
        svc.decorate(out, activity, lock_days)
        out.club_name = club_name
        out.reviewed_at = reviewed_at
        data.append(out)
    return ApiResponse(data=data, meta=page.meta(total or 0))


# 必須宣告在 /{activity_id} 之前,否則 "semesters" 會被當成路徑參數吃掉(422)
@router.get("/semesters")
async def list_semesters(
    user: Reviewer, db: DbDep, club_id: int | None = None
) -> ApiResponse[list[str]]:
    """有活動的學期(新到舊),供學期下拉;帶 club_id 則限該社。

    界線與清單同一條:草稿不算,受限關卡帳號也只數得到自己看得到的狀態 ——
    下拉列得出來的學期,清單就查得到東西。
    """
    query = (
        sa.select(Activity.date)
        .where(Activity.status != ActivityStatus.DRAFT, Activity.date.is_not(None))
        .distinct()
    )
    visible = svc.visible_statuses(user)
    if visible is not None:
        query = query.where(Activity.status.in_(visible))
    if club_id is not None:
        query = query.where(Activity.club_id == club_id)
    dates = await db.scalars(query)
    return ApiResponse(data=sorted({semester_of(d) for d in dates}, reverse=True))


@router.get("/{activity_id}/apply-pdf")
async def download_apply_pdf(activity_id: int, user: Reviewer, db: DbDep) -> Response:
    """社團活動申請表 PDF;與詳情同一條視野界線(草稿看不到,其餘不分狀態皆可)。"""
    activity = await db.scalar(
        sa.select(Activity)
        .where(Activity.id == activity_id)
        .options(
            sa.orm.selectinload(Activity.budget_items),
            sa.orm.selectinload(Activity.report),
        )
    )
    if activity is None:
        raise not_found("找不到活動")
    _require_visible(user, activity)
    club = await db.get(Club, activity.club_id)
    approvers = await svc.approver_names(db, activity.id)
    content = await run_in_threadpool(pdf.apply_pdf, club, activity, approvers)
    return pdf.pdf_response(content, f"{club.name}_{activity.name}_社團活動申請表.pdf")


@router.get("/{activity_id}")
async def get_activity(
    activity_id: int, user: Reviewer, db: DbDep
) -> ApiResponse[ActivityDetailOut]:
    from app.models import ActivityReport
    from app.schemas.activities import ApprovalOut, FileOut, StampOut

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
    _require_visible(user, activity)
    lock_days = await get_setting(db, "close_lock_days")
    out = ActivityDetailOut.model_validate(activity)
    svc.decorate(out, activity, lock_days)
    club = await db.get(Club, activity.club_id)
    out.club_name = club.name if club else ""
    out.photos = [
        FileOut.model_validate(f) for f in await svc.activity_files(db, activity, svc.PHOTO_SLOT)
    ]
    out.attachments = [
        FileOut.model_validate(f)
        for f in await svc.activity_files(db, activity, svc.ATTACHMENT_SLOT)
    ]
    approvals = (
        await db.scalars(
            sa.select(ApprovalRecord)
            .where(
                ApprovalRecord.subject_type.in_(
                    [ApprovalSubject.ACTIVITY, ApprovalSubject.ACTIVITY_CLOSE]
                ),
                ApprovalRecord.subject_id == activity.id,
            )
            .order_by(ApprovalRecord.id)
        )
    ).all()
    out.approvals = [ApprovalOut.model_validate(r) for r in approvals]
    out.reviewed_at = max((r.created_at for r in approvals), default=None)
    # 簽核章軌:每一關印誰、什麼時候簽的(推導規則在 services,前端不再自己數一次)
    stamped = await svc.apply_approvals(db, activity.id)
    out.stamps = [
        StampOut(stage=stage, actor_name=stamped[stage][0], at=stamped[stage][1])
        for stage in svc.APPLY_STAGES
        if stage in stamped
    ]
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
    await _require_different_actor(db, activity, stage, user)

    requested_total = sum(i.requested_subsidy for i in activity.budget_items)
    if stage == "advisor":
        # 第一關:經費來源、逐項核定、大型活動認可
        if requested_total == 0 and any(a.approved_subsidy for a in body.budget):
            # 無補助案是承辦人單關即核准,不經組長與學務長 —— 核定金額必須維持 0
            raise validation_error("未申請補助的案件不得核定補助金額")
        if body.fund_source is not None:
            activity.fund_source = body.fund_source
        items_by_id = {i.id: i for i in activity.budget_items}
        for approval in body.budget:
            item = items_by_id.get(approval.item_id)
            if item is None:
                raise validation_error("核定金額對應的經費項目不存在")
            # 核定不得高於社團擬請(decisions.md D-03)。前端的 InputNumber max
            # 只擋鍵入,直接呼叫 API 原本可以填任意金額
            if approval.approved_subsidy is not None and (
                approval.approved_subsidy > item.requested_subsidy
            ):
                raise validation_error(
                    f"「{item.category}」核定 {approval.approved_subsidy} 元高於擬請補助"
                    f" {item.requested_subsidy} 元",
                    code="APPROVED_OVER_REQUESTED",
                )
            item.approved_subsidy = approval.approved_subsidy
        if requested_total > 0:
            # 有申請補助:經費來源必填、每個項目都要有核定金額,總額由後端加總
            if not activity.fund_source:
                raise validation_error("有申請補助的案件必須認定經費來源")
            missing = [i for i in activity.budget_items if i.approved_subsidy is None]
            if missing:
                raise validation_error("尚有經費項目未核定金額")
        if requested_total == 0:
            # 逐項一併歸零:畫面的 approved_total 是逐項加總來的,只清聚合欄位
            # 會讓兩個金額來源對不起來(遷移資料就可能是擬請 0 元卻有核定值)
            for item in activity.budget_items:
                item.approved_subsidy = 0
            activity.school_approved = 0
        else:
            activity.school_approved = sum(
                i.approved_subsidy for i in activity.budget_items if i.approved_subsidy is not None
            )

    # 大型活動認可:實心=已認可(含未申請但管理員逕行核定)。
    #
    # 第一關是認定點,沒勾就是否准;**但後續關卡仍改得動**(decisions.md ISS-54)——
    # 只在第一關寫入的話,承辦人忘了勾就永久固化為「否准」,連退回重送都補不回來,
    # 而大型活動一次算 3 分行政分。後兩關省略欄位=不動,否則送空 body 會把認可清掉。
    if body.is_large_approved:
        if activity.type != ActivityType.EVENT:
            raise validation_error("僅類型為「活動」的案件可認定為大型活動")
        activity.is_large = True  # 未申請由管理員逕行核定
        activity.is_large_approved = True
    elif body.is_large_approved is False or stage == "advisor":
        activity.is_large_approved = False

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
        f"{activity.name}(關卡:{_STAGE_LABEL.get(stage, stage)})",
    )
    lock_days = await get_setting(db, "close_lock_days")
    out = ActivityOut.model_validate(activity)
    svc.decorate(out, activity, lock_days)
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
    body: CloseApproveIn,
) -> ApiResponse[None]:
    activity = await _get_activity(db, activity_id, for_update=True)
    if activity.status != ActivityStatus.CLOSING_PENDING_ADVISOR:
        raise conflict("此活動不在結案待審狀態")
    _require_close_key(user)  # 結案:承辦人單關

    activity.status = ActivityStatus.CLOSED
    # 繳交確認:未確認之項目評鑑以 0 分計(寫入 report,scoring 讀取)。
    # body 必填且三值一律明寫,model 的 server_default 只是審核前的佔位值
    report = await db.get(ActivityReport, activity.id)
    if report is None:
        # 沒有結案資料就沒有東西可確認;放行只會產生一筆評鑑全零又無人知情的已結案
        raise conflict("結案資料不存在,無法核准")
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
    _require_close_key(user)

    activity.status = ActivityStatus.APPROVED  # 退回 → 可修正後重送結案
    # 退回即解鎖:結案已在期限內送到,補件的往返不該再被期限擋下 —— 否則社團為了
    # 補一張照片還得先請行政解鎖(decisions.md D-05)。仍列在「逾期未結案」中,
    # 只是不再屬於「鎖定」那一類
    activity.close_unlocked = True
    _record(db, activity, ApprovalSubject.ACTIVITY_CLOSE, "advisor", ApprovalDecision.UNLOCK, user)
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
        action="activity_close_unlocked",
        user=user,
        detail=f"activity={activity.id};由結案退回自動解除",
        ip=client_ip(request),
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
    lock_days = await get_setting(db, "close_lock_days")
    if not svc.is_close_locked(activity, lock_days):
        # 未逾期不得預先解鎖,否則永久繞過結案鎖定。
        # 已解鎖的也走這裡:結案退回會自動解鎖(D-05),那時它可能其實已經逾期了
        raise conflict("此活動未處於鎖定狀態(未逾期,或已經解鎖)")
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
