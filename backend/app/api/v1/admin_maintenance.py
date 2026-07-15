"""行政端:社團空間維修管理列表。

預設排序=待處理 → 處理中 → 已完成,組內申請日升冪;支援地點/申請日排序參數。
"""

from typing import Annotated

import sqlalchemy as sa
from fastapi import APIRouter, Depends, Query

from app.api.pagination import Pagination, parse_sort
from app.core.deps import CurrentUser, DbDep, require_permission
from app.models import Club, MaintenanceRequest
from app.models.enums import MaintenanceStatus
from app.schemas.admin import AdminMaintenanceOut
from app.schemas.common import ApiResponse

router = APIRouter(prefix="/admin/maintenance", tags=["admin"])

MaintAdmin = Annotated[CurrentUser, Depends(require_permission("amaint"))]

_SORTABLE = {
    "location": MaintenanceRequest.location,
    "created_at": MaintenanceRequest.created_at,  # 申請日
}

_STATUS_ORDER = sa.case(
    (MaintenanceRequest.status == MaintenanceStatus.PENDING, 0),
    (MaintenanceRequest.status == MaintenanceStatus.IN_PROGRESS, 1),
    else_=2,
)


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
    rows = await db.execute(query.offset(page.offset).limit(page.page_size))
    data = []
    for req, club_name in rows:
        out = AdminMaintenanceOut.model_validate(req)
        out.club_name = club_name
        data.append(out)
    return ApiResponse(data=data, meta=page.meta(total or 0))
