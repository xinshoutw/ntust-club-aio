"""行政端:稽核軌跡列表(最高權限專屬,唯讀)。

每頁 20 筆(全站分頁預設);支援 operator(user_id)/role/action/日期區間篩選。
"""

from datetime import date, datetime, time, timedelta
from typing import Annotated

import sqlalchemy as sa
from fastapi import APIRouter, Depends, Query

from app.api.pagination import Pagination
from app.core.deps import CurrentUser, DbDep, require_super
from app.core.semesters import TAIPEI
from app.models import AuditLog, User
from app.schemas.admin import AuditLogOut, AuditOperatorOut, AuditOptionsOut
from app.schemas.common import ApiResponse

router = APIRouter(prefix="/admin/audit", tags=["admin"])

SuperAdmin = Annotated[CurrentUser, Depends(require_super)]


@router.get("/options")
async def audit_options(user: SuperAdmin, db: DbDep) -> ApiResponse[AuditOptionsOut]:
    """篩選選項取自實際留下的紀錄:操作者不必先翻到那一頁才篩得到,動作也不會漏掉新加的。"""
    operators = await db.execute(
        sa.select(AuditLog.user_id, User.name, User.username)
        .join(User, AuditLog.user_id == User.id)
        .distinct()
        .order_by(User.name)
    )
    actions = await db.scalars(sa.select(AuditLog.action).distinct().order_by(AuditLog.action))
    return ApiResponse(
        data=AuditOptionsOut(
            operators=[
                AuditOperatorOut(id=i, name=n, username=u) for i, n, u in operators
            ],
            actions=list(actions),
        )
    )


@router.get("")
async def list_audit_logs(
    user: SuperAdmin,
    db: DbDep,
    page: Pagination,
    user_id: int | None = Query(None),  # operator 篩選
    role: str | None = Query(None),
    action: str | None = Query(None),
    date_from: date | None = None,
    date_to: date | None = None,
) -> ApiResponse[list[AuditLogOut]]:
    query = sa.select(AuditLog, User.name).outerjoin(User, AuditLog.user_id == User.id)
    if user_id:
        query = query.where(AuditLog.user_id == user_id)
    if role:
        query = query.where(AuditLog.role == role)
    if action:
        query = query.where(AuditLog.action == action)
    # 區間以台北日界切,含頭含尾:畫面顯示的就是台北時間,選 8/11 就該拿到 8/11 整天
    if date_from:
        query = query.where(AuditLog.created_at >= datetime.combine(date_from, time(), TAIPEI))
    if date_to:
        end = datetime.combine(date_to + timedelta(days=1), time(), TAIPEI)
        query = query.where(AuditLog.created_at < end)
    query = query.order_by(AuditLog.created_at.desc(), AuditLog.id.desc())

    total = await db.scalar(sa.select(sa.func.count()).select_from(query.subquery()))
    rows = await db.execute(query.offset(page.offset).limit(page.page_size))
    data = []
    for log, user_name in rows:
        out = AuditLogOut.model_validate(log)
        out.user_name = user_name
        data.append(out)
    return ApiResponse(data=data, meta=page.meta(total or 0))
