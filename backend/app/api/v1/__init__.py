from fastapi import APIRouter

from app.api.v1 import (
    activities,
    applications,
    auth,
    bookings,
    club_profile,
    files,
    members,
    signups,
)
from app.schemas.common import ApiResponse

router = APIRouter()
router.include_router(auth.router)
router.include_router(files.router)
router.include_router(club_profile.router)
router.include_router(members.router)
router.include_router(activities.router)
router.include_router(bookings.router)
router.include_router(applications.router)
router.include_router(signups.router)


@router.get("/health")
async def health() -> ApiResponse[dict[str, str]]:
    return ApiResponse(data={"status": "ok"})
