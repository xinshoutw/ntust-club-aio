"""線上報名:管理員自訂表單欄位的驗證。

fields 定義(signup_items.fields):
[{key, label, type(text/textarea/radio/checkbox/select), options[], required}]
answers 形狀:{field_key: value};checkbox 的 value 為選項陣列。
"""

from typing import Any

_TEXT_MAX = 1000


def validate_answers(fields: list[dict[str, Any]], answers: dict[str, Any]) -> list[str]:
    """回傳錯誤訊息清單(空=通過)。未知欄位一律拒絕。"""
    errors: list[str] = []
    known_keys = {f["key"] for f in fields}
    for key in answers:
        if key not in known_keys:
            errors.append(f"未知欄位:{key}")

    for field in fields:
        key, label = field["key"], field.get("label", field["key"])
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
