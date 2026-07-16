from fastapi import APIRouter

from app.api.v1 import (
    activities,
    admin_accounts,
    admin_activities,
    admin_announcements,
    admin_audit,
    admin_bookings,
    admin_clubs,
    admin_equipment,
    admin_eval,
    admin_files,
    admin_maintenance,
    admin_overdue,
    admin_rooms,
    admin_settings,
    admin_signups,
    admin_violations,
    applications,
    auth,
    bookings,
    club_config,
    club_profile,
    files,
    members,
    signups,
)
from app.api.v1 import (
    eval as eval_api,
)
from app.schemas.common import ApiResponse

router = APIRouter()
router.include_router(auth.router)
router.include_router(files.router)
router.include_router(club_config.router)
router.include_router(club_profile.router)
router.include_router(members.router)
router.include_router(activities.router)
router.include_router(bookings.router)
router.include_router(applications.router)
router.include_router(signups.router)
router.include_router(eval_api.router)
router.include_router(admin_activities.router)
router.include_router(admin_announcements.router)
router.include_router(admin_bookings.router)
router.include_router(admin_clubs.router)
router.include_router(admin_equipment.router)
router.include_router(admin_overdue.router)
router.include_router(admin_rooms.router)
router.include_router(admin_eval.router)
router.include_router(admin_signups.router)
router.include_router(admin_violations.router)
router.include_router(admin_maintenance.router)
router.include_router(admin_audit.router)
router.include_router(admin_files.router)
router.include_router(admin_settings.router)
router.include_router(admin_accounts.router)


@router.get("/health")
async def health() -> ApiResponse[dict[str, str]]:
    return ApiResponse(data={"status": "ok"})
