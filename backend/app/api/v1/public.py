"""免登入的借用情形與社團導覽資料(`/public/*`)。

首頁的公開預覽、社團端「借用總覽」與行政端「臨時場地器材借用」看的是同一張色格圖,
資料來源也只該有一份 —— 一張圖分三支端點,遲早三邊講出不同的事。

登入中的社團帳號仍拿得到 `mine` 標記(`OptionalUser`);匿名看得到佔用狀態、借用單位與
不開放原因,拿不到的只有待審單清單。
"""

import logging
import uuid
from collections import defaultdict
from datetime import date
from pathlib import Path
from typing import Annotated

import anyio
import sqlalchemy as sa
from fastapi import APIRouter, Query, Response
from fastapi import Path as PathParam

from app.core.config import settings
from app.core.deps import DbDep, OptionalUser, admin_with
from app.core.errors import not_found, validation_error
from app.core.semesters import SEMESTER_LABEL, semester_range
from app.models import Activity, Club, Equipment, File, User, Venue
from app.models.clubs import VISIBLE_CLUB, owns_public_image
from app.models.enums import ActivityStatus
from app.schemas.auth import PeriodOut
from app.schemas.bookings import EquipmentUsageOut, VenueOut
from app.schemas.common import ApiResponse
from app.schemas.public import ClubCardOut, ClubDetailOut, PublicActivityOut
from app.services import activity_service
from app.services import booking_service as svc
from app.services import files as file_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/public", tags=["public"])

MAX_AVAILABILITY_SPAN_DAYS = 31  # 單一場地 15 天檢視用;上限防範圍濫用
# 公開頁只列最近 10 次:導覽頁要回答的是「這個社團在辦什麼」,不是完整流水帳
MAX_PUBLIC_ACTIVITIES = 10

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
_VISIBLE = VISIBLE_CLUB


def _public_photos(*columns) -> sa.Select:
    """公開得出去的結案照片(D-42):**結案通過**的活動、公開中的社團、未歸檔。

    活動清單(列出 id)與照片通道(送檔)共用這一份 —— 各寫一份的話,
    清單列得出來、點下去 404,或者清單不列、拿 id 卻打得到。
    只收 `closed`:結案準備中(`approved`)的照片是社團還在刪換的草稿,
    送審中的還沒有承辦看過。超過預覽來源上限的不列:通道只送轉過的 JPEG,送不出來的不該出現在清單上。
    """
    return (
        sa.select(*columns)
        .select_from(File)
        .join(Activity, Activity.id == File.subject_id)
        .join(Club, Club.id == Activity.club_id)
        .where(
            File.subject_type == activity_service.PHOTO_SUBJECT,
            File.slot == activity_service.PHOTO_SLOT,
            File.archived_at.is_(None),
            File.size <= file_service.PREVIEW_MAX_SOURCE_BYTES,
            Activity.status == ActivityStatus.CLOSED,
            *_VISIBLE,
        )
    )


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
async def list_clubs(db: DbDep, response: Response) -> ApiResponse[list[ClubCardOut]]:
    """導覽字卡:**全量回傳**,不分頁。

    在校社團約 60 個,導覽頁本質是主檔;搜尋與篩選由前端在手上這份做完,
    再打一次伺服器只是多一次往返。

    順序由前端決定(性質 → 名稱,見 spec/shared/club-directory.md):DB 的 collation
    是 `en_US.utf8`,對中文等於碼位序,排不出有意義的順序。這裡只給一個穩定的次序,
    讓分頁/快取之間不會跳動。
    """
    rows = await db.scalars(
        sa.select(Club)
        .where(*_VISIBLE)
        .order_by(Club.name, Club.id)
    )
    # 一份幾乎不變的主檔,沒有理由每次進站、每次上一頁都重查(全域預設是 no-store)
    response.headers["Cache-Control"] = "public, max-age=300"
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
    """該社通過審核以後的活動,開始日新到舊,一律只回最近十筆。

    學期不是欄位而是由開始日推導(`core/semesters`),所以這裡篩的是日期區間。
    彈窗要的活動內容與照片 id 一併帶上(十筆、內容上限 150 字,不值得另開一支詳情端點)。
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
    rows = list(
        await db.scalars(
            query.order_by(Activity.date.desc(), Activity.id.desc()).limit(MAX_PUBLIC_ACTIVITIES)
        )
    )
    photos: defaultdict[int, list[uuid.UUID]] = defaultdict(list)
    if rows:
        for activity_id, file_id in await db.execute(
            _public_photos(File.subject_id, File.id)
            .where(File.subject_id.in_([a.id for a in rows]))
            .order_by(File.created_at, File.id)
        ):
            photos[activity_id].append(file_id)
    data = []
    for a in rows:
        out = PublicActivityOut.model_validate(a)
        out.photo_file_ids = photos[a.id]
        data.append(out)
    return ApiResponse(data=data)


@router.get("/files/{file_id}")
async def public_file(file_id: uuid.UUID, db: DbDep) -> Response:
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
    owned_by_visible_club = sa.select(Club.id).where(owns_public_image(file_id), *_VISIBLE)
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
    # **當場讀進來**,不交給 `FileResponse` 事後開檔:傳了 `stat_result` 只是讓 Starlette
    # 跳過存在檢查,它仍然在回應階段才 open —— 那之間檔案被刪掉就是 RuntimeError 變 500。
    # 而「社團在換圖、同時有人在看導覽頁」正是這支端點最常見的併發組合
    # (`_replace_image` 的 unlink 排在 commit 之後)。讀失敗就是 404,沒有中間狀態。
    # 成品是 `CLUB_IMAGE_SIZES` 那一級的 WebP(數百 KB),而且這支端點快取一小時,
    # 放棄 sendfile 換掉一個偶發 500 划得來;走 thread 不擋 event loop
    try:
        content = await anyio.to_thread.run_sync(disk.read_bytes)
    except OSError:
        raise not_found("找不到檔案") from None
    response = Response(
        content=content,
        media_type=file.mime,
        headers={"content-disposition": "inline"},
    )
    # private:瀏覽器照樣快取,但 CDN 與公司 proxy 不會替**別人**留一份。
    # 社團下架的理由常常正是那張圖,撤不回來的範圍能小一點是一點
    response.headers["Cache-Control"] = "private, max-age=3600"
    return response


@router.get("/files/activity-photos/{file_id}")
async def public_activity_photo(file_id: uuid.UUID, db: DbDep) -> Response:
    """社團詳細頁活動彈窗裡的結案照片(D-42),範圍見 `_public_photos`。

    **一律送轉過的 JPEG,不送原檔**(`file_service.preview_of`:長邊 1600、套 EXIF 方向,
    與站內 `<img>` 看 HEIC 的預覽共用同一份快取):手機原圖動輒數 MB,而且 EXIF 帶拍攝座標 ——
    開發庫抽樣 300 張有 20 張有 GPS,重新編碼出來的 JPEG 不帶任何 metadata。
    轉不出來(解不開、超過像素上限、磁碟到告警水位不再建新快取)一律 404,不退回原檔。

    掛在 `/public/files/` 底下是為了吃 nginx 給圖片的限流桶(`public_files`):一個彈窗
    五張照片,與其餘公開端點共用 60r/m 的桶,連翻幾場活動就 429。
    快取與形象圖同一個取捨(`private`、一小時):社團下架或活動被刪之後撤得回來。
    """
    file = await db.scalar(_public_photos(File).where(File.id == file_id))
    if file is None:
        raise not_found("找不到檔案")
    try:
        preview = await file_service.preview_of(Path(settings.upload_dir) / file.path)
    except Exception:
        # 壞檔、超過像素上限或盤上根本沒有這個檔:log 才查得到是哪一張;對外一律 404
        logger.exception("public photo preview failed: file=%s", file.id)
        preview = None
    if preview is None:
        raise not_found("找不到檔案")
    # 當場讀進來(同形象圖):數百 KB 的成品,換掉「檢查與開檔之間被刪」的 500
    try:
        content = await anyio.to_thread.run_sync(preview.read_bytes)
    except OSError:
        raise not_found("找不到檔案") from None
    response = Response(
        content=content, media_type="image/jpeg", headers={"content-disposition": "inline"}
    )
    response.headers["Cache-Control"] = "private, max-age=3600"
    return response
