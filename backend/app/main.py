import logging

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.middleware.base import BaseHTTPMiddleware

from app.api.v1 import router as api_v1_router
from app.core.errors import AppError

logger = logging.getLogger("club_aio")

# docs 掛在 /api 下,經 nginx 反代一樣可用
app = FastAPI(
    title="club-aio",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
    redoc_url=None,
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


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        for k, v in _SECURITY_HEADERS.items():
            response.headers.setdefault(k, v)
        return response


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
    return _envelope(
        422, "輸入驗證失敗", {"code": "VALIDATION", "detail": jsonable_encoder(exc.errors())}
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    # 內部細節只進 log,不回傳給使用者
    logger.exception("unhandled error on %s %s", request.method, request.url.path)
    return _envelope(500, "伺服器內部錯誤,請稍後再試", {"code": "INTERNAL"})
