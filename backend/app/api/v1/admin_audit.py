"""行政端:稽核軌跡列表(最高權限專屬,唯讀)。

每頁 20 筆(全站分頁預設);支援 operator(user_id)/role/action 篩選。
"""

from typing import Annotated

import sqlalchemy as sa
from fastapi import APIRouter, Depends, Query

from app.api.pagination import Pagination
from app.core.deps import CurrentUser, DbDep, require_super
from app.models import AuditLog, User
from app.schemas.admin import AuditLogOut
from app.schemas.common import ApiResponse

router = APIRouter(prefix="/admin/audit", tags=["admin"])

SuperAdmin = Annotated[CurrentUser, Depends(require_super)]


@router.get("")
async def list_audit_logs(
    user: SuperAdmin,
    db: DbDep,
    page: Pagination,
    user_id: int | None = Query(None),  # operator 篩選
    role: str | None = Query(None),
    action: str | None = Query(None),
) -> ApiResponse[list[AuditLogOut]]:
    query = sa.select(AuditLog, User.name).outerjoin(User, AuditLog.user_id == User.id)
    if user_id:
        query = query.where(AuditLog.user_id == user_id)
    if role:
        query = query.where(AuditLog.role == role)
    if action:
        query = query.where(AuditLog.action == action)
    query = query.order_by(AuditLog.created_at.desc(), AuditLog.id.desc())

    total = await db.scalar(sa.select(sa.func.count()).select_from(query.subquery()))
    rows = await db.execute(query.offset(page.offset).limit(page.page_size))
    data = []
    for log, user_name in rows:
        out = AuditLogOut.model_validate(log)
        out.user_name = user_name
        data.append(out)
    return ApiResponse(data=data, meta=page.meta(total or 0))
