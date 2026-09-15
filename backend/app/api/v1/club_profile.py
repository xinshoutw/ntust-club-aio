"""社團端:管理項目(簡介/網頁/指導老師/Discord webhook/對外公開資料/形象圖)。"""

from pathlib import Path

import sqlalchemy as sa
from fastapi import APIRouter, Request, UploadFile

from app.core.config import settings
from app.core.deps import ClubUser, DbDep, client_ip
from app.core.errors import not_found, validation_error
from app.models import Club, File
from app.schemas.clubs import ClubProfileOut, ClubProfileUpdate
from app.schemas.common import ApiResponse
from app.services import audit
from app.services import files as file_service

router = APIRouter(prefix="/club/profile", tags=["club"])

# 形象圖欄位:slot → clubs 上存 file id 的那一欄
_IMAGE_FIELDS = {"avatar": "avatar_file_id", "banner": "banner_file_id"}


async def _own_club(db: DbDep, user, *, lock: bool = False) -> Club:
    """`lock=True` 供換圖用:同一個 slot 的並發上傳/移除在此序列化。

    不鎖的話兩個請求會讀到同一個舊 file id,各自去刪同一列,後到的那個在 flush 時
    配到 0 列 → SQLAlchemy `StaleDataError`,而它不是 `IntegrityError`,
    全域 handler 接不住 → 500。`clubs` 是這條交易第一個取用的表,鎖序不變。
    """
    if lock:
        club = await db.scalar(sa.select(Club).where(Club.id == user.club_id).with_for_update())
    else:
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


async def _replace_image(
    db: DbDep, user, request: Request, *, slot: str, upload: UploadFile | None
) -> ClubProfileOut:
    """換圖與移除走同一條路:兩者都是「舊檔下架 + 欄位改寫」,只差有沒有新檔。

    舊檔一律刪掉不留版本 —— 形象圖沒有歷史價值,留著只是無人管理的磁碟佔用。
    磁碟 unlink 排在 commit 之後:反過來的話 rollback 會留下「DB 有列、磁碟無檔」。
    """
    club = await _own_club(db, user, lock=True)
    field = _IMAGE_FIELDS[slot]
    old_id = getattr(club, field)

    new_row = None
    if upload is not None:
        file_service.enforce_upload_rate(user.id)
        new_row = await file_service.save_club_image(db, upload, slot=slot, uploaded_by=user.id)

    setattr(club, field, new_row.id if new_row else None)

    stale: Path | None = None
    if old_id is not None:
        # 先解掉 clubs 的參照再刪列(FK 是 SET NULL,但同交易內順序要自己顧)
        await db.flush()
        # Core 刪除而不是 ORM 的 `db.delete`:配到 0 列即無事,不會丟 StaleDataError。
        # 上面的列鎖已經擋掉並發,這裡是第二道 —— 刪一個已經不在的檔案本來就不是錯誤
        old_path = await db.scalar(sa.select(File.path).where(File.id == old_id))
        if old_path is not None:
            await db.execute(sa.delete(File).where(File.id == old_id))
            stale = Path(settings.upload_dir) / old_path

    # 沒圖也沒傳新圖 = 什麼都沒發生,不留無事件的稽核噪音
    if new_row is not None or old_id is not None:
        audit.record(
            db,
            action=f"club_{slot}_{'updated' if new_row else 'removed'}",
            user=user,
            # 查「這社的橫幅換過幾次、被換掉的是哪一個檔」要看得到 id,
            # 比照同檔的 club_profile_updated 與 admin_files 的刪除紀錄
            detail=(
                f"club={club.id};slot={slot}"
                f";file={new_row.id if new_row else '-'};old={old_id or '-'}"
            ),
            ip=client_ip(request),
        )
    await db.commit()
    if stale is not None:
        file_service.unlink_quiet(stale)
    await db.refresh(club)
    return ClubProfileOut.model_validate(club)


# 路由寫死 avatar / banner 而不是收一個 `{slot}` 參數:nginx 的上傳白名單是正規式比對,
# 路徑上有自由參數就沒辦法保證它配得上(tests/test_upload_gateway.py 擋的正是這件事),
# 而且路由本身就把不存在的欄位擋成 404,省掉一次執行期檢查。
#
# 上傳多一段 `/upload`,移除才是 `/{slot}` 本身:**nginx 的 location 是路徑比對、
# 不分方法**,兩者共用同一個網址的話,移除也會跑 `auth_request /_upload_precheck`,
# 於是磁碟到告警水位時社團連把橫幅移掉都會被擋 —— 那正是此刻該鼓勵的動作。
# (子請求一律是 GET,`$request_method` 在那裡拿不到原方法,擋不掉只能靠分開路徑)


async def _upload(slot: str, file: UploadFile, user, db, request) -> ApiResponse[ClubProfileOut]:
    if not file.filename:
        raise validation_error("請選擇圖片檔案")
    return ApiResponse(data=await _replace_image(db, user, request, slot=slot, upload=file))


@router.post("/avatar/upload", status_code=201)
async def upload_avatar(
    file: UploadFile, user: ClubUser, db: DbDep, request: Request
) -> ApiResponse[ClubProfileOut]:
    return await _upload("avatar", file, user, db, request)


@router.post("/banner/upload", status_code=201)
async def upload_banner(
    file: UploadFile, user: ClubUser, db: DbDep, request: Request
) -> ApiResponse[ClubProfileOut]:
    return await _upload("banner", file, user, db, request)


@router.delete("/avatar")
async def remove_avatar(
    user: ClubUser, db: DbDep, request: Request
) -> ApiResponse[ClubProfileOut]:
    return ApiResponse(data=await _replace_image(db, user, request, slot="avatar", upload=None))


@router.delete("/banner")
async def remove_banner(
    user: ClubUser, db: DbDep, request: Request
) -> ApiResponse[ClubProfileOut]:
    return ApiResponse(data=await _replace_image(db, user, request, slot="banner", upload=None))
