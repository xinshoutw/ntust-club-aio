from typing import Any

from pydantic import BaseModel


class ApiResponse[T](BaseModel):
    """統一回應信封:{ success, data, error, meta }"""

    success: bool = True
    data: T | None = None
    error: str | None = None
    meta: dict[str, Any] | None = None
