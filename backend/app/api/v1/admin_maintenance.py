"""行政端:社團空間維修管理(列表 + 狀態流轉)。

- 預設排序=待處理 → 處理中 → 已完成,組內申請日升冪;支援地點/申請日排序參數
- 狀態流轉:待處理 → 處理中 → 已完成(僅允許單步前進);audit + notify 社團
"""

from typing import Annotated

import sqlalchemy as sa
from fastapi import APIRouter, BackgroundTasks, Depends, Query, Request

from app.api.pagination import Pagination, parse_sort
from app.core.deps import CurrentUser, DbDep, client_ip, require_permission
from app.core.errors import conflict, not_found
from app.models import Club, MaintenanceRequest
from app.models.enums import MaintenanceStatus
from app.schemas.activities import FileOut
from app.schemas.admin import AdminMaintenanceOut, MaintenanceStatusIn
from app.schemas.common import ApiResponse
from app.services import audit, notify
from app.services import files as file_service

router = APIRouter(prefix="/admin/maintenance", tags=["admin"])

MaintAdmin = Annotated[CurrentUser, Depends(require_permission("amaint"))]

_STATUS_ORDER = sa.case(
    (MaintenanceRequest.status == MaintenanceStatus.PENDING, 0),
    (MaintenanceRequest.status == MaintenanceStatus.IN_PROGRESS, 1),
    else_=2,
)

_SORTABLE = {
    "location": MaintenanceRequest.location,
    "created_at": MaintenanceRequest.created_at,  # 申請日
    # 狀態依處理進度排,不是列舉字面值(待處理要在最上面)
    "status": _STATUS_ORDER,
}


@router.get("")
async def list_maintenance(
    user: MaintAdmin,
    db: DbDep,
    page: Pagination,
    sort: str | None = None,
    status: MaintenanceStatus | None = None,
    club_id: int | None = Query(None),
) -> ApiResponse[list[AdminMaintenanceOut]]:
    query = sa.select(MaintenanceRequest, Club.name).join(
        Club, MaintenanceRequest.club_id == Club.id
    )
    if status:
        query = query.where(MaintenanceRequest.status == status)
    if club_id:
        query = query.where(MaintenanceRequest.club_id == club_id)

    if sort:
        query = query.order_by(*parse_sort(sort, _SORTABLE, None), MaintenanceRequest.id)
    else:
        # 預設:待處理 → 處理中 → 已完成,各組內申請日升冪
        query = query.order_by(
            _STATUS_ORDER, MaintenanceRequest.created_at.asc(), MaintenanceRequest.id
        )

    total = await db.scalar(sa.select(sa.func.count()).select_from(query.subquery()))
    rows = (await db.execute(query.offset(page.offset).limit(page.page_size))).all()
    # 佐證照片/影片是判斷依據,和單子一起回(整頁一次查,不逐列)
    evidence = await file_service.files_by_subject(db, "maintenance", [r.id for r, _ in rows])
    data = []
    for req, club_name in rows:
        out = AdminMaintenanceOut.model_validate(req)
        out.club_name = club_name
        out.evidence = [FileOut.model_validate(f) for f in evidence.get(req.id, [])]
        data.append(out)
    return ApiResponse(data=data, meta=page.meta(total or 0))


# 狀態機:待處理 → 處理中 → 已完成(僅允許單步前進,不可回退/跳關)
_NEXT_STATUS = {
    MaintenanceStatus.PENDING: MaintenanceStatus.IN_PROGRESS,
    MaintenanceStatus.IN_PROGRESS: MaintenanceStatus.DONE,
}

_STATUS_LABELS = {
    MaintenanceStatus.PENDING: "待處理",
    MaintenanceStatus.IN_PROGRESS: "處理中",
    MaintenanceStatus.DONE: "已完成",
}


@router.post("/{request_id}/status")
async def update_status(
    request_id: int,
    body: MaintenanceStatusIn,
    user: MaintAdmin,
    db: DbDep,
    request: Request,
    background: BackgroundTasks,
) -> ApiResponse[AdminMaintenanceOut]:
    row = await db.scalar(
        sa.select(MaintenanceRequest).where(MaintenanceRequest.id == request_id).with_for_update()
    )
    if row is None:
        raise not_found("找不到報修申請")
    if _NEXT_STATUS.get(row.status) != body.status:
        raise conflict(
            f"無法從「{_STATUS_LABELS[row.status]}」變更為「{_STATUS_LABELS[body.status]}」",
            code="INVALID_STATUS_TRANSITION",
        )

    row.status = body.status
    if body.handle_note is not None:
        row.handle_note = body.handle_note
    audit.record(
        db,
        action="maintenance_status_updated",
        user=user,
        detail=f"maintenance={row.id};status={body.status.value}",
        ip=client_ip(request),
    )
    await db.commit()

    club = await db.get(Club, row.club_id)
    done = body.status == MaintenanceStatus.DONE
    background.add_task(
        notify.club_event,
        "approve" if done else "alert",
        "空間報修已完成" if done else "空間報修處理中",
        f"{club.name}:{row.location}({row.items})",
        club.discord_webhook_url,
    )
    out = AdminMaintenanceOut.model_validate(row)
    out.club_name = club.name
    return ApiResponse(data=out)
