from fastapi import FastAPI

from app.api.v1 import router as api_v1_router

# docs 掛在 /api 下,經 nginx 反代一樣可用
app = FastAPI(
    title="club-aio",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
    redoc_url=None,
)
app.include_router(api_v1_router, prefix="/api/v1")
