"""社團端:活動申請與結案。

狀態機(data-model.md §3.3):
draft → pending_advisor →(有補助)pending_chief → pending_dean → approved
     └(無補助)→ approved;任一關退回 → rejected(可修改重送)
approved →(活動結束後)close → closing_pending_advisor → closed;退回 → approved
逾期鎖定=推導(活動結束日+N 天未送結案),管理員可解鎖(close_unlocked)。
"""

import uuid
from datetime import UTC, datetime, time
from typing import Annotated

import sqlalchemy as sa
from fastapi import APIRouter, BackgroundTasks, Query, Request, Response, UploadFile
from starlette.concurrency import run_in_threadpool

from app.api.pagination import Pagination, parse_sort
from app.core.deps import ClubUser, DbDep, client_ip
from app.core.errors import AppError, conflict, not_found, validation_error
from app.core.semesters import TAIPEI, semester_of, semester_range
from app.models import (
    Activity,
    ActivityReflection,
    ActivityReport,
    ApprovalRecord,
    Club,
    File,
)
from app.models.enums import ActivityStatus, ActivityType, ApprovalSubject
from app.schemas.activities import (
    ActivityDetailOut,
    ActivityIn,
    ActivityOut,
    ApprovalOut,
    CloseDraftIn,
    CloseSubmitIn,
    FileOut,
)
from app.schemas.common import ApiResponse
from app.services import activity_service as svc
from app.services import audit, notify, pdf
from app.services import files as file_service
from app.services.settings_service import get_budget_categories, get_setting

router = APIRouter(prefix="/club/activities", tags=["activities"])

_EDITABLE = {ActivityStatus.DRAFT, ActivityStatus.REJECTED}
# 社團自刪的狀態上界;真正的界線是簽核紀錄(見 delete_activity)
_CLUB_DELETABLE = {ActivityStatus.DRAFT, ActivityStatus.PENDING_ADVISOR}

_SORTABLE = {
    "name": Activity.name,
    "type": Activity.type,
    "date": Activity.date,
    "budget": svc.BUDGET_TOTAL_SQL,
    "status": svc.STATUS_ORDER_SQL,
    "created_at": Activity.created_at,
}


async def _validate_categories(db, items) -> None:
    # budget_categories 為 [{name, hint}];校驗僅比對名稱
    allowed = {c["name"] for c in await get_budget_categories(db)}
    for item in items:
        if item.category not in allowed:
            raise validation_error(f"經費科目「{item.category}」不在目錄中")


async def _club_of(db, user) -> Club:
    return await db.get(Club, user.club_id)


def _to_out(activity: Activity, lock_days: int) -> ActivityOut:
    out = ActivityOut.model_validate(activity)
    svc.decorate(out, activity, lock_days)
    return out


def _require_complete(activity: Activity) -> None:
    """送審前的必填檢核:草稿允許部分填寫,完整性在狀態轉移時收口。"""
    missing = [
        label
        for label, ok in (
            ("活動名稱", bool(activity.name.strip())),
            ("開始日期", activity.date is not None),
            ("結束日期", activity.end_date is not None),
            ("開始時間", activity.start_time is not None),
            ("結束時間", activity.end_time is not None),
            ("活動地點", bool(activity.location.strip())),
            ("工作分配", bool(activity.staff_text.strip())),
            # 人數兩欄各自可為 0(只有社員或只有校外人士),但合計 0 等於沒填
            ("參加人數", activity.participants_in + activity.participants_out > 0),
        )
        if not ok
    ]
    if missing:
        raise validation_error(f"送出前請先完成:{'、'.join(missing)}")


def _start_at(day, start_time) -> datetime:
    """活動開始時刻(台北);未填時間以當日 00:00 保守處理。"""
    return datetime.combine(day, start_time or time(0, 0), tzinfo=TAIPEI)


def _require_future_start(activity: Activity) -> None:
    """新申請的開始時刻不得早於現在。

    於 _require_complete 之後呼叫(日期/時間必然齊備);草稿不擋。
    schema 允許空時間時以當日 00:00 保守處理,不放行部分過去的申請。

    **退回件不走這裡**(decisions.md D-05):活動日期常在審核往返之間就過了,
    強迫改成未來日期等於逼社團竄改真實日期,或整件放棄。
    """
    start = _start_at(activity.date, activity.start_time)
    if start < datetime.now(UTC):
        raise validation_error("活動開始時間早於現在,請調整活動日期與時間")


@router.get("")
async def list_activities(
    user: ClubUser,
    db: DbDep,
    page: Pagination,
    semester: str | None = Query(None, pattern=r"^\d{3}-[12]$"),
    # 可重複帶多值(總覽頁一次查非 closed 各狀態,避免整表撈取);另收推導狀態 locked
    status: Annotated[list[str] | None, Query()] = None,
    type: Annotated[list[ActivityType] | None, Query()] = None,  # 可重複帶多值
    closable: bool = Query(False),  # 僅可結案者(已核准、已結束、未鎖定)
    ended: bool | None = Query(None),  # 借用綁定的活動下拉只要「還沒結束」的
    sort: str | None = None,
) -> ApiResponse[list[ActivityOut]]:
    query = (
        sa.select(Activity)
        .where(Activity.club_id == user.club_id)
        .options(sa.orm.selectinload(Activity.budget_items))
    )
    if semester:
        start, end = semester_range(semester)
        query = query.where(Activity.date >= start, Activity.date <= end)
    lock_days = await get_setting(db, "close_lock_days")
    if status:
        query = query.where(svc.display_status_filter(status, lock_days))
    if type:
        query = query.where(Activity.type.in_(type))
    if ended is not None:
        query = query.where(svc.ended_sql() if ended else sa.not_(svc.ended_sql()))
    if closable:
        query = query.where(svc.can_close_sql(lock_days))

    # 計數不必排序:budget 排序是相關子查詢,套在 count 的子查詢上是白工
    total = await db.scalar(sa.select(sa.func.count()).select_from(query.subquery()))
    # 固定 id 降冪 tiebreak:日期/類型/狀態都可能大量同值,無穩定全序時分頁會重複/漏列
    query = query.order_by(
        *parse_sort(sort, _SORTABLE, Activity.date.desc()), Activity.id.desc()
    )
    rows = (await db.scalars(query.offset(page.offset).limit(page.page_size))).all()
    return ApiResponse(data=[_to_out(a, lock_days) for a in rows], meta=page.meta(total or 0))


@router.get("/semesters")
async def list_semesters(user: ClubUser, db: DbDep) -> ApiResponse[list[str]]:
    dates = await db.scalars(
        sa.select(Activity.date)
        .where(Activity.club_id == user.club_id, Activity.date.is_not(None))
        .distinct()
    )
    labels = sorted({semester_of(d) for d in dates}, reverse=True)
    return ApiResponse(data=labels)


@router.post("", status_code=201)
async def create_activity(body: ActivityIn, user: ClubUser, db: DbDep) -> ApiResponse[ActivityOut]:
    await _validate_categories(db, body.budget_items)
    activity = Activity(
        club_id=user.club_id,
        created_by=user.id,
        status=ActivityStatus.DRAFT,
        **body.model_dump(exclude={"budget_items"}),
    )
    svc.replace_budget_items(activity, body.budget_items)
    db.add(activity)
    await db.commit()
    activity = await svc.get_own_activity(db, user, activity.id)
    lock_days = await get_setting(db, "close_lock_days")
    return ApiResponse(data=_to_out(activity, lock_days))


@router.get("/{activity_id}")
async def get_activity(
    activity_id: int, user: ClubUser, db: DbDep
) -> ApiResponse[ActivityDetailOut]:
    activity = await svc.get_own_activity(db, user, activity_id, with_detail=True)
    lock_days = await get_setting(db, "close_lock_days")
    out = ActivityDetailOut.model_validate(activity)
    svc.decorate(out, activity, lock_days)
    out.photos = [
        FileOut.model_validate(f) for f in await svc.activity_files(db, activity, svc.PHOTO_SLOT)
    ]
    out.attachments = [
        FileOut.model_validate(f)
        for f in await svc.activity_files(db, activity, svc.ATTACHMENT_SLOT)
    ]
    out.close_docs = [
        FileOut.model_validate(f) for f in await svc.activity_files(db, activity, svc.DOC_SLOT)
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


@router.put("/{activity_id}")
async def update_activity(
    activity_id: int, body: ActivityIn, user: ClubUser, db: DbDep
) -> ApiResponse[ActivityOut]:
    activity = await svc.get_own_activity(db, user, activity_id)
    # 鎖活動列並重讀狀態(可編輯狀態變更端點統一鎖序):
    # 與送審並發時後到者看到已轉送審即擋,已送審申請不可再被變造
    await db.refresh(activity, attribute_names=["status"], with_for_update=True)
    if activity.status not in _EDITABLE:
        raise conflict("僅草稿或退回件可修改")
    await _validate_categories(db, body.budget_items)
    if body.is_large != activity.is_large:
        activity.is_large_approved = None  # 大型申請變動,舊認可不得沿用
    was_rejected = activity.status == ActivityStatus.REJECTED
    old_start = _start_at(activity.date, activity.start_time) if activity.date else None
    for field, value in body.model_dump(exclude={"budget_items"}).items():
        setattr(activity, field, value)
    svc.replace_budget_items(activity, body.budget_items)
    if activity.status != ActivityStatus.DRAFT:
        _require_complete(activity)  # 退回件僅能存完整資料(部分填寫只屬草稿)
    if was_rejected and old_start is not None:
        # 退回件可照原日期重送,但不得再往更早的日期改(decisions.md D-05)。
        # 活動日期決定它落在哪一個學期,而評鑑是逐學期採計的 ——
        # 往回搬等於把活動塞進一個已經結案的評鑑年度。往未來改一律放行
        new_start = _start_at(activity.date, activity.start_time)
        if new_start < old_start and new_start < datetime.now(UTC):
            raise validation_error("退回件的活動日期不得再往前調整")
    await db.commit()
    activity = await svc.get_own_activity(db, user, activity_id)
    lock_days = await get_setting(db, "close_lock_days")
    return ApiResponse(data=_to_out(activity, lock_days))


@router.delete("/{activity_id}")
async def delete_activity(
    activity_id: int,
    user: ClubUser,
    db: DbDep,
    request: Request,
    background: BackgroundTasks,
) -> ApiResponse[None]:
    activity = await svc.get_own_activity(db, user, activity_id)
    await db.refresh(activity, attribute_names=["status"], with_for_update=True)
    # 界線是「有沒有人動過這張單」(D-39):草稿與剛送出還沒人審的單社團自己收得回去,
    # 一旦有簽核紀錄(核准/退回/解鎖皆算)就只有承辦刪得掉 —— 退回件裡有承辦寫給社團的話,
    # 社團刪掉等於把那段紀錄一起帶走。主要判準是簽核紀錄不是狀態:退回重送的單狀態同樣是
    # `pending_advisor`,卻已經有兩輪紀錄。狀態那半是保險,擋的是簽核紀錄缺漏的遷移件 ——
    # 現行 snapshot 沒有這種列,但刪掉的是結案照片與心得(評鑑的依據),錯一次沒有回頭路
    if activity.status not in _CLUB_DELETABLE or await svc.has_approvals(db, activity.id):
        raise conflict("已進入審核的活動無法刪除,請洽學務處")
    # 整張單連同附件一起實體刪除,比單刪一個檔更該留下紀錄。
    # 識別欄先抄下來:purge 之後這個實例已排入刪除,屬性讀得到但語意上已經不是活的列。
    # 通知要用的社團名與 webhook 也一起抄 —— commit 之後才查 DB 的話,那一查失敗就回 500,
    # 而活動其實已經刪掉了(前端沒進 onSuccess 不會清快取,重試只拿得到 404)
    name, status = activity.name, activity.status
    club = await _club_of(db, user)
    club_name, webhook = club.name, club.discord_webhook_url
    disk_paths = await svc.purge(db, activity)
    audit.record(
        db,
        action="activity_deleted",
        user=user,
        detail=(
            f"activity={activity_id};club={user.club_id};name={name}"
            f";status={status.value};files={len(disk_paths)}"
        ),
        ip=client_ip(request),
    )
    await db.commit()
    for path in disk_paths:  # commit 成功後才動磁碟
        file_service.unlink_quiet(path)
    # 刪掉就整份不見(附件一起實體刪除),留一則痕跡(GAP-18 K9)。
    # 「草稿儲存」刻意不發:同一份活動在填寫過程會產生數十則,會淹掉頻道
    background.add_task(notify.club_event, "alert", "活動已刪除", f"{club_name}:{name}", webhook)
    return ApiResponse()


@router.post("/{activity_id}/submit")
async def submit_activity(
    activity_id: int,
    user: ClubUser,
    db: DbDep,
    request: Request,
    background: BackgroundTasks,
) -> ApiResponse[ActivityOut]:
    activity = await svc.get_own_activity(db, user, activity_id)
    await db.refresh(activity, attribute_names=["status"], with_for_update=True)
    if activity.status not in _EDITABLE:
        raise conflict("此活動已送審或已核准")
    _require_complete(activity)
    if activity.status == ActivityStatus.DRAFT:
        _require_future_start(activity)  # 退回件照原日期重送
    # 重新送審=前一輪的核定全部作廢。逐項與總額必須一起清,而且要清在這裡而不是
    # 編輯路徑:退回件直接重送(不走 PUT)本來完全不動核定值,承辦人送空 body 就
    # 能通過「必須逐項核定」的檢核、原封不動再核一次舊金額
    for item in activity.budget_items:
        item.approved_subsidy = None
    activity.school_approved = None
    # fund_source 一併清:approve 只在 body 帶值時覆寫,留著上一輪的值會讓
    # 「有補助案件必須認定經費來源」的檢核吃到殘值而放行
    activity.fund_source = None
    activity.status = ActivityStatus.PENDING_ADVISOR
    # 每次送審都覆寫(D-29):退回重送就是重新到承辦手上,待審佇列該照新的先後排
    activity.submitted_at = datetime.now(UTC)
    club = await _club_of(db, user)
    audit.record(
        db,
        action="activity_submitted",
        user=user,
        detail=f"activity={activity.id}",
        ip=client_ip(request),
    )
    await db.commit()
    background.add_task(
        notify.club_event,
        "submit",
        "活動申請送審",
        f"{club.name}:{activity.name}({activity.date} @ {activity.location})",
        club.discord_webhook_url,
    )
    lock_days = await get_setting(db, "close_lock_days")
    return ApiResponse(data=_to_out(activity, lock_days))


@router.put("/{activity_id}/close-draft")
async def save_close_draft(
    activity_id: int, body: CloseDraftIn, user: ClubUser, db: DbDep
) -> ApiResponse[None]:
    activity = await svc.get_own_activity(db, user, activity_id)
    # 與 submit_close 同鎖序:結案送出已清空草稿後,慢到的草稿儲存不可再寫回過期資料
    await db.refresh(activity, attribute_names=["status"], with_for_update=True)
    if activity.status != ActivityStatus.APPROVED:
        raise conflict("僅已核准的活動可儲存結案草稿")
    activity.close_draft = body.data
    await db.commit()
    return ApiResponse()


async def _close_upload_cap(db, activity: Activity) -> tuple[int, int, AppError]:
    """結案上傳的共用額度:照片與結案附件合計一個上限(close_photo_total_mb)。

    兩個 slot 各算一次再相加 —— 分兩個上限的話畫面要印兩個數字,
    而社團在意的只有「還能傳多少」。
    """
    cap_mb = int(await get_setting(db, "close_photo_total_mb"))
    cap = cap_mb * 1024 * 1024
    used = 0
    for slot in (svc.PHOTO_SLOT, svc.DOC_SLOT):
        used += await file_service.total_uploaded(
            db, subject_type=svc.PHOTO_SUBJECT, subject_id=activity.id, slot=slot
        )
    return cap, used, AppError(413, "FILE_TOO_LARGE", f"照片與附件加總超過 {cap_mb}MB 上限")


@router.post("/{activity_id}/photos", status_code=201)
async def upload_photo(
    activity_id: int, file: UploadFile, user: ClubUser, db: DbDep
) -> ApiResponse[FileOut]:
    file_service.enforce_upload_rate(user.id)
    activity = await svc.get_own_activity(db, user, activity_id)
    # 鎖活動列並重讀狀態:與 submit_close/delete_photo 統一鎖序,
    # 並發上傳的加總上限、送出後上傳/刪除的窄競態都被序列化
    await db.refresh(activity, attribute_names=["status"], with_for_update=True)
    if activity.status != ActivityStatus.APPROVED:
        raise conflict("僅結案準備中(已核准)的活動可上傳照片")

    cap, existing, over_cap = await _close_upload_cap(db, activity)
    if existing >= cap:
        raise over_cap

    row = await file_service.save_upload(
        db,
        file,
        policy=file_service.IMAGE,
        module="reports",
        uploaded_by=user.id,
        club_id=user.club_id,
        subject_type=svc.PHOTO_SUBJECT,
        subject_id=activity.id,
        slot=svc.PHOTO_SLOT,
        dedup="slot",  # SHA-256 跨活動拒重複(同 slot=report_photo)
    )
    if existing + row.size > cap:
        raise over_cap  # 未 commit:落盤的檔案隨交易結束一起清掉
    await db.commit()
    return ApiResponse(data=FileOut.model_validate(row))


@router.post("/{activity_id}/docs", status_code=201)
async def upload_close_doc(
    activity_id: int, file: UploadFile, user: ClubUser, db: DbDep
) -> ApiResponse[FileOut]:
    """結案附件:保單、租車契約、簽到表、講師資料等。與照片同一個額度、同一條狀態界線。"""
    file_service.enforce_upload_rate(user.id)
    activity = await svc.get_own_activity(db, user, activity_id)
    await db.refresh(activity, attribute_names=["status"], with_for_update=True)
    if activity.status != ActivityStatus.APPROVED:
        raise conflict("僅結案準備中(已核准)的活動可上傳結案附件")

    cap, existing, over_cap = await _close_upload_cap(db, activity)
    if existing >= cap:
        raise over_cap

    row = await file_service.save_upload(
        db,
        file,
        policy=file_service.REPORT_DOC,
        module="reports",
        uploaded_by=user.id,
        club_id=user.club_id,
        subject_type=svc.PHOTO_SUBJECT,
        subject_id=activity.id,
        slot=svc.DOC_SLOT,
        # 不去重:同一份保單掛在兩場活動上是常態,不是誤傳
    )
    if existing + row.size > cap:
        raise over_cap
    await db.commit()
    return ApiResponse(data=FileOut.model_validate(row))


def _audit_file_deleted(
    db: DbDep, request: Request, user, action: str, activity_id: int, file: File
) -> None:
    """檔案刪了就查不到內容,至少留下誰在哪張單刪了哪個檔。"""
    audit.record(
        db,
        action=action,
        user=user,
        detail=f"activity={activity_id};file={file.id};name={file.original_name}",
        ip=client_ip(request),
    )


@router.delete("/{activity_id}/photos/{file_id}")
async def delete_photo(
    activity_id: int, file_id: uuid.UUID, user: ClubUser, db: DbDep, request: Request
) -> ApiResponse[None]:
    activity = await svc.get_own_activity(db, user, activity_id)
    # 鎖活動列並重讀狀態:submit_close 先 commit 時,這裡看到 closing → 409,
    # 不會出現「送審已成立、照片卻被(逾時回滾等)後續刪除」的結案
    await db.refresh(activity, attribute_names=["status"], with_for_update=True)
    if activity.status != ActivityStatus.APPROVED:
        raise conflict("結案已送出,照片不可移除")
    file = await db.get(File, file_id)
    if (
        file is None
        or file.club_id != user.club_id
        or file.subject_id != activity.id
        or file.slot != svc.PHOTO_SLOT
    ):
        raise not_found("找不到照片")
    _audit_file_deleted(db, request, user, "activity_photo_deleted", activity.id, file)
    disk = await file_service.delete_file(db, file)
    await db.commit()
    file_service.unlink_quiet(disk)
    return ApiResponse()


@router.delete("/{activity_id}/docs/{file_id}")
async def delete_close_doc(
    activity_id: int, file_id: uuid.UUID, user: ClubUser, db: DbDep, request: Request
) -> ApiResponse[None]:
    activity = await svc.get_own_activity(db, user, activity_id)
    await db.refresh(activity, attribute_names=["status"], with_for_update=True)
    if activity.status != ActivityStatus.APPROVED:
        raise conflict("結案已送出,附件不可移除")
    file = await db.get(File, file_id)
    if (
        file is None
        or file.club_id != user.club_id
        or file.subject_id != activity.id
        or file.slot != svc.DOC_SLOT
    ):
        raise not_found("找不到附件")
    _audit_file_deleted(db, request, user, "activity_close_doc_deleted", activity.id, file)
    disk = await file_service.delete_file(db, file)
    await db.commit()
    file_service.unlink_quiet(disk)
    return ApiResponse()


@router.post("/{activity_id}/attachments", status_code=201)
async def upload_attachment(
    activity_id: int, file: UploadFile, user: ClubUser, db: DbDep
) -> ApiResponse[FileOut]:
    file_service.enforce_upload_rate(user.id)
    activity = await svc.get_own_activity(db, user, activity_id)
    # 鎖活動列並重讀狀態:並發上傳的加總上限檢核序列化,
    # 也擋「檢核後才被送審」的狀態競態(不可對已送審申請追加附件)
    await db.refresh(activity, attribute_names=["status"], with_for_update=True)
    if activity.status not in _EDITABLE:
        raise conflict("僅草稿或退回件可上傳附件")

    # 附件加總上限(預設 50MB,system_settings 可調)
    cap_mb = int(await get_setting(db, "activity_attachment_total_mb"))
    cap = cap_mb * 1024 * 1024
    existing = await file_service.total_uploaded(
        db, subject_type=svc.PHOTO_SUBJECT, subject_id=activity.id, slot=svc.ATTACHMENT_SLOT
    )
    over_cap = AppError(413, "FILE_TOO_LARGE", f"附件加總超過 {cap_mb}MB 上限")
    if existing >= cap:
        raise over_cap

    row = await file_service.save_upload(
        db,
        file,
        policy=file_service.DOCUMENT,
        module="activities",
        uploaded_by=user.id,
        club_id=user.club_id,
        subject_type=svc.PHOTO_SUBJECT,
        subject_id=activity.id,
        slot=svc.ATTACHMENT_SLOT,
    )
    if existing + row.size > cap:
        raise over_cap  # 未 commit:落盤的檔案隨交易結束一起清掉
    await db.commit()
    return ApiResponse(data=FileOut.model_validate(row))


@router.delete("/{activity_id}/attachments/{file_id}")
async def delete_attachment(
    activity_id: int, file_id: uuid.UUID, user: ClubUser, db: DbDep, request: Request
) -> ApiResponse[None]:
    activity = await svc.get_own_activity(db, user, activity_id)
    await db.refresh(activity, attribute_names=["status"], with_for_update=True)
    if activity.status not in _EDITABLE:
        raise conflict("已送審的申請不可移除附件")
    file = await db.get(File, file_id)
    if (
        file is None
        or file.club_id != user.club_id
        or file.subject_id != activity.id
        or file.slot != svc.ATTACHMENT_SLOT
    ):
        raise not_found("找不到附件")
    _audit_file_deleted(db, request, user, "activity_attachment_deleted", activity.id, file)
    disk = await file_service.delete_file(db, file)
    await db.commit()
    file_service.unlink_quiet(disk)
    return ApiResponse()


@router.get("/{activity_id}/apply-pdf")
async def download_apply_pdf(activity_id: int, user: ClubUser, db: DbDep) -> Response:
    """社團活動申請表 PDF(版面沿用舊系統)。"""
    activity = await svc.get_own_activity(db, user, activity_id, with_detail=True)
    club = await _club_of(db, user)
    approvers = await svc.approver_names(db, activity.id)
    content = await run_in_threadpool(pdf.apply_pdf, club, activity, approvers)
    return pdf.pdf_response(content, f"{club.name}_{activity.name}_社團活動申請表.pdf")


@router.post("/{activity_id}/close")
async def submit_close(
    activity_id: int,
    body: CloseSubmitIn,
    user: ClubUser,
    db: DbDep,
    request: Request,
    background: BackgroundTasks,
) -> ApiResponse[ActivityOut]:
    activity = await svc.get_own_activity(db, user, activity_id, with_detail=True)
    lock_days = await get_setting(db, "close_lock_days")
    # 鎖活動列並重讀狀態:與 upload/delete_photo 統一鎖序,送出與照片增刪序列化
    await db.refresh(activity, attribute_names=["status"], with_for_update=True)
    if activity.status != ActivityStatus.APPROVED:
        raise conflict("僅已核准的活動可送結案")
    now = datetime.now(UTC)
    if now < svc.end_datetime(activity):
        raise conflict("活動尚未結束,不可結案")
    if svc.is_close_locked(activity, lock_days, now):
        raise conflict("已逾結案期限並鎖定,請洽學務處解鎖")
    # 實際時間先後僅單日活動可用純時間比較;跨日活動(18:00–翌日 10:00)整段合法
    if activity.end_date == activity.date and body.actual_end <= body.actual_start:
        raise validation_error("實際結束時間必須晚於開始時間")
    # 照片檢核收口到後端(先前僅前端擋):取鎖後計數,直呼 API 也擋張數不足的結案
    photo_count = await db.scalar(
        sa.select(sa.func.count())
        .select_from(File)
        .where(
            File.subject_type == svc.PHOTO_SUBJECT,
            File.subject_id == activity.id,
            File.slot == svc.PHOTO_SLOT,
            File.archived_at.is_(None),
        )
    )
    if (photo_count or 0) < svc.MIN_PHOTOS:
        raise validation_error(f"送出結案前請先上傳至少 {svc.MIN_PHOTOS} 張活動照片")

    if activity.report is not None:  # 結案被退回後重送:整份取代
        await db.delete(activity.report)
        await db.flush()
    report = ActivityReport(
        activity_id=activity.id,
        submitted_at=now,
        **body.model_dump(exclude={"reflections"}),
    )
    report.reflections = [ActivityReflection(**r.model_dump()) for r in body.reflections]
    db.add(report)
    activity.status = ActivityStatus.CLOSING_PENDING_ADVISOR
    activity.close_draft = None  # 草稿於送出時清除
    club = await _club_of(db, user)
    audit.record(
        db,
        action="activity_close_submitted",
        user=user,
        detail=f"activity={activity.id}",
        ip=client_ip(request),
    )
    await db.commit()
    background.add_task(
        notify.club_event,
        "submit",
        "活動結案送審",
        f"{club.name}:{activity.name}({activity.date})",
        club.discord_webhook_url,
    )
    activity = await svc.get_own_activity(db, user, activity_id)
    return ApiResponse(data=_to_out(activity, lock_days))
