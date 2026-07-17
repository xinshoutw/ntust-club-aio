"""社團端:活動申請與結案。

狀態機(data-model.md §3.3):
draft → pending_advisor →(有補助)pending_chief → pending_dean → approved
     └(無補助)→ approved;任一關退回 → rejected(可修改重送)
approved →(活動結束後)close → closing_pending_advisor → closed;退回 → approved
逾期鎖定=推導(活動日+1 個月未送結案),管理員可解鎖(close_unlocked)。
"""

from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import quote

import sqlalchemy as sa
from fastapi import APIRouter, BackgroundTasks, Query, Request, Response, UploadFile
from starlette.concurrency import run_in_threadpool

from app.api.pagination import Pagination, parse_sort
from app.core.config import settings
from app.core.deps import ClubUser, DbDep, client_ip
from app.core.errors import AppError, conflict, not_found, validation_error
from app.core.semesters import semester_of, semester_range
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

_SORTABLE = {
    "name": Activity.name,
    "type": Activity.type,
    "date": Activity.date,
    "status": Activity.status,
    "created_at": Activity.created_at,
}


async def _validate_categories(db, items) -> None:
    # budget_categories 為 [{name, hint}](2026-07-17);校驗僅比對名稱
    allowed = {c["name"] for c in await get_budget_categories(db)}
    for item in items:
        if item.category not in allowed:
            raise validation_error(f"經費科目「{item.category}」不在目錄中")


async def _club_of(db, user) -> Club:
    return await db.get(Club, user.club_id)


def _to_out(activity: Activity, lock_months: int) -> ActivityOut:
    out = ActivityOut.model_validate(activity)
    svc.decorate(out, activity, lock_months)
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
        )
        if not ok
    ]
    if missing:
        raise validation_error(f"送出前請先完成:{'、'.join(missing)}")


@router.get("")
async def list_activities(
    user: ClubUser,
    db: DbDep,
    page: Pagination,
    semester: str | None = Query(None, pattern=r"^\d{3}-[12]$"),
    status: ActivityStatus | None = None,
    type: ActivityType | None = None,
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
    if status:
        query = query.where(Activity.status == status)
    if type:
        query = query.where(Activity.type == type)
    query = query.order_by(*parse_sort(sort, _SORTABLE, Activity.date.desc()))

    total = await db.scalar(sa.select(sa.func.count()).select_from(query.subquery()))
    rows = (await db.scalars(query.offset(page.offset).limit(page.page_size))).all()
    lock_months = await get_setting(db, "close_lock_months")
    return ApiResponse(data=[_to_out(a, lock_months) for a in rows], meta=page.meta(total or 0))


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
    lock_months = await get_setting(db, "close_lock_months")
    return ApiResponse(data=_to_out(activity, lock_months))


@router.get("/{activity_id}")
async def get_activity(
    activity_id: int, user: ClubUser, db: DbDep
) -> ApiResponse[ActivityDetailOut]:
    activity = await svc.get_own_activity(db, user, activity_id, with_detail=True)
    lock_months = await get_setting(db, "close_lock_months")
    out = ActivityDetailOut.model_validate(activity)
    svc.decorate(out, activity, lock_months)
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


@router.put("/{activity_id}")
async def update_activity(
    activity_id: int, body: ActivityIn, user: ClubUser, db: DbDep
) -> ApiResponse[ActivityOut]:
    activity = await svc.get_own_activity(db, user, activity_id)
    if activity.status not in _EDITABLE:
        raise conflict("僅草稿或退回件可修改")
    await _validate_categories(db, body.budget_items)
    if body.is_large != activity.is_large:
        activity.is_large_approved = None  # 大型申請變動,舊認可不得沿用
    for field, value in body.model_dump(exclude={"budget_items"}).items():
        setattr(activity, field, value)
    svc.replace_budget_items(activity, body.budget_items)
    if activity.status != ActivityStatus.DRAFT:
        _require_complete(activity)  # 退回件僅能存完整資料(部分填寫只屬草稿)
    await db.commit()
    activity = await svc.get_own_activity(db, user, activity_id)
    lock_months = await get_setting(db, "close_lock_months")
    return ApiResponse(data=_to_out(activity, lock_months))


@router.delete("/{activity_id}")
async def delete_activity(activity_id: int, user: ClubUser, db: DbDep) -> ApiResponse[None]:
    activity = await svc.get_own_activity(db, user, activity_id)
    if activity.status != ActivityStatus.DRAFT:
        raise conflict("僅草稿可刪除")
    disk_paths = []
    for slot in (svc.PHOTO_SLOT, svc.ATTACHMENT_SLOT):
        for f in await svc.activity_files(db, activity, slot):
            disk_paths.append(await file_service.delete_file(db, f))
    await db.delete(activity)
    await db.commit()
    for path in disk_paths:  # commit 成功後才動磁碟
        file_service.unlink_quiet(path)
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
    if activity.status not in _EDITABLE:
        raise conflict("此活動已送審或已核准")
    _require_complete(activity)
    activity.status = ActivityStatus.PENDING_ADVISOR
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
    lock_months = await get_setting(db, "close_lock_months")
    return ApiResponse(data=_to_out(activity, lock_months))


@router.put("/{activity_id}/close-draft")
async def save_close_draft(
    activity_id: int, body: CloseDraftIn, user: ClubUser, db: DbDep
) -> ApiResponse[None]:
    activity = await svc.get_own_activity(db, user, activity_id)
    if activity.status != ActivityStatus.APPROVED:
        raise conflict("僅已核准的活動可儲存結案草稿")
    activity.close_draft = body.data
    await db.commit()
    return ApiResponse()


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

    # 結案照片加總上限(2026-07-17 改依申請性質給總量;預設 10MB,system_settings 可調)
    cap_mb = int(await get_setting(db, "close_photo_total_mb"))
    cap = cap_mb * 1024 * 1024
    existing = await file_service.total_uploaded(
        db, subject_type=svc.PHOTO_SUBJECT, subject_id=activity.id, slot=svc.PHOTO_SLOT
    )
    over_cap = AppError(413, "FILE_TOO_LARGE", f"照片加總超過 {cap_mb}MB 上限")
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
        file_service.unlink_quiet(Path(settings.upload_dir) / row.path)
        raise over_cap
    await db.commit()
    return ApiResponse(data=FileOut.model_validate(row))


@router.delete("/{activity_id}/photos/{file_id}")
async def delete_photo(
    activity_id: int, file_id: str, user: ClubUser, db: DbDep
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
    if activity.status not in _EDITABLE:
        raise conflict("僅草稿或退回件可上傳附件")
    # 鎖活動列:同活動的並發上傳序列化,加總上限檢核才不會被雙寫繞過
    await db.execute(
        sa.select(Activity.id).where(Activity.id == activity.id).with_for_update()
    )

    # 附件加總上限(2026-07-17 改依申請性質給總量;預設 15MB,system_settings 可調)
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
        # 未 commit,DB 列隨交易回滾;磁碟檔需自行清掉
        file_service.unlink_quiet(Path(settings.upload_dir) / row.path)
        raise over_cap
    await db.commit()
    return ApiResponse(data=FileOut.model_validate(row))


@router.delete("/{activity_id}/attachments/{file_id}")
async def delete_attachment(
    activity_id: int, file_id: str, user: ClubUser, db: DbDep
) -> ApiResponse[None]:
    activity = await svc.get_own_activity(db, user, activity_id)
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
    disk = await file_service.delete_file(db, file)
    await db.commit()
    file_service.unlink_quiet(disk)
    return ApiResponse()


def _pdf_response(content: bytes, filename: str) -> Response:
    quoted = quote(filename)
    return Response(
        content=content,
        media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename*=UTF-8''{quoted}"},
    )


async def _closed_activity_with_report(db, user, activity_id: int) -> Activity:
    activity = await svc.get_own_activity(db, user, activity_id, with_detail=True)
    if activity.report is None:
        raise conflict("此活動尚未送出結案,無法產生文件")
    return activity


@router.get("/{activity_id}/report-pdf")
async def download_report_pdf(activity_id: int, user: ClubUser, db: DbDep) -> Response:
    """成果報告表 PDF(依需求方模板於下載時動態生成)。"""
    activity = await _closed_activity_with_report(db, user, activity_id)
    club = await _club_of(db, user)
    # reportlab 為同步 CPU 工作,丟 threadpool 避免卡住 event loop
    content = await run_in_threadpool(pdf.report_pdf, club, activity, activity.report)
    return _pdf_response(content, f"{club.name}_{activity.name}_成果報告表.pdf")


@router.get("/{activity_id}/reflections-pdf")
async def download_reflections_pdf(activity_id: int, user: ClubUser, db: DbDep) -> Response:
    """學習心得 PDF(依需求方模板於下載時動態生成)。"""
    activity = await _closed_activity_with_report(db, user, activity_id)
    club = await _club_of(db, user)
    content = await run_in_threadpool(
        pdf.reflections_pdf, club, activity, activity.report.reflections
    )
    return _pdf_response(content, f"{club.name}_{activity.name}_學習心得.pdf")


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
    lock_months = await get_setting(db, "close_lock_months")
    # 鎖活動列並重讀狀態:與 upload/delete_photo 統一鎖序,送出與照片增刪序列化
    await db.refresh(activity, attribute_names=["status"], with_for_update=True)
    if activity.status != ActivityStatus.APPROVED:
        raise conflict("僅已核准的活動可送結案")
    now = datetime.now(UTC)
    if now < svc.end_datetime(activity):
        raise conflict("活動尚未結束,不可結案")
    if svc.is_close_locked(activity, lock_months, now):
        raise conflict("已逾結案期限並鎖定,請洽學務處解鎖")
    # 照片檢核收口到後端(先前僅前端擋):取鎖後計數,直呼 API 也擋零照片結案
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
    if not photo_count:
        raise validation_error("送出結案前請先上傳至少一張活動照片")

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
    return ApiResponse(data=_to_out(activity, lock_months))
