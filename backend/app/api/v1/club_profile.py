"""社團端:管理項目(簡介/網頁/指導老師/Discord webhook)。"""

from fastapi import APIRouter, Request

from app.core.deps import ClubUser, DbDep, client_ip
from app.core.errors import not_found
from app.models import Club
from app.schemas.clubs import ClubProfileOut, ClubProfileUpdate
from app.schemas.common import ApiResponse
from app.services import audit

router = APIRouter(prefix="/club/profile", tags=["club"])


async def _own_club(db: DbDep, user) -> Club:
    club = await db.get(Club, user.club_id)
    if club is None or not club.is_active:
        raise not_found("找不到社團資料")
    return club


@router.get("")
async def get_profile(user: ClubUser, db: DbDep) -> ApiResponse[ClubProfileOut]:
    club = await _own_club(db, user)
    return ApiResponse(data=ClubProfileOut.model_validate(club))


@router.patch("")
async def update_profile(
    body: ClubProfileUpdate, user: ClubUser, db: DbDep, request: Request
) -> ApiResponse[ClubProfileOut]:
    club = await _own_club(db, user)
    changed = body.model_dump(exclude_unset=True)
    for field, value in changed.items():
        setattr(club, field, value)
    if changed:
        audit.record(
            db,
            action="club_profile_updated",
            user=user,
            detail=f"fields={','.join(sorted(changed))}",
            ip=client_ip(request),
        )
    await db.commit()
    await db.refresh(club)
    return ApiResponse(data=ClubProfileOut.model_validate(club))
