import asyncio
import contextlib
import logging
from collections.abc import AsyncIterator

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError
from starlette.datastructures import MutableHeaders
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.api.v1 import router as api_v1_router
from app.core.config import settings
from app.core.errors import AppError
from app.services import heartbeat

logger = logging.getLogger("club_aio")

_IS_DEV = settings.env == "dev"

@contextlib.asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    """背景心跳的起停(唯一在程序內跑的排程;業務排程一律走 host cron)。"""
    task = asyncio.create_task(heartbeat.run()) if heartbeat.enabled() else None
    try:
        yield
    finally:
        if task is not None:
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await task


# docs 掛在 /api 下,經 nginx 反代一樣可用;正式環境不暴露 API 介面說明
app = FastAPI(
    title="club-aio",
    docs_url="/api/docs" if _IS_DEV else None,
    openapi_url="/api/openapi.json" if _IS_DEV else None,
    redoc_url=None,
    lifespan=lifespan,
)
app.include_router(api_v1_router, prefix="/api/v1")

# API 安全標頭(SPA 的 CSP 在 web 層 nginx 補;此處為 API/檔案回應)
_SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
    "Cache-Control": "no-store",
}


class SecurityHeadersMiddleware:
    """純 ASGI(BaseHTTPMiddleware 會干擾串流回應與 BackgroundTasks)。"""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        # Swagger UI(僅 dev 存在)需要載入自身資源,不套 default-src 'none'
        skip_csp = scope["path"].startswith("/api/docs")

        async def send_with_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                for key, value in _SECURITY_HEADERS.items():
                    if key == "Content-Security-Policy" and skip_csp:
                        continue
                    if key not in headers:
                        headers.append(key, value)
            await send(message)

        await self.app(scope, receive, send_with_headers)


app.add_middleware(SecurityHeadersMiddleware)


def _envelope(status: int, error: str, meta: dict | None = None) -> JSONResponse:
    return JSONResponse(
        status_code=status,
        content={"success": False, "data": None, "error": error, "meta": meta},
    )


# 錯誤也走統一信封 { success, data, error, meta },前端只需解析一種格式
@app.exception_handler(AppError)
async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    return _envelope(exc.status, exc.message, {"code": exc.code})


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    resp = _envelope(exc.status_code, str(exc.detail), {"code": f"HTTP_{exc.status_code}"})
    if getattr(exc, "headers", None):
        resp.headers.update(exc.headers)
    return resp


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    # 不回傳 input/url:巨型或敏感輸入不得在錯誤回應中二次外洩(defense in depth)
    detail = [
        {k: v for k, v in err.items() if k not in {"input", "url"}} for err in exc.errors()
    ]
    return _envelope(
        422, "輸入驗證失敗", {"code": "VALIDATION", "detail": jsonable_encoder(detail)}
    )


# 唯一鍵與排除約束:應用層先查再寫,擋下來的第二筆就是另一個交易搶先,重試才有意義。
# 外鍵不在此列 —— 唯一會撞 FK 的刪帳號已在端點內攔下,剩下的只會是引用了不存在的 id
_CONFLICT_SQLSTATES = {"23505", "23P01"}


@app.exception_handler(IntegrityError)
async def integrity_error_handler(request: Request, exc: IntegrityError) -> JSONResponse:
    # NOT NULL、CHECK 等其餘約束是程式缺陷,包成「重複送出」只會讓使用者一直重試
    if getattr(exc.orig, "sqlstate", None) not in _CONFLICT_SQLSTATES:
        return await unhandled_exception_handler(request, exc)
    # 唯一鍵競態(如雙擊送出):約束擋下的第二筆回 409,不是 500
    logger.warning("integrity conflict on %s %s", request.method, request.url.path)
    return _envelope(409, "資料狀態已變更或重複送出，請重新整理後再試", {"code": "CONFLICT"})


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    # 內部細節只進 log,不回傳給使用者
    logger.exception("unhandled error on %s %s", request.method, request.url.path)
    return _envelope(500, "伺服器內部錯誤，請稍後再試", {"code": "INTERNAL"})
