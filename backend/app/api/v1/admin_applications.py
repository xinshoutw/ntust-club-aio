"""行政端:線上申請管理(幹部證明 `acert` / 郵局帳戶異動 `apostal`,各一把鍵)。

2026-07-17 需求方拍板的最小審核:狀態=審核中 → 處理中 → 已完成;
**只能往前,可跳過處理中**(D-25)、無退回;audit + notify 社團。
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

# 證明與郵局各自一頁一把鍵(decisions.md D-11)
CertAdmin = Annotated[CurrentUser, Depends(require_permission("acert"))]
PostalAdmin = Annotated[CurrentUser, Depends(require_permission("apostal"))]

# 狀態機:審核中 → 處理中 → 已完成,**只能往前,可跳過**(D-25)——
# 承辦當場開完證明就直接結案,逼他先點一次「處理中」只是多一次點擊。不可回退。
_ALLOWED_NEXT = {
    ApplicationStatus.PENDING: (ApplicationStatus.PROCESSING, ApplicationStatus.COMPLETED),
    ApplicationStatus.PROCESSING: (ApplicationStatus.COMPLETED,),
}

# 幹部證明另有「已駁回」這個終態(D-37):不符資格的申請要有結束的方法,
# 否則只能一直掛在待處理裡。**郵局帳戶異動不跟進**,那邊沿用 _ALLOWED_NEXT。
_CERT_NEXT = {
    src: (*nxt, ApplicationStatus.DECLINED) for src, nxt in _ALLOWED_NEXT.items()
}

_STATUS_LABELS = {
    ApplicationStatus.PENDING: "審核中",
    ApplicationStatus.PROCESSING: "處理中",
    ApplicationStatus.COMPLETED: "已完成",
    ApplicationStatus.DECLINED: "已駁回",
}


def _status_order(model) -> sa.Case:
    return sa.case(
        (model.status == ApplicationStatus.PENDING, 0),
        (model.status == ApplicationStatus.PROCESSING, 1),
        else_=2,
    )


@router.get("/officer-certificates")
async def list_officer_certs(
    user: CertAdmin,
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
    user: PostalAdmin,
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


async def _advance_status(db, row, body: ApplicationStatusIn, allowed=_ALLOWED_NEXT):
    """只准往前的檢核(呼叫端先 with_for_update 取列)。

    與 `admin_maintenance` 的單步前進不同:那邊的「處理中」代表師傅真的在修,
    這裡的處理中只是承辦的工作註記,跳過它不會漏掉任何一次真實動作。
    """
    if body.status not in allowed.get(row.status, ()):
        raise conflict(
            f"無法從「{_STATUS_LABELS[row.status]}」變更為「{_STATUS_LABELS[body.status]}」",
            code="INVALID_STATUS_TRANSITION",
        )
    row.status = body.status


@router.post("/officer-certificates/{cert_id}/status")
async def update_officer_cert_status(
    cert_id: int,
    body: ApplicationStatusIn,
    user: CertAdmin,
    db: DbDep,
    request: Request,
    background: BackgroundTasks,
) -> ApiResponse[AdminOfficerCertOut]:
    row = await db.scalar(
        sa.select(OfficerCertificate).where(OfficerCertificate.id == cert_id).with_for_update()
    )
    if row is None:
        raise not_found("找不到幹部證明申請")
    await _advance_status(db, row, body, _CERT_NEXT)
    audit.record(
        db,
        action="officer_cert_status_updated",
        user=user,
        detail=f"officer_cert={row.id};status={body.status.value}",
        ip=client_ip(request),
    )
    await db.commit()

    club = await db.get(Club, row.club_id)
    # 駁回不附原因(承辦線下說明),通知只讓社團知道這張單結束了
    kind, title = {
        ApplicationStatus.COMPLETED: ("approve", "幹部證明已製作完成，請洽學務處領取"),
        ApplicationStatus.DECLINED: ("reject", "幹部證明已被駁回"),
    }.get(body.status, ("alert", "幹部證明處理中"))
    background.add_task(
        notify.club_event,
        kind,
        title,
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
    user: PostalAdmin,
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
