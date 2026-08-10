"""線上報名:管理員自訂表單欄位的驗證與報名窗推導。

fields 定義(signup_items.fields):
[{key, label, type(text/textarea/radio/checkbox/select), options[], required}]
陣列順序即顯示順序;answers 形狀:{field_key: value};checkbox 的 value 為選項陣列。
"""

from datetime import UTC, datetime
from typing import Any

from app.models import SignupItem

_TEXT_MAX = 1000


def window_open(item: SignupItem, now: datetime | None = None) -> bool:
    """報名窗:is_open 且 signup_start <= now <= signup_end。"""
    now = now or datetime.now(UTC)
    if not item.is_open:
        return False
    if item.signup_start is not None and now < item.signup_start:
        return False
    return not (item.signup_end is not None and now > item.signup_end)


def normalize_fields(fields: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """補齊/驗證欄位 key:未帶 key 依序補 f1、f2…;key 不得重複。順序保持原樣。"""
    used = {f["key"] for f in fields if f.get("key")}
    if len(used) != sum(1 for f in fields if f.get("key")):
        raise ValueError("欄位 key 重複")
    result = []
    serial = 0
    for field in fields:
        key = field.get("key")
        if not key:
            serial += 1
            while f"f{serial}" in used:
                serial += 1
            key = f"f{serial}"
            used.add(key)
        result.append({**field, "key": key})
    return result


def validate_answers(fields: list[dict[str, Any]], answers: dict[str, Any]) -> list[str]:
    """回傳錯誤訊息清單(空=通過)。未知欄位一律拒絕。"""
    errors: list[str] = []
    known_keys = {f.get("key") for f in fields if f.get("key")}
    for key in answers:
        if key not in known_keys:
            errors.append(f"未知欄位:{key}")

    for field in fields:
        key = field.get("key")
        if not key:  # 欄位定義不良(缺 key)不得炸 500
            errors.append("表單欄位定義有誤,請聯絡學務處")
            continue
        label = field.get("label", key)
        ftype = field.get("type", "text")
        required = bool(field.get("required"))
        options = field.get("options") or []
        value = answers.get(key)

        if value in (None, "", []):
            if required:
                errors.append(f"「{label}」為必填")
            continue

        match ftype:
            case "text" | "textarea":
                if not isinstance(value, str) or len(value) > _TEXT_MAX:
                    errors.append(f"「{label}」格式錯誤")
            case "radio" | "select":
                if value not in options:
                    errors.append(f"「{label}」的值不在選項中")
            case "checkbox":
                if not isinstance(value, list) or any(v not in options for v in value):
                    errors.append(f"「{label}」的值不在選項中")
            case _:
                errors.append(f"「{label}」欄位型別未知")
    return errors
