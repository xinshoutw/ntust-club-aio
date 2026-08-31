"""免登入的借用情形資料(`/public/*`)。

首頁的公開預覽、社團端「借用總覽」與行政端「臨時場地器材借用」看的是同一張色格圖,
資料來源也只該有一份 —— 一張圖分三支端點,遲早三邊講出不同的事。

登入中的社團帳號仍拿得到 `mine` 標記(`OptionalUser`);匿名只看得到佔用狀態與借用單位。
"""

from datetime import date

import sqlalchemy as sa
from fastapi import APIRouter

from app.core.deps import DbDep, OptionalUser, admin_with
from app.core.errors import validation_error
from app.models import Equipment, Venue
from app.schemas.auth import PeriodOut
from app.schemas.bookings import EquipmentUsageOut, VenueOut
from app.schemas.common import ApiResponse
from app.services import booking_service as svc

router = APIRouter(prefix="/public", tags=["public"])

MAX_AVAILABILITY_SPAN_DAYS = 31  # 單一場地 15 天檢視用;上限防範圍濫用


def _sees_pending(user) -> bool:
    """待審單清單只給審這一關的承辦(`abooking`)。

    社團與匿名不該知道別人送了什麼還沒過 —— 格色已經說了「這個時段有人在等」,
    是誰在等是審核端的事。
    """
    return admin_with("abooking", user)


def _strip_block_reasons(grid: dict) -> dict:
    """匿名不給不開放原因。

    借用社團名是主檔上的專有名詞,等同貼在場地門口;`blocked` 格的 `club` 卻是承辦
    自己打的自由文字(「XX 社違規停用」那一類),沒有任何格式約束,不該對外。
    格色照舊,只是沒有 hover —— 前端無社名本來就不掛 tooltip。
    """
    for cells in grid.values():
        for cell in cells.values():
            if cell["status"] == "blocked":
                cell["club"] = None
    return grid


@router.get("/periods")
async def periods() -> ApiResponse[list[PeriodOut]]:
    """節次目錄。登入者由 `/auth/me` 帶,未登入的公開首頁只能從這裡拿。"""
    return ApiResponse(data=[PeriodOut(**p) for p in svc.period_catalogue()])


@router.get("/venues")
async def list_venues(db: DbDep) -> ApiResponse[list[VenueOut]]:
    rows = await db.scalars(
        sa.select(Venue).where(Venue.is_active.is_(True)).order_by(Venue.sort, Venue.id)
    )
    return ApiResponse(data=[VenueOut.model_validate(v) for v in rows])


@router.get("/bookings/availability")
async def availability(user: OptionalUser, db: DbDep, date: date) -> ApiResponse[dict]:
    grid = await svc.availability_grid(
        db, date, user.club_id if user else None, with_pending=_sees_pending(user)
    )
    if user is None:
        _strip_block_reasons(grid)
    return ApiResponse(data={"date": date.isoformat(), "grid": grid})


@router.get("/bookings/availability-range")
async def availability_range(
    user: OptionalUser, db: DbDep, start: date, end: date, venue: int | None = None
) -> ApiResponse[dict]:
    """區間逐日場況(單一場地多天檢視):取代前端逐日並行請求。

    venue 給定時 SQL 端即縮小到該場地(15 天檢視本就單場地,不必撈全校)。
    """
    if end < start:
        raise validation_error("結束日期不得早於開始日期")
    if (end - start).days + 1 > MAX_AVAILABILITY_SPAN_DAYS:
        raise validation_error(f"查詢區間最多 {MAX_AVAILABILITY_SPAN_DAYS} 天")
    grids = await svc.availability_grids(
        db,
        start,
        end,
        user.club_id if user else None,
        venue_id=venue,
        with_pending=_sees_pending(user),
    )
    if user is None:
        for grid in grids.values():
            _strip_block_reasons(grid)
    return ApiResponse(
        data={"days": [{"date": d.isoformat(), "grid": g} for d, g in grids.items()]}
    )


@router.get("/equipment/usage")
async def equipment_usage(
    db: DbDep, start: date, end: date
) -> ApiResponse[list[EquipmentUsageOut]]:
    """器材色格:區間內每項器材逐日的佔用量(色格依 佔用/總數 上色)。"""
    if end < start:
        raise validation_error("結束日期不得早於開始日期")
    if (end - start).days + 1 > MAX_AVAILABILITY_SPAN_DAYS:
        raise validation_error(f"查詢區間最多 {MAX_AVAILABILITY_SPAN_DAYS} 天")
    rows = (
        await db.scalars(
            sa.select(Equipment)
            .where(Equipment.is_active.is_(True))
            .order_by(Equipment.sort, Equipment.id)
        )
    ).all()
    usage = await svc.equipment_usage_by_day(db, start, end)
    return ApiResponse(
        data=[
            EquipmentUsageOut(
                id=eq.id,
                name=eq.name,
                total_qty=eq.total_qty,
                used={d.isoformat(): qty for d, qty in sorted(usage.get(eq.id, {}).items())},
            )
            for eq in rows
        ]
    )
