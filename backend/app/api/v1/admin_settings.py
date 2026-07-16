"""行政端:系統設定(僅 super;2026-07-16 第八輪)。

- GET 回傳全部受管鍵(DB 值,無則預設值)
- PUT 部分更新:僅寫入有帶的鍵;記 audit
- 「線上報名時間窗」與「固定借用開放月份+手動加開」已廢除:
  報名窗由各報名活動起訖決定;固定借用開放改日期區間(open_from/open_until)
"""

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request

from app.core.deps import CurrentUser, DbDep, client_ip, require_super
from app.schemas.common import ApiResponse
from app.schemas.settings import SettingsUpdateIn
from app.services import audit
from app.services.settings_service import get_setting, set_setting

router = APIRouter(prefix="/admin/settings", tags=["admin"])

SuperAdmin = Annotated[CurrentUser, Depends(require_super)]

# 受管鍵(與 SettingsUpdateIn 欄位一致;GET 依此彙整)
MANAGED_KEYS = (
    "fixed_booking_window",
    "equipment_workday_buffer",
    "close_lock_months",
    "upload_limits",
    "activity_attachment_total_mb",
    "maintenance_total_mb",
    "close_photo_total_mb",
    "storage_limits",
    "eval_window",
    "violation_items",
    "budget_categories",
)


def _to_json(value: Any) -> Any:
    """序列化設定值:物件用其 to_json();list 逐項展開(如 budget_categories 的 {name,hint})。"""
    if hasattr(value, "to_json"):
        return value.to_json()
    if isinstance(value, list):
        return [_to_json(item) for item in value]
    return value


@router.get("")
async def get_settings(user: SuperAdmin, db: DbDep) -> ApiResponse[dict[str, Any]]:
    data = {key: await get_setting(db, key) for key in MANAGED_KEYS}
    return ApiResponse(data=data)


@router.put("")
async def update_settings(
    body: SettingsUpdateIn, user: SuperAdmin, db: DbDep, request: Request
) -> ApiResponse[dict[str, Any]]:
    changed = body.model_dump(exclude_unset=True, exclude_none=True)
    for key in changed:
        value = getattr(body, key)
        await set_setting(db, key, _to_json(value))
    if changed:
        audit.record(
            db,
            action="settings_updated",
            user=user,
            detail=f"keys={','.join(sorted(changed))}",
            ip=client_ip(request),
        )
    await db.commit()
    data = {key: await get_setting(db, key) for key in MANAGED_KEYS}
    return ApiResponse(data=data)
