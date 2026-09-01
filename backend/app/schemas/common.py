from typing import Any

from pydantic import BaseModel


def strip_reason(v: str) -> str:
    """原因/備註類自由文字:去頭尾空白,全空白視同沒填。

    `min_length=1` 擋不住 "   " —— 那種值存進去之後,畫面上只會多出一個孤零零的分隔號。
    """
    v = v.strip()
    if not v:
        raise ValueError("原因不得為空白")
    return v


class ApiResponse[T](BaseModel):
    """統一回應信封:{ success, data, error, meta }"""

    success: bool = True
    data: T | None = None
    error: str | None = None
    meta: dict[str, Any] | None = None
