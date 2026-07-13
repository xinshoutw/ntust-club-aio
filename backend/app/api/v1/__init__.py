from fastapi import APIRouter

from app.api.v1 import auth
from app.schemas.common import ApiResponse

router = APIRouter()
router.include_router(auth.router)


@router.get("/health")
async def health() -> ApiResponse[dict[str, str]]:
    return ApiResponse(data={"status": "ok"})
