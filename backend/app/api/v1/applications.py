"""社團端:線上申請(幹部證明/郵局帳戶異動/空間報修)+ 違規查詢 + 公告。"""

from pathlib import Path

import sqlalchemy as sa
from fastapi import APIRouter, BackgroundTasks, Request, UploadFile
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.api.pagination import Pagination
from app.core.config import settings
from app.core.deps import ClubUser, DbDep, client_ip
from app.core.errors import AppError, not_found, validation_error
from app.models import (
    Announcement,
    AnnouncementDismissal,
    Club,
    ClubMember,
    File,
    MaintenanceRequest,
    OfficerCertificate,
    PostalAccountChange,
    Violation,
)
from app.models.enums import AnnouncementTarget, CertPosition, MemberKind
from app.schemas.activities import FileOut
from app.schemas.applications import (
    AnnouncementOut,
    MaintenanceIn,
    MaintenanceOut,
    OfficerCertIn,
    OfficerCertOut,
    PostalChangeIn,
    PostalChangeOut,
    ViolationOut,
    mask_phone,
)
from app.schemas.common import ApiResponse
from app.services import audit, notify, violation_service
from app.services import files as file_service
from app.services.settings_service import get_setting

router = APIRouter(prefix="/club", tags=["applications"])

MAX_EVIDENCE_PER_REQUEST = 5  # 每筆報修佐證檔上限(影片 200MB,防磁碟耗盡)

# 職位對應標準身份(2026-07-16 第九輪:正副負責人為一級身份,不再靠職稱字串比對)
_POSITION_KIND: dict[CertPosition, MemberKind] = {
    CertPosition.LEADER: MemberKind.PRESIDENT,
    CertPosition.VICE_LEADER: MemberKind.VICE_PRESIDENT,
}


async def _notify_submit(background: BackgroundTasks, db, user, title: str, desc: str) -> None:
    club = await db.get(Club, user.club_id)
    background.add_task(notify.club_event, "submit", title, desc, club.discord_webhook_url)


# ---- 幹部證明 ----


@router.get("/officer-certificates")
async def list_certs(
    user: ClubUser, db: DbDep, page: Pagination
) -> ApiResponse[list[OfficerCertOut]]:
    query = (
        sa.select(OfficerCertificate)
        .where(OfficerCertificate.club_id == user.club_id)
        .order_by(OfficerCertificate.id.desc())
    )
    total = await db.scalar(sa.select(sa.func.count()).select_from(query.subquery()))
    rows = await db.scalars(query.offset(page.offset).limit(page.page_size))
    return ApiResponse(
        data=[OfficerCertOut.model_validate(r) for r in rows], meta=page.meta(total or 0)
    )


@router.post("/officer-certificates", status_code=201)
async def create_cert(
    body: OfficerCertIn,
    user: ClubUser,
    db: DbDep,
    request: Request,
    background: BackgroundTasks,
) -> ApiResponse[OfficerCertOut]:
    # 姓名由成員名單依「學年期 + 職位」自動帶出;0 位或多位皆擋(需先整理名單)
    query = sa.select(sa.distinct(ClubMember.name)).where(
        ClubMember.club_id == user.club_id,
        ClubMember.kind == _POSITION_KIND[body.position],
    )
    if "-" in body.term:  # 學期(如 114-1);整學年(114)含兩學期
        query = query.where(ClubMember.semester == body.term)
    else:
        query = query.where(ClubMember.semester.startswith(f"{body.term}-"))
    names = (await db.scalars(query)).all()
    if len(names) == 0:
        raise validation_error("成員名單中找不到該職位的幹部,請先更新名單")
    if len(names) > 1:
        raise validation_error("成員名單中該職位有多位,請先修正名單")

    row = OfficerCertificate(
        club_id=user.club_id, term=body.term, position=body.position, applicant_name=names[0]
    )
    db.add(row)
    audit.record(db, action="officer_cert_submitted", user=user, ip=client_ip(request))
    await db.commit()
    await _notify_submit(
        background, db, user, "幹部證明申請", f"{user.name}:{body.term} {body.position.value}"
    )
    return ApiResponse(data=OfficerCertOut.model_validate(row))


# ---- 郵局帳戶異動 ----


def _postal_out(row: PostalAccountChange) -> PostalChangeOut:
    # 2026-07-15 需求方:社團端申請紀錄顯示完整局號帳號(不遮罩);電話仍遮罩
    out = PostalChangeOut.model_validate(row)
    out.new_agent_phone = mask_phone(row.new_agent_phone)
    return out


@router.get("/postal-changes")
async def list_postal(
    user: ClubUser, db: DbDep, page: Pagination
) -> ApiResponse[list[PostalChangeOut]]:
    query = (
        sa.select(PostalAccountChange)
        .where(PostalAccountChange.club_id == user.club_id)
        .order_by(PostalAccountChange.id.desc())
    )
    total = await db.scalar(sa.select(sa.func.count()).select_from(query.subquery()))
    rows = await db.scalars(query.offset(page.offset).limit(page.page_size))
    return ApiResponse(data=[_postal_out(r) for r in rows], meta=page.meta(total or 0))


@router.post("/postal-changes", status_code=201)
async def create_postal(
    body: PostalChangeIn,
    user: ClubUser,
    db: DbDep,
    request: Request,
    background: BackgroundTasks,
) -> ApiResponse[PostalChangeOut]:
    row = PostalAccountChange(
        club_id=user.club_id,
        reasons=[r.value for r in body.reasons],
        account_name=body.account_name,
        account_number=body.account_number,
        new_agent_name=body.new_agent_name,
        new_agent_phone=body.new_agent_phone,
    )
    db.add(row)
    audit.record(db, action="postal_change_submitted", user=user, ip=client_ip(request))
    await db.commit()
    await _notify_submit(
        background, db, user, "郵局帳戶異動申請",
        f"{user.name}:{'、'.join(r.value for r in body.reasons)}",
    )
    return ApiResponse(data=_postal_out(row))


@router.post("/postal-changes/{change_id}/passbook", status_code=201)
async def upload_passbook(
    change_id: int, file: UploadFile, user: ClubUser, db: DbDep
) -> ApiResponse[FileOut]:
    file_service.enforce_upload_rate(user.id)
    row = await db.get(PostalAccountChange, change_id)
    if row is None or row.club_id != user.club_id:
        raise not_found("找不到申請")
    saved = await file_service.save_upload(
        db,
        file,
        policy=file_service.IMAGE,
        module="postal",
        uploaded_by=user.id,
        club_id=user.club_id,
        subject_type="postal_change",
        subject_id=row.id,
        slot="passbook",
    )
    await db.commit()
    return ApiResponse(data=FileOut.model_validate(saved))


# ---- 空間報修 ----


@router.get("/maintenance")
async def list_maintenance(
    user: ClubUser, db: DbDep, page: Pagination
) -> ApiResponse[list[MaintenanceOut]]:
    query = (
        sa.select(MaintenanceRequest)
        .where(MaintenanceRequest.club_id == user.club_id)
        .order_by(MaintenanceRequest.id.desc())
    )
    total = await db.scalar(sa.select(sa.func.count()).select_from(query.subquery()))
    rows = await db.scalars(query.offset(page.offset).limit(page.page_size))
    return ApiResponse(
        data=[MaintenanceOut.model_validate(r) for r in rows], meta=page.meta(total or 0)
    )


@router.post("/maintenance", status_code=201)
async def create_maintenance(
    body: MaintenanceIn,
    user: ClubUser,
    db: DbDep,
    request: Request,
    background: BackgroundTasks,
) -> ApiResponse[MaintenanceOut]:
    row = MaintenanceRequest(club_id=user.club_id, location=body.location, items=body.items)
    db.add(row)
    audit.record(db, action="maintenance_submitted", user=user, ip=client_ip(request))
    await db.commit()
    await _notify_submit(
        background, db, user, "空間報修申請", f"{user.name}:{body.location}({body.items})"
    )
    return ApiResponse(data=MaintenanceOut.model_validate(row))


@router.post("/maintenance/{request_id}/evidence", status_code=201)
async def upload_evidence(
    request_id: int, file: UploadFile, user: ClubUser, db: DbDep
) -> ApiResponse[FileOut]:
    file_service.enforce_upload_rate(user.id)
    row = await db.get(MaintenanceRequest, request_id)
    if row is None or row.club_id != user.club_id:
        raise not_found("找不到報修單")
    # 鎖報修列:同單並發上傳序列化,加總上限不被雙寫繞過
    await db.execute(
        sa.select(MaintenanceRequest.id)
        .where(MaintenanceRequest.id == row.id)
        .with_for_update()
    )
    existing_count = await db.scalar(
        sa.select(sa.func.count())
        .select_from(File)
        .where(File.subject_type == "maintenance", File.subject_id == row.id)
    )
    if (existing_count or 0) >= MAX_EVIDENCE_PER_REQUEST:
        raise validation_error(f"每筆報修至多 {MAX_EVIDENCE_PER_REQUEST} 個佐證檔案")

    # 佐證加總上限(2026-07-17 改依申請性質給總量;預設 100MB 含影片,system_settings 可調)
    cap_mb = int(await get_setting(db, "maintenance_total_mb"))
    cap = cap_mb * 1024 * 1024
    existing_bytes = await file_service.total_uploaded(
        db, subject_type="maintenance", subject_id=row.id, slot="evidence"
    )
    over_cap = AppError(413, "FILE_TOO_LARGE", f"佐證檔加總超過 {cap_mb}MB 上限")
    if existing_bytes >= cap:
        raise over_cap

    # 佐證接受照片或影片(單檔仍走各自政策的 magic-byte 與單檔上界)
    ext = (file.filename or "").lower().rsplit(".", 1)
    policy = (
        file_service.VIDEO
        if len(ext) == 2 and f".{ext[1]}" in file_service.VIDEO.extensions
        else file_service.IMAGE
    )
    saved = await file_service.save_upload(
        db,
        file,
        policy=policy,
        module="maintenance",
        uploaded_by=user.id,
        club_id=user.club_id,
        subject_type="maintenance",
        subject_id=row.id,
        slot="evidence",
    )
    if existing_bytes + saved.size > cap:
        (Path(settings.upload_dir) / saved.path).unlink(missing_ok=True)
        raise over_cap
    await db.commit()
    return ApiResponse(data=FileOut.model_validate(saved))


# ---- 違規勸導(社團查詢)----


@router.get("/violations")
async def list_violations(
    user: ClubUser, db: DbDep, page: Pagination
) -> ApiResponse[list[ViolationOut]]:
    query = (
        sa.select(Violation)
        .where(Violation.club_id == user.club_id)
        .order_by(Violation.id.desc())
    )
    total = await db.scalar(sa.select(sa.func.count()).select_from(query.subquery()))
    rows = await db.scalars(query.offset(page.offset).limit(page.page_size))
    today = violation_service.today_taipei()
    data = []
    for r in rows:
        out = ViolationOut.model_validate(r)
        out.resolve_deadline = violation_service.resolve_deadline(r)
        out.resolve_expired = violation_service.resolve_expired(r, today)
        data.append(out)
    return ApiResponse(data=data, meta=page.meta(total or 0))


# ---- 公告(社團端)----


def _announcement_visible(club: Club) -> sa.ColumnElement[bool]:
    """本社可見的公告(全體/性質命中/指定本社)。"""
    return sa.or_(
        Announcement.target_type == AnnouncementTarget.ALL,
        sa.and_(
            Announcement.target_type == AnnouncementTarget.ATTR,
            Announcement.attrs.any(club.attribute.value),
        ),
        sa.and_(
            Announcement.target_type == AnnouncementTarget.CLUB,
            Announcement.club_id == club.id,
        ),
    )


@router.get("/announcements")
async def list_announcements(
    user: ClubUser, db: DbDep, page: Pagination
) -> ApiResponse[list[AnnouncementOut]]:
    club = await db.get(Club, user.club_id)
    query = (
        sa.select(Announcement, AnnouncementDismissal.club_id.is_not(None))
        .outerjoin(
            AnnouncementDismissal,
            sa.and_(
                AnnouncementDismissal.announcement_id == Announcement.id,
                AnnouncementDismissal.club_id == club.id,
            ),
        )
        .where(_announcement_visible(club))
        .order_by(Announcement.id.desc())
    )
    total = await db.scalar(sa.select(sa.func.count()).select_from(query.subquery()))
    rows = (await db.execute(query.offset(page.offset).limit(page.page_size))).all()
    read_at = club.announcements_read_at
    data = []
    for ann, dismissed in rows:
        out = AnnouncementOut.model_validate(ann)
        out.dismissed = dismissed
        out.unread = read_at is None or ann.created_at > read_at
        data.append(out)
    return ApiResponse(data=data, meta=page.meta(total or 0))


@router.post("/announcements/read")
async def mark_announcements_read(user: ClubUser, db: DbDep) -> ApiResponse[None]:
    """公告全部標為已讀(水位線前移):開啟鈴鐺或進入總覽(公告所在頁)時呼叫。

    以 DB 時鐘(now())為準,與 created_at(server_default now())同源,避免 app/DB 時鐘飄移。
    """
    club = await db.get(Club, user.club_id)
    club.announcements_read_at = await db.scalar(sa.select(sa.func.now()))
    await db.commit()
    return ApiResponse(data=None)


@router.post("/announcements/{announcement_id}/dismiss")
async def dismiss_announcement(
    announcement_id: int, user: ClubUser, db: DbDep
) -> ApiResponse[None]:
    """蓋板公告「不再顯示」:登記後該公告不再於登入時蓋板(冪等)。"""
    club = await db.get(Club, user.club_id)
    visible = await db.scalar(
        sa.select(Announcement.id).where(
            Announcement.id == announcement_id, _announcement_visible(club)
        )
    )
    if visible is None:
        raise not_found("公告不存在")
    await db.execute(
        pg_insert(AnnouncementDismissal)
        .values(announcement_id=announcement_id, club_id=club.id)
        .on_conflict_do_nothing()
    )
    await db.commit()
    return ApiResponse(data=None)
