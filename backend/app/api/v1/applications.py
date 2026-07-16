"""社團端:線上申請(幹部證明/郵局帳戶異動/空間報修)+ 違規查詢 + 公告。"""

import sqlalchemy as sa
from fastapi import APIRouter, BackgroundTasks, Request, UploadFile

from app.api.pagination import Pagination
from app.core.deps import ClubUser, DbDep, client_ip
from app.core.errors import not_found, validation_error
from app.models import (
    Announcement,
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

router = APIRouter(prefix="/club", tags=["applications"])

MAX_EVIDENCE_PER_REQUEST = 5  # 每筆報修佐證檔上限(影片 200MB,防磁碟耗盡)

_POSITION_TITLES: dict[CertPosition, set[str]] = {
    CertPosition.LEADER: {"社長", "會長"},
    CertPosition.VICE_LEADER: {"副社長", "副會長"},
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
    # 姓名由成員名單依職位自動帶出;0 位或多位皆擋(需先整理名單)
    titles = _POSITION_TITLES[body.position]
    names = (
        await db.scalars(
            sa.select(ClubMember.name).where(
                ClubMember.club_id == user.club_id,
                ClubMember.kind == MemberKind.OFFICER,
                ClubMember.title.in_(titles),
            )
        )
    ).all()
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
    # 每單佐證上限:報修影片最大 200MB,無上限會被灌爆磁碟(2026-07-16 資安審查)
    existing = await db.scalar(
        sa.select(sa.func.count())
        .select_from(File)
        .where(File.subject_type == "maintenance", File.subject_id == row.id)
    )
    if (existing or 0) >= MAX_EVIDENCE_PER_REQUEST:
        raise validation_error(f"每筆報修至多 {MAX_EVIDENCE_PER_REQUEST} 個佐證檔案")
    # 佐證接受照片或影片(影片走 200MB 上限)
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


@router.get("/announcements")
async def list_announcements(
    user: ClubUser, db: DbDep, page: Pagination
) -> ApiResponse[list[AnnouncementOut]]:
    club = await db.get(Club, user.club_id)
    query = (
        sa.select(Announcement)
        .where(
            sa.or_(
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
        )
        .order_by(Announcement.id.desc())
    )
    total = await db.scalar(sa.select(sa.func.count()).select_from(query.subquery()))
    rows = await db.scalars(query.offset(page.offset).limit(page.page_size))
    return ApiResponse(
        data=[AnnouncementOut.model_validate(r) for r in rows], meta=page.meta(total or 0)
    )
