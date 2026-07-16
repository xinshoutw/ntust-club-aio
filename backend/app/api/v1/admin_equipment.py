"""行政端:器材主檔維護(僅 super;2026-07-17 需求方:管理員可設器材數量)。

器材主檔(名稱/類別/總數/是否登記序號/啟用)為 CRUD;可借數為推導(不在此)。
刪除採停用(is_active=False),避免既有借用紀錄的外鍵斷裂。
"""

from typing import Annotated

import sqlalchemy as sa
from fastapi import APIRouter, Depends, Request

from app.core.deps import CurrentUser, DbDep, client_ip, require_super
from app.core.errors import conflict, not_found
from app.models import Equipment
from app.schemas.common import ApiResponse
from app.schemas.equipment import EquipmentIn, EquipmentMasterOut, EquipmentUpdateIn
from app.services import audit

router = APIRouter(prefix="/admin/equipment", tags=["admin"])

SuperAdmin = Annotated[CurrentUser, Depends(require_super)]


@router.get("")
async def list_equipment(user: SuperAdmin, db: DbDep) -> ApiResponse[list[EquipmentMasterOut]]:
    rows = await db.scalars(sa.select(Equipment).order_by(Equipment.sort, Equipment.id))
    return ApiResponse(data=[EquipmentMasterOut.model_validate(r) for r in rows])


@router.post("", status_code=201)
async def create_equipment(
    body: EquipmentIn, user: SuperAdmin, db: DbDep, request: Request
) -> ApiResponse[EquipmentMasterOut]:
    if await db.scalar(sa.select(Equipment.id).where(Equipment.name == body.name)):
        raise conflict("已有同名器材")
    max_sort = await db.scalar(sa.select(sa.func.coalesce(sa.func.max(Equipment.sort), 0)))
    row = Equipment(
        name=body.name,
        total_qty=body.total_qty,
        needs_serial=body.needs_serial,
        sort=(max_sort or 0) + 1,
    )
    db.add(row)
    audit.record(db, action="equipment_created", user=user, detail=body.name, ip=client_ip(request))
    await db.commit()
    return ApiResponse(data=EquipmentMasterOut.model_validate(row))


@router.patch("/{equipment_id}")
async def update_equipment(
    equipment_id: int, body: EquipmentUpdateIn, user: SuperAdmin, db: DbDep, request: Request
) -> ApiResponse[EquipmentMasterOut]:
    row = await db.get(Equipment, equipment_id)
    if row is None:
        raise not_found("找不到器材")
    changed = body.model_dump(exclude_unset=True)
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
