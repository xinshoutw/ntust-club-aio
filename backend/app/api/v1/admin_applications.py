"""行政端:線上申請管理(幹部證明/郵局帳戶異動,權限鍵 aapply)。

2026-07-17 需求方拍板的最小審核:狀態=審核中 → 處理中 → 請洽學務處(完成),
單步前進、無退回(比照維修管理的狀態機模式);audit + notify 社團。
"""

from typing import Annotated

import sqlalchemy as sa
from fastapi import APIRouter, BackgroundTasks, Depends, Query, Request

from app.api.pagination import Pagination
from app.core.deps import CurrentUser, DbDep, client_ip, require_permission
from app.core.errors import conflict, not_found
from app.models import Club, OfficerCertificate, PostalAccountChange
from app.models.enums import ApplicationStatus
from app.schemas.activities import FileOut
from app.schemas.admin import AdminOfficerCertOut, AdminPostalChangeOut, ApplicationStatusIn
from app.schemas.common import ApiResponse
from app.services import audit, notify
from app.services import files as file_service

router = APIRouter(prefix="/admin", tags=["admin"])

ApplyAdmin = Annotated[CurrentUser, Depends(require_permission("aapply"))]

# 狀態機:審核中 → 處理中 → 請洽學務處(僅允許單步前進,不可回退/跳關)
_NEXT_STATUS = {
    ApplicationStatus.PENDING: ApplicationStatus.PROCESSING,
    ApplicationStatus.PROCESSING: ApplicationStatus.COMPLETED,
}

_STATUS_LABELS = {
    ApplicationStatus.PENDING: "審核中",
    ApplicationStatus.PROCESSING: "處理中",
    ApplicationStatus.COMPLETED: "請洽學務處",
}


def _status_order(model) -> sa.Case:
    return sa.case(
        (model.status == ApplicationStatus.PENDING, 0),
        (model.status == ApplicationStatus.PROCESSING, 1),
        else_=2,
    )


@router.get("/officer-certificates")
async def list_officer_certs(
    user: ApplyAdmin,
    db: DbDep,
    page: Pagination,
    status: ApplicationStatus | None = None,
    club_id: int | None = Query(None),
) -> ApiResponse[list[AdminOfficerCertOut]]:
    query = sa.select(OfficerCertificate, Club.name).join(
        Club, OfficerCertificate.club_id == Club.id
    )
    if status:
        query = query.where(OfficerCertificate.status == status)
    if club_id:
        query = query.where(OfficerCertificate.club_id == club_id)
    # 預設:審核中 → 處理中 → 完成,各組內申請日升冪(排序/篩選由前端做,不開 sort 參數)
    query = query.order_by(
        _status_order(OfficerCertificate), OfficerCertificate.created_at.asc(),
        OfficerCertificate.id,
    )

    total = await db.scalar(sa.select(sa.func.count()).select_from(query.subquery()))
    rows = await db.execute(query.offset(page.offset).limit(page.page_size))
    data = []
    for row, club_name in rows:
        out = AdminOfficerCertOut.model_validate(row)
        out.club_name = club_name
        data.append(out)
    return ApiResponse(data=data, meta=page.meta(total or 0))


@router.get("/postal-changes")
async def list_postal_changes(
    user: ApplyAdmin,
    db: DbDep,
    page: Pagination,
    status: ApplicationStatus | None = None,
    club_id: int | None = Query(None),
) -> ApiResponse[list[AdminPostalChangeOut]]:
    query = sa.select(PostalAccountChange, Club.name).join(
        Club, PostalAccountChange.club_id == Club.id
    )
    if status:
        query = query.where(PostalAccountChange.status == status)
    if club_id:
        query = query.where(PostalAccountChange.club_id == club_id)
    query = query.order_by(
        _status_order(PostalAccountChange), PostalAccountChange.created_at.asc(),
        PostalAccountChange.id,
    )

    total = await db.scalar(sa.select(sa.func.count()).select_from(query.subquery()))
    rows = (await db.execute(query.offset(page.offset).limit(page.page_size))).all()
    # 存簿影本是核對局號帳號的依據,和單子一起回(整頁一次查,不逐列)
    passbooks = await file_service.files_by_subject(db, "postal_change", [r.id for r, _ in rows])
    data = []
    for row, club_name in rows:
        out = AdminPostalChangeOut.model_validate(row)
        out.club_name = club_name
        out.passbook = [FileOut.model_validate(f) for f in passbooks.get(row.id, [])]
        data.append(out)
    return ApiResponse(data=data, meta=page.meta(total or 0))


async def _advance_status(db, row, body: ApplicationStatusIn):
    """單步前進檢核(比照 admin_maintenance;呼叫端先 with_for_update 取列)。"""
    if _NEXT_STATUS.get(row.status) != body.status:
        raise conflict(
            f"無法從「{_STATUS_LABELS[row.status]}」變更為「{_STATUS_LABELS[body.status]}」",
            code="INVALID_STATUS_TRANSITION",
        )
    row.status = body.status


@router.post("/officer-certificates/{cert_id}/status")
async def update_officer_cert_status(
    cert_id: int,
    body: ApplicationStatusIn,
    user: ApplyAdmin,
    db: DbDep,
    request: Request,
    background: BackgroundTasks,
) -> ApiResponse[AdminOfficerCertOut]:
    row = await db.scalar(
        sa.select(OfficerCertificate).where(OfficerCertificate.id == cert_id).with_for_update()
    )
    if row is None:
        raise not_found("找不到幹部證明申請")
    await _advance_status(db, row, body)
    audit.record(
        db,
        action="officer_cert_status_updated",
        user=user,
        detail=f"officer_cert={row.id};status={body.status.value}",
        ip=client_ip(request),
    )
    await db.commit()

    club = await db.get(Club, row.club_id)
    done = body.status == ApplicationStatus.COMPLETED
    background.add_task(
        notify.club_event,
        "approve" if done else "alert",
        "幹部證明已完成,請洽學務處領取" if done else "幹部證明處理中",
        f"{club.name}:{row.term} {row.position.value} {row.applicant_name}",
        club.discord_webhook_url,
    )
    out = AdminOfficerCertOut.model_validate(row)
    out.club_name = club.name
    return ApiResponse(data=out)


@router.post("/postal-changes/{change_id}/status")
async def update_postal_change_status(
    change_id: int,
    body: ApplicationStatusIn,
    user: ApplyAdmin,
    db: DbDep,
    request: Request,
    background: BackgroundTasks,
) -> ApiResponse[AdminPostalChangeOut]:
    row = await db.scalar(
        sa.select(PostalAccountChange)
        .where(PostalAccountChange.id == change_id)
        .with_for_update()
    )
    if row is None:
        raise not_found("找不到郵局帳戶異動申請")
    await _advance_status(db, row, body)
    audit.record(
        db,
        action="postal_change_status_updated",
        user=user,
        detail=f"postal_change={row.id};status={body.status.value}",
        ip=client_ip(request),
    )
    await db.commit()

    club = await db.get(Club, row.club_id)
    done = body.status == ApplicationStatus.COMPLETED
    background.add_task(
        notify.club_event,
        "approve" if done else "alert",
        "郵局帳戶異動已完成,請洽學務處" if done else "郵局帳戶異動處理中",
        f"{club.name}:{'、'.join(row.reasons)}",
        club.discord_webhook_url,
    )
    out = AdminPostalChangeOut.model_validate(row)
    out.club_name = club.name
    return ApiResponse(data=out)
