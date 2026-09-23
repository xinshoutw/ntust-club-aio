"""統一錯誤:信封 { success:false, data:null, error:訊息, meta:{code, ...} }。

錯誤碼慣例見 docs/architecture.md §4;訊息一律面向使用者,不洩漏內部資訊。
"""


class AppError(Exception):
    def __init__(self, status: int, code: str, message: str, meta: dict | None = None) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        # 併進信封 meta 的機器可讀附帶資訊(例:一次送多筆時是第幾筆出錯,`slot`)
        self.meta = meta or {}


def bad_request(message: str, code: str = "BAD_REQUEST") -> AppError:
    return AppError(400, code, message)


def unauthenticated(message: str = "請先登入") -> AppError:
    return AppError(401, "UNAUTHENTICATED", message)


def forbidden(message: str = "沒有執行此操作的權限", code: str = "FORBIDDEN") -> AppError:
    return AppError(403, code, message)


def not_found(message: str = "找不到資源") -> AppError:
    return AppError(404, "NOT_FOUND", message)


def conflict(message: str, code: str = "CONFLICT", meta: dict | None = None) -> AppError:
    return AppError(409, code, message, meta)


def validation_error(message: str, code: str = "VALIDATION", meta: dict | None = None) -> AppError:
    return AppError(422, code, message, meta)


def rate_limited(message: str = "操作太頻繁,請稍後再試") -> AppError:
    return AppError(429, "RATE_LIMITED", message)
