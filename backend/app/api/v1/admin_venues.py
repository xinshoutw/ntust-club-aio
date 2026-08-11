"""行政端:場地主檔維護(僅 super)。

形狀比照器材主檔(admin_equipment):名稱/容納人數/類別/借用型態/啟用為 CRUD。
刪除採停用(is_active=False),避免既有借用單與不開放規則的外鍵斷裂。
"""

from typing import Annotated

import sqlalchemy as sa
from fastapi import APIRouter, Depends, Request

from app.core.deps import CurrentUser, DbDep, client_ip, require_permission, require_super
from app.core.errors import conflict, not_found
from app.models import Venue
from app.schemas.bookings import VenueIn, VenueMasterOut, VenueUpdateIn
from app.schemas.common import ApiResponse
from app.services import audit

router = APIRouter(prefix="/admin/venues", tags=["admin"])

SuperAdmin = Annotated[CurrentUser, Depends(require_super)]
# 列表另供場況圖與手動借用取列首名稱,權限維持 abooking(super 全通)
BookingAdmin = Annotated[CurrentUser, Depends(require_permission("abooking"))]


@router.get("")
async def list_venues(
    user: BookingAdmin, db: DbDep, include_inactive: bool = False
) -> ApiResponse[list[VenueMasterOut]]:
    """場地主檔(不分頁);預設只回啟用中,主檔維護頁帶 include_inactive=true 才看得到停用的。"""
    query = sa.select(Venue).order_by(Venue.sort, Venue.id)
    if not include_inactive:
        query = query.where(Venue.is_active.is_(True))
    return ApiResponse(data=[VenueMasterOut.model_validate(r) for r in await db.scalars(query)])


@router.post("", status_code=201)
async def create_venue(
    body: VenueIn, user: SuperAdmin, db: DbDep, request: Request
) -> ApiResponse[VenueMasterOut]:
    if await db.scalar(sa.select(Venue.id).where(Venue.name == body.name)):
        raise conflict("已有同名場地")
    max_sort = await db.scalar(sa.select(sa.func.coalesce(sa.func.max(Venue.sort), 0)))
    row = Venue(
        name=body.name,
        capacity=body.capacity,
        category=body.category,
        allow_fixed=body.allow_fixed,
        allow_temp=body.allow_temp,
        sort=(max_sort or 0) + 1,
    )
    db.add(row)
    audit.record(db, action="venue_created", user=user, detail=body.name, ip=client_ip(request))
    await db.commit()
    return ApiResponse(data=VenueMasterOut.model_validate(row))


@router.patch("/{venue_id}")
async def update_venue(
    venue_id: int, body: VenueUpdateIn, user: SuperAdmin, db: DbDep, request: Request
) -> ApiResponse[VenueMasterOut]:
    row = await db.get(Venue, venue_id)
    if row is None:
        raise not_found("找不到場地")
    changed = body.model_dump(exclude_unset=True)
    if "name" in changed and changed["name"] != row.name:
        if await db.scalar(sa.select(Venue.id).where(Venue.name == changed["name"])):
            raise conflict("已有同名場地")
    for field, value in changed.items():
        setattr(row, field, value)
    audit.record(
        db,
        action="venue_updated",
        user=user,
        detail=f"{row.name}:{','.join(sorted(changed))}",
        ip=client_ip(request),
    )
    await db.commit()
    return ApiResponse(data=VenueMasterOut.model_validate(row))
