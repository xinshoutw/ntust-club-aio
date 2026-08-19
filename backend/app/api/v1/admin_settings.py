"""行政端:系統設定(權限鍵 asetting;場地與器材主檔亦在此頁)。

- GET 回傳全部受管鍵(DB 值,無則預設值)
- PUT 部分更新:僅寫入有帶的鍵;實際變動的鍵連改前改後值記進 audit
- 「線上報名時間窗」與「固定借用開放月份+手動加開」已廢除:
  報名窗由各報名活動起訖決定;固定借用開放改日期區間(open_from/open_until)
"""

import json
from typing import Annotated, Any

import sqlalchemy as sa
from fastapi import APIRouter, Depends, Request

from app.core.deps import CurrentUser, DbDep, client_ip, require_permission
from app.core.errors import conflict
from app.models import RoomBookingRequest
from app.models.enums import BookingStatus
from app.schemas.common import ApiResponse
from app.schemas.settings import SettingsUpdateIn
from app.services import audit
from app.services import booking_service as svc
from app.services.settings_service import get_budget_categories, get_setting, set_setting

router = APIRouter(prefix="/admin/settings", tags=["admin"])

PageAdmin = Annotated[CurrentUser, Depends(require_permission("asetting"))]

# 受管鍵(與 SettingsUpdateIn 欄位一致;GET 依此彙整)
MANAGED_KEYS = (
    "fixed_booking_window",
    "equipment_workday_buffer",
    "close_lock_days",
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


_BRIEF_MAX = 200
_MAX_DIFF_ITEMS = 5


def _brief(value: Any) -> str:
    """稽核要看得出改前改後,但科目/違規項目這類長清單不該把稽核表格撐爆。"""
    text = json.dumps(value, ensure_ascii=False, sort_keys=True)
    return text if len(text) <= _BRIEF_MAX else f"{text[:_BRIEF_MAX]}…"


def _diff(before: Any, after: Any) -> str:
    """清單只記增減:整份寫出來會超長,而截斷後改前改後會塌成同一段字,等於什麼都沒記。"""
    if not (isinstance(before, list) and isinstance(after, list)):
        return f"{_brief(before)}→{_brief(after)}"
    parts = [f"-{_brief(x)}" for x in before if x not in after]
    parts += [f"+{_brief(x)}" for x in after if x not in before]
    if not parts:
        return "順序調整"
    if len(parts) > _MAX_DIFF_ITEMS:
        return "、".join(parts[:_MAX_DIFF_ITEMS]) + f"…等 {len(parts)} 項"
    return "、".join(parts)


@router.get("")
async def get_settings(user: PageAdmin, db: DbDep) -> ApiResponse[dict[str, Any]]:
    data = {key: await get_setting(db, key) for key in MANAGED_KEYS}
    # 舊 list[str] 殘留一律正規化為 [{name, hint}],編輯器才不會拿到空列
    data["budget_categories"] = await get_budget_categories(db)
    return ApiResponse(data=data)


async def _guard_intake_semester(db, new_window: Any) -> None:
    """改受理期間不得把「這一輪的目標學期」換掉,只要已經收到申請。

    目標學期由受理期間結束日推導(`fixed_target_semester`,ISS-33)。把 open_until
    從 7/31 延到 8/1 這種「再開三天」就會讓它從 115-1 跳到 115-2,而已收到的申請
    存的是舊學期的起訖快照 —— 每社 10 節額度歸零、場況圖清空,連核准關的重疊檢核
    都因為兩個學期區間不重疊而擋不住同一間教室被雙重核准。
    """
    old = await get_setting(db, "fixed_booking_window")
    if not isinstance(new_window, dict):
        return
    old_target = svc.fixed_target_semester(old)
    if svc.fixed_target_semester(new_window) == old_target:
        return
    filed = await db.scalar(
        sa.select(sa.func.count())
        .select_from(RoomBookingRequest)
        .where(
            RoomBookingRequest.start_date == old_target[0],
            RoomBookingRequest.status != BookingStatus.CANCELLED,
        )
    )
    if filed:
        raise conflict(
            f"這一輪已收到 {filed} 張申請,改受理期間會把目標學期換掉("
            f"{old_target[0]}~{old_target[1]} → 另一個學期),額度與場況圖都會對不上。"
            "請先處理完這一輪的申請",
            code="INTAKE_SEMESTER_LOCKED",
        )


@router.put("")
async def update_settings(
    body: SettingsUpdateIn, user: PageAdmin, db: DbDep, request: Request
) -> ApiResponse[dict[str, Any]]:
    changes = body.model_dump(exclude_unset=True, exclude_none=True)
    if "fixed_booking_window" in changes:
        await _guard_intake_semester(db, _to_json(body.fixed_booking_window))
    diffs = []
    for key in sorted(changes):
        value = _to_json(getattr(body, key))
        before = await get_setting(db, key)  # 必須在寫入前讀:set_setting 就地改同一列
        if before != value:
            diffs.append(f"{key}={_diff(before, value)}")
        await set_setting(db, key, value)
    if diffs:
        audit.record(
            db,
            action="settings_updated",
            user=user,
            detail=";".join(diffs),
            ip=client_ip(request),
        )
    await db.commit()
    data = {key: await get_setting(db, key) for key in MANAGED_KEYS}
    return ApiResponse(data=data)
