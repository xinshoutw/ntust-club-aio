"""免登入的借用情形與社團導覽資料(`/public/*`)。

首頁的公開預覽、社團端「借用總覽」與行政端「臨時場地器材借用」看的是同一張色格圖,
資料來源也只該有一份 —— 一張圖分三支端點,遲早三邊講出不同的事。

登入中的社團帳號仍拿得到 `mine` 標記(`OptionalUser`);匿名看得到佔用狀態、借用單位與
不開放原因,拿不到的只有待審單清單。
"""

import uuid
from datetime import date
from pathlib import Path
from typing import Annotated

import sqlalchemy as sa
from fastapi import APIRouter, Query
from fastapi import Path as PathParam
from fastapi.responses import FileResponse

from app.core.config import settings
from app.core.deps import DbDep, OptionalUser, admin_with
from app.core.errors import not_found, validation_error
from app.core.semesters import SEMESTER_LABEL, semester_range
from app.models import Activity, Club, Equipment, File, User, Venue
from app.models.enums import ActivityStatus
from app.schemas.auth import PeriodOut
from app.schemas.bookings import EquipmentUsageOut, VenueOut
from app.schemas.common import ApiResponse
from app.schemas.public import ClubCardOut, ClubDetailOut, PublicActivityOut
from app.services import booking_service as svc

router = APIRouter(prefix="/public", tags=["public"])

MAX_AVAILABILITY_SPAN_DAYS = 31  # 單一場地 15 天檢視用;上限防範圍濫用
MAX_PUBLIC_ACTIVITIES = 200  # 單一社團的歷年活動;上限防整表拖下來

# 主鍵是 PostgreSQL 的 int4:超界的值會在 asyncpg 綁參數時 OverflowError → 500,
# 而這些是**匿名打得到**的路徑 —— 未登入、零成本就能一次塞進三十份 traceback。
# 擋在 schema 就回 422,連 DB 都不必碰
# 公開通道只送形象圖。`media_type` 取自 DB 的 `files.mime`,而唯一的 writer
# (`save_club_image`)無條件寫 image/webp —— 但那是一條靠人記住的約定,不是程式收口。
# 真的被改成 text/html 的話,`content_disposition_type="inline"` 會讓它以同源 HTML 渲染;
# 全域的 `default-src 'none'` 擋得下 script,**但 CSP3 的 form-action 不 fallback 到
# default-src**,一份純 HTML 表單仍然可以是釣魚頁
PUBLIC_IMAGE_MIMES = frozenset({"image/webp", "image/png", "image/jpeg", "image/avif"})

PG_INT_MAX = 2_147_483_647
ClubId = Annotated[int, PathParam(ge=1, le=PG_INT_MAX)]
VenueId = Annotated[int | None, Query(ge=1, le=PG_INT_MAX)]

# 通過審核**以後**的都算公開:退回、審核中與草稿一律不回。
# 舊系統的公開月曆沒過濾狀態,把審核中的草稿全放出去了 —— 這是同一個坑
PUBLIC_ACTIVITY_STATUSES = (
    ActivityStatus.APPROVED,
    ActivityStatus.CLOSING_PENDING_ADVISOR,
    ActivityStatus.CLOSED,
)

# 公開社團的唯一判定:停社與行政端下架的一筆都不回(不是灰掉,是不存在)
_VISIBLE = (Club.is_active.is_(True), Club.public_visible.is_(True))


def _sees_pending(user: User | None) -> bool:
    """待審單清單只給審這一關的承辦(`abooking`)。

    社團與匿名不該知道別人送了什麼還沒過 —— 格色已經說了「這個時段有人在等」,
    是誰在等是審核端的事。
    首登未改密的帳號也不給:`OptionalUser` 刻意不擋那道閘(公開資料不受它管),
    但這一欄不是公開資料,得自己擋。
    """
    return admin_with("abooking", user) and not user.must_change_password


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
    return ApiResponse(data={"date": date.isoformat(), "grid": grid})


@router.get("/bookings/availability-range")
async def availability_range(
    user: OptionalUser, db: DbDep, start: date, end: date, venue: VenueId = None
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


# ---- 社團導覽(spec/shared/club-directory.md、club-detail.md)----


@router.get("/clubs")
async def list_clubs(db: DbDep) -> ApiResponse[list[ClubCardOut]]:
    """導覽字卡:**全量回傳**,不分頁。

    在校社團約 60 個,導覽頁本質是主檔;搜尋與篩選由前端在手上這份做完,
    再打一次伺服器只是多一次往返。

    排序:有橫幅圖的在前,其次社團名稱 —— 沒有任何一張圖的頁面不會有人看第二次,
    先讓有備料的社團撐起版面。
    """
    rows = await db.scalars(
        sa.select(Club)
        .where(*_VISIBLE)
        .order_by(Club.banner_file_id.is_(None), Club.name, Club.id)
    )
    return ApiResponse(data=[ClubCardOut.model_validate(c) for c in rows])


async def _public_club(db: DbDep, club_id: int) -> Club:
    """公開的社團;停社、下架或不存在一律 404。

    不是「已停社」頁 —— 對外沒有必要交代某個社團曾經存在。
    """
    club = await db.scalar(sa.select(Club).where(Club.id == club_id, *_VISIBLE))
    if club is None:
        raise not_found("找不到社團")
    return club


@router.get("/clubs/{club_id}")
async def club_detail(club_id: ClubId, db: DbDep) -> ApiResponse[ClubDetailOut]:
    return ApiResponse(data=ClubDetailOut.model_validate(await _public_club(db, club_id)))


@router.get("/clubs/{club_id}/activities")
async def club_activities(
    club_id: ClubId,
    db: DbDep,
    semester: str | None = Query(None, pattern=SEMESTER_LABEL),
) -> ApiResponse[list[PublicActivityOut]]:
    """該社通過審核以後的活動,開始日新到舊;`semester` 不帶即全部。

    學期不是欄位而是由開始日推導(`core/semesters`),所以這裡篩的是日期區間。
    """
    await _public_club(db, club_id)  # 社團不公開時連活動都不該查得到
    query = sa.select(Activity).where(
        Activity.club_id == club_id,
        Activity.status.in_(PUBLIC_ACTIVITY_STATUSES),
        Activity.date.is_not(None),
    )
    if semester is not None:
        start, end = semester_range(semester)
        query = query.where(Activity.date >= start, Activity.date <= end)
    rows = await db.scalars(
        query.order_by(Activity.date.desc(), Activity.id.desc()).limit(MAX_PUBLIC_ACTIVITIES)
    )
    return ApiResponse(data=[PublicActivityOut.model_validate(a) for a in rows])


@router.get("/files/{file_id}")
async def public_file(file_id: uuid.UUID, db: DbDep) -> FileResponse:
    """免登入的檔案通道:**只放行 `files.public`**(目前只有社團形象圖)。

    走自己的路由而不是在 `can_access` 開一個匿名分支:那會變成第五種角色判定混進
    同一個 match,遲早被下一個新增的 case 漏掉。不公開、已歸檔與不存在同樣回 404,
    不讓人靠狀態碼探測某個 id 存不存在。

    **還要引用它的社團現在是公開的**:形象圖是一個社團最對外的一份資料,而下架的理由
    常常就是那張圖。這裡用 EXISTS 當場問,而不是在社團下架時反手把 `files.public` 關掉 ——
    後者是同一份判定的第二份,每一條未來會隱藏社團的路徑都得記得同步一次。

    `Cache-Control` 蓋掉全域的 `no-store`(中介層只補缺漏、不覆寫):否則每張字卡每次
    進站都要重抓一次。**不用 `immutable`、也不放到一週**:內容確實不可變(換圖會產生新的
    id),但**授權會變** —— 下架之後還要讓已發出的副本在別人的快取裡活一週,那是這支端點
    唯一撤不回來的東西。一小時是「省掉重複請求」與「下架多久真的生效」之間的取捨。
    """
    owned_by_visible_club = sa.select(Club.id).where(
        sa.or_(Club.avatar_file_id == file_id, Club.banner_file_id == file_id), *_VISIBLE
    )
    file = await db.scalar(
        sa.select(File).where(
            File.id == file_id,
            File.public.is_(True),
            File.archived_at.is_(None),
            sa.exists(owned_by_visible_club),
        )
    )
    if file is None or file.mime not in PUBLIC_IMAGE_MIMES:
        raise not_found("找不到檔案")
    disk = Path(settings.upload_dir) / file.path
    # 一次 stat 交給 Starlette,不做 check-then-open:兩者之間檔案消失的話
    # `FileResponse` 會丟 RuntimeError 變成 500,而「社團在換圖、同時有人在看導覽頁」
    # 正是這支端點最常見的併發組合(`_replace_image` 的 unlink 排在 commit 之後)
    try:
        stat_result = disk.stat()
    except OSError:
        raise not_found("找不到檔案") from None
    response = FileResponse(
        disk,
        stat_result=stat_result,
        media_type=file.mime,
        content_disposition_type="inline",
    )
    response.headers["Cache-Control"] = "public, max-age=3600"
    return response
