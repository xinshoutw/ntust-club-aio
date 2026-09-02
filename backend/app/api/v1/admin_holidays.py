"""行政端:政府行事曆假日維護(系統設定頁的假日卡片,權限鍵 asetting)。

器材逾期的「結束日之隔天上班日 `equipment_return_time`(預設 10:30)」只看這張表
(`booking_service.add_workdays`);整年份每年由 `scripts/import_holidays.py` 匯入,
本端點供承辦補漏與臨時放假(颱風假)。**週六日不入表** —— 那條推導本來就排除週末
(擋在 `HolidayIn`)。
"""

from datetime import date
from typing import Annotated

import sqlalchemy as sa
from fastapi import APIRouter, Depends, Request
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.core.deps import CurrentUser, DbDep, client_ip, require_permission
from app.core.errors import not_found
from app.models import Holiday
from app.schemas.common import ApiResponse
from app.schemas.settings import HolidayIn, HolidayOut
from app.services import audit

router = APIRouter(prefix="/admin/holidays", tags=["admin"])

SettingAdmin = Annotated[CurrentUser, Depends(require_permission("asetting"))]


@router.get("")
async def list_holidays(user: SettingAdmin, db: DbDep) -> ApiResponse[list[HolidayOut]]:
    """全量回傳(週六日不入表,一年只有十幾筆);與 `load_holidays` 同一張表。"""
    rows = await db.scalars(sa.select(Holiday).order_by(Holiday.date))
    return ApiResponse(data=[HolidayOut.model_validate(r) for r in rows])


@router.post("", status_code=201)
async def upsert_holiday(
    body: HolidayIn, user: SettingAdmin, db: DbDep, request: Request
) -> ApiResponse[HolidayOut]:
    """新增或改名:主鍵是日期,同一天再送一次即覆蓋名稱(不當成衝突)。"""
    existing = await db.get(Holiday, body.date)  # 稽核要看得出改前改後,不能只記新名字
    await db.execute(
        pg_insert(Holiday)
        .values(date=body.date, name=body.name)
        # updated_at 的 onupdate 只在 ORM/core update 觸發,upsert 的 set_ 要自己帶
        .on_conflict_do_update(
            index_elements=[Holiday.date],
            set_={"name": body.name, "updated_at": sa.func.now()},
        )
    )
    audit.record(
        db,
        action="holiday_updated" if existing else "holiday_created",
        user=user,
        detail=(
            f"{body.date}={existing.name}→{body.name}" if existing else f"{body.date}={body.name}"
        ),
        ip=client_ip(request),
    )
    await db.commit()
    return ApiResponse(data=HolidayOut(date=body.date, name=body.name))


@router.delete("/{day}")
async def delete_holiday(
    day: date, user: SettingAdmin, db: DbDep, request: Request
) -> ApiResponse[None]:
    row = await db.get(Holiday, day)
    if row is None:
        raise not_found("找不到這一天的假日設定")
    await db.delete(row)
    audit.record(
        db, action="holiday_deleted", user=user, detail=f"{day}={row.name}", ip=client_ip(request)
    )
    await db.commit()
    return ApiResponse(data=None)
