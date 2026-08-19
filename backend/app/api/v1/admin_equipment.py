"""行政端:器材主檔維護(系統設定頁的器材卡片)。

器材主檔(名稱/類別/總數/是否登記序號/啟用)為 CRUD;可借數為推導(不在此)。
刪除採停用(is_active=False),避免既有借用紀錄的外鍵斷裂。
"""

from typing import Annotated

import sqlalchemy as sa
from fastapi import APIRouter, Depends, Request

from app.core.deps import CurrentUser, DbDep, client_ip, require_permission
from app.core.errors import conflict, not_found, validation_error
from app.models import Equipment
from app.schemas.common import ApiResponse
from app.schemas.equipment import EquipmentIn, EquipmentMasterOut, EquipmentUpdateIn
from app.services import audit

router = APIRouter(prefix="/admin/equipment", tags=["admin"])

SettingAdmin = Annotated[CurrentUser, Depends(require_permission("asetting"))]
# 手動借用頁要挑品項,讀得到主檔即可
MasterReader = Annotated[CurrentUser, Depends(require_permission("asetting", "amanual"))]


@router.get("")
async def list_equipment(user: MasterReader, db: DbDep) -> ApiResponse[list[EquipmentMasterOut]]:
    rows = await db.scalars(sa.select(Equipment).order_by(Equipment.sort, Equipment.id))
    return ApiResponse(data=[EquipmentMasterOut.model_validate(r) for r in rows])


@router.post("", status_code=201)
async def create_equipment(
    body: EquipmentIn, user: SettingAdmin, db: DbDep, request: Request
) -> ApiResponse[EquipmentMasterOut]:
    if await db.scalar(sa.select(Equipment.id).where(Equipment.name == body.name)):
        raise conflict("已有同名器材")
    max_sort = await db.scalar(sa.select(sa.func.coalesce(sa.func.max(Equipment.sort), 0)))
    row = Equipment(
        name=body.name,
        total_qty=body.total_qty,
        max_lease_count=body.max_lease_count,
        needs_serial=body.needs_serial,
        sort=(max_sort or 0) + 1,
    )
    db.add(row)
    audit.record(db, action="equipment_created", user=user, detail=body.name, ip=client_ip(request))
    await db.commit()
    return ApiResponse(data=EquipmentMasterOut.model_validate(row))


@router.patch("/{equipment_id}")
async def update_equipment(
    equipment_id: int, body: EquipmentUpdateIn, user: SettingAdmin, db: DbDep, request: Request
) -> ApiResponse[EquipmentMasterOut]:
    row = await db.get(Equipment, equipment_id)
    if row is None:
        raise not_found("找不到器材")
    # max_lease_count 是唯一可清空的欄位(null=不限);其餘顯式帶 null 會撞 NOT NULL(500)
    changed = {
        key: value
        for key, value in body.model_dump(exclude_unset=True).items()
        if value is not None or key == "max_lease_count"
    }
    if not changed:
        raise validation_error("沒有可更新的欄位")
    if "name" in changed and changed["name"] != row.name:
        if await db.scalar(sa.select(Equipment.id).where(Equipment.name == changed["name"])):
            raise conflict("已有同名器材")
    for field, value in changed.items():
        setattr(row, field, value)
    audit.record(
        db,
        action="equipment_updated",
        user=user,
        detail=f"{row.name}:{','.join(sorted(changed))}",
        ip=client_ip(request),
    )
    await db.commit()
    return ApiResponse(data=EquipmentMasterOut.model_validate(row))
