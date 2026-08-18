"""行政端:場地主檔維護(系統設定頁的場地卡片)。

形狀比照器材主檔(admin_equipment):名稱/容納人數/類別/借用型態/啟用為 CRUD。
刪除採停用(is_active=False),避免既有借用單與不開放規則的外鍵斷裂。
"""

from typing import Annotated

import sqlalchemy as sa
from fastapi import APIRouter, Depends, Request

from app.core import permissions
from app.core.deps import CurrentUser, DbDep, client_ip, require_permission
from app.core.errors import conflict, forbidden, not_found, validation_error
from app.models import Venue
from app.schemas.bookings import VenueIn, VenueMasterOut, VenueUpdateIn
from app.schemas.common import ApiResponse
from app.services import audit

router = APIRouter(prefix="/admin/venues", tags=["admin"])

SettingAdmin = Annotated[CurrentUser, Depends(require_permission("asetting"))]
# 列表另供場況圖與手動借用取列首名稱,權限維持 abooking(super 全通)
VenueReader = Annotated[CurrentUser, Depends(require_permission(*permissions.VENUE_READ_KEYS))]


@router.get("")
async def list_venues(
    user: VenueReader, db: DbDep, include_inactive: bool = False
) -> ApiResponse[list[VenueMasterOut]]:
    """場地主檔(不分頁);預設只回啟用中,主檔維護頁帶 include_inactive=true 才看得到停用的。"""
    query = sa.select(Venue).order_by(Venue.sort, Venue.id)
    if include_inactive:
        # 已停用的場地只有主檔維護視角需要 —— 那是系統設定頁的場地卡片
        if not (user.is_super or "asetting" in user.permissions):
            raise forbidden()
    else:
        query = query.where(Venue.is_active.is_(True))
    return ApiResponse(data=[VenueMasterOut.model_validate(r) for r in await db.scalars(query)])


@router.post("", status_code=201)
async def create_venue(
    body: VenueIn, user: SettingAdmin, db: DbDep, request: Request
) -> ApiResponse[VenueMasterOut]:
    existing = await db.scalar(sa.select(Venue).where(Venue.name == body.name))
    if existing is not None:
        # 停用的場地仍佔用名稱(預設清單看不到它):把原因講清楚,否則承辦會以為系統壞了
        raise conflict("已有同名場地" if existing.is_active else "已有同名場地(目前為停用狀態)")
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
    venue_id: int, body: VenueUpdateIn, user: SettingAdmin, db: DbDep, request: Request
) -> ApiResponse[VenueMasterOut]:
    row = await db.get(Venue, venue_id)
    if row is None:
        raise not_found("找不到場地")
    # capacity 是唯一可清空的欄位;其餘顯式帶 null 會撞 NOT NULL(500),當成無效輸入擋掉
    changed = {
        key: value
        for key, value in body.model_dump(exclude_unset=True).items()
        if value is not None or key == "capacity"
    }
    if not changed:
        raise validation_error("沒有可更新的欄位")
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
