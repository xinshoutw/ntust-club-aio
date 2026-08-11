"""行政端:違規勸導管理(開立日 +1 個月銷案期限,逾期截止)。

列表支援排序(日期/地點/項目/填寫人/期限/狀態白名單)與過濾;
預設排序=未銷案在前、時間升冪;逾期後銷案 API 拒絕(RESOLVE_EXPIRED)。
"""

from datetime import date
from typing import Annotated

import sqlalchemy as sa
from fastapi import APIRouter, BackgroundTasks, Depends, Query, Request

from app.api.pagination import Pagination, parse_sort
from app.core.deps import CurrentUser, DbDep, client_ip, require_permission
from app.core.errors import conflict, not_found
from app.models import Club, User, Violation
from app.models.enums import ViolationStatus
from app.schemas.admin import (
    AdminViolationOut,
    ResolveViolationIn,
    ViolationFillerOut,
    ViolationOptionsOut,
)
from app.schemas.common import ApiResponse
from app.services import audit, notify, violation_service

router = APIRouter(prefix="/admin/violations", tags=["admin"])

ViolationAdmin = Annotated[CurrentUser, Depends(require_permission("aviol"))]

_FILLER = sa.orm.aliased(User)

# 未銷案在前(業務語意),不是列舉字面值 —— 目前 'open' < 'resolved' 只是巧合
_STATUS_ORDER = sa.case((Violation.status == ViolationStatus.OPEN, 0), else_=1)

# 排序白名單:期限=開立日+1 個月(單調),以開立日排序等價
_SORTABLE = {
    "date": Violation.occurred_on,
    "location": Violation.location,
    "items": sa.func.array_to_string(Violation.items, "、"),
    "filler": _FILLER.name,
    "deadline": Violation.occurred_on,
    "status": _STATUS_ORDER,
    "created_at": Violation.created_at,
}


def _to_out(v: Violation, club_name: str, filler_name: str, today: date) -> AdminViolationOut:
    out = AdminViolationOut.model_validate(v)
    out.club_name = club_name
    out.filler_name = filler_name
    out.resolve_deadline = violation_service.resolve_deadline(v)
    out.resolve_expired = violation_service.resolve_expired(v, today)
    return out


@router.get("/options")
async def violation_options(user: ViolationAdmin, db: DbDep) -> ApiResponse[ViolationOptionsOut]:
    """篩選選項取自實際開立過的紀錄:承辦不必先翻到那一頁才篩得到,目錄改過也不漏舊項目。"""
    items_sub = sa.select(sa.func.unnest(Violation.items).label("item")).subquery()
    items = await db.scalars(sa.select(items_sub.c.item).distinct().order_by(items_sub.c.item))
    fillers = await db.execute(
        sa.select(_FILLER.id, _FILLER.name)
        .join(Violation, Violation.filler_id == _FILLER.id)
        .distinct()
        .order_by(_FILLER.name)
    )
    return ApiResponse(
        data=ViolationOptionsOut(
            items=list(items),
            fillers=[ViolationFillerOut(id=i, name=n) for i, n in fillers],
        )
    )


@router.get("")
async def list_violations(
    user: ViolationAdmin,
    db: DbDep,
    page: Pagination,
    sort: str | None = None,
    status: Annotated[list[ViolationStatus] | None, Query()] = None,
    club_id: Annotated[list[int] | None, Query()] = None,
    filler_id: Annotated[list[int] | None, Query()] = None,
    item: Annotated[list[str] | None, Query()] = None,
    location: str | None = Query(None),
    date_from: date | None = None,
    date_to: date | None = None,
    expired: bool | None = Query(None),
) -> ApiResponse[list[AdminViolationOut]]:
    # status/club_id/filler_id/item 可重複帶多值(畫面的漏斗是多選);item 多值=命中任一項
    query = (
        sa.select(Violation, Club.name, _FILLER.name)
        .join(Club, Violation.club_id == Club.id)
        .join(_FILLER, Violation.filler_id == _FILLER.id)
    )
    if status:
        query = query.where(Violation.status.in_(status))
    if club_id:
        query = query.where(Violation.club_id.in_(club_id))
    if filler_id:
        query = query.where(Violation.filler_id.in_(filler_id))
    if item:
        query = query.where(Violation.items.overlap(item))
    if location:
        query = query.where(Violation.location.ilike(f"%{location}%"))
    if date_from:
        query = query.where(Violation.occurred_on >= date_from)
    if date_to:
        query = query.where(Violation.occurred_on <= date_to)
    today = violation_service.today_taipei()
    if expired is not None:
        # 期限篩選僅對未銷案有意義(已銷案顯示 —)
        query = query.where(Violation.status == ViolationStatus.OPEN)
        deadline = violation_service.deadline_sql()
        query = query.where(deadline < today if expired else deadline >= today)

    if sort:
        query = query.order_by(*parse_sort(sort, _SORTABLE, None), Violation.id)
    else:
        # 預設排序:未銷案在前,各組內時間升冪
        query = query.order_by(_STATUS_ORDER, Violation.occurred_on.asc(), Violation.id)

    total = await db.scalar(sa.select(sa.func.count()).select_from(query.subquery()))
    rows = await db.execute(query.offset(page.offset).limit(page.page_size))
    data = [_to_out(v, club_name, filler_name, today) for v, club_name, filler_name in rows]
    return ApiResponse(data=data, meta=page.meta(total or 0))


@router.post("/{violation_id}/resolve")
async def resolve_violation(
    violation_id: int,
    body: ResolveViolationIn,
    user: ViolationAdmin,
    db: DbDep,
    request: Request,
    background: BackgroundTasks,
) -> ApiResponse[AdminViolationOut]:
    violation = await db.scalar(
        sa.select(Violation).where(Violation.id == violation_id).with_for_update()
    )
    if violation is None:
        raise not_found("找不到違規勸導紀錄")
    if violation.status != ViolationStatus.OPEN:
        raise conflict("此紀錄已銷案")
    today = violation_service.today_taipei()
    if violation_service.resolve_expired(violation, today):
        # 開立日 +1 個月逾期即截止:不再受理銷案,−1 扣分成立
        raise conflict("已逾銷案期限,不再受理銷案", code="RESOLVE_EXPIRED")

    violation.status = ViolationStatus.RESOLVED
    violation.resolve_note = body.note
    audit.record(
        db,
        action="violation_resolved",
        user=user,
        detail=f"violation={violation.id}",
        ip=client_ip(request),
    )
    await db.commit()

    club = await db.get(Club, violation.club_id)
    background.add_task(
        notify.club_event,
        "approve",
        "違規勸導已銷案",
        f"{club.name}:{violation.occurred_on} {violation.location}",
        club.discord_webhook_url,
    )
    filler = await db.get(User, violation.filler_id)
    return ApiResponse(data=_to_out(violation, club.name, filler.name if filler else "", today))
