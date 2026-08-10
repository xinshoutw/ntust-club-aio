"""檔案上傳/下載服務(docs/architecture.md §3.5、data-model.md §3.4)。

- 後端重驗:副檔名 × 魔術位元組必須一致,client 宣稱的 MIME 一律不信
- 串流寫盤(1MB chunk,不整檔進記憶體),邊寫邊算 sha256、邊檢查大小上限
- 佈局 {module}/{YYYY}/{MM}/{uuid}(月份歸檔);uuid 下載路徑不可列舉
- 評鑑照片以 sha256 於同社團內拒絕重複(跨活動、檔名不同亦擋)
- 下載一律經權限檢查;已歸檔(archived_at)回 410
"""

import hashlib
import logging
import shutil
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

import sqlalchemy as sa
from fastapi import UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.errors import AppError, not_found, rate_limited
from app.core.rate_limit import upload_limiter
from app.models import (
    AwardRubricItem,
    EvalGroup,
    EvalGroupClub,
    EvalGroupReviewer,
    EvalUpload,
    File,
    User,
)
from app.models.enums import UserRole
from app.services.settings_service import get_setting

_CHUNK = 1024 * 1024
_MB = 1024 * 1024
_GIB = 1024**3

# 上傳配額檢查的 pg_advisory_xact_lock key(全系統唯一一把;隨呼叫端交易釋放)
_STORAGE_LOCK_KEY = 0x_C1AB_A10_5EC3

_CLUB_FULL = "社團儲存空間額度不足,請先清理檔案或聯絡學務處"
_SYSTEM_FULL = "系統儲存空間不足,請聯絡學務處"

logger = logging.getLogger(__name__)


def unlink_quiet(path: Path) -> None:
    """清理性刪檔:失敗只記 log,不讓清理錯誤蓋掉主要錯誤或已成立的回應。

    上傳超額回滾(413)、去重衝突(409)、commit 後的磁碟清理都走這裡;
    刪不掉頂多留孤兒檔(可清掃),換成 500 反而誤導呼叫端。
    """
    try:
        path.unlink(missing_ok=True)
    except OSError:
        logger.warning("cleanup unlink failed, orphan left on disk: %s", path, exc_info=True)


def _insufficient(message: str) -> AppError:
    return AppError(507, "INSUFFICIENT_STORAGE", message)


async def storage_usage(db: AsyncSession, club_id: int | None = None) -> int:
    """未歸檔檔案佔用(bytes);club_id=None 為全系統(歸檔檔案已離盤不計)。"""
    query = sa.select(sa.func.coalesce(sa.func.sum(File.size), 0)).where(
        File.archived_at.is_(None)
    )
    if club_id is not None:
        query = query.where(File.club_id == club_id)
    return int(await db.scalar(query))


async def database_size(db: AsyncSession) -> int:
    """「文字內容」= 整個 DB 的估算大小;邏輯容量與檔案管理頁一致地包含它。"""
    return int(await db.scalar(sa.select(sa.func.pg_database_size(sa.func.current_database()))))


def _sniff_jpg(head: bytes) -> bool:
    return head.startswith(b"\xff\xd8\xff")


def _sniff_png(head: bytes) -> bool:
    return head.startswith(b"\x89PNG\r\n\x1a\n")


def _sniff_gif(head: bytes) -> bool:
    return head.startswith(b"GIF8")


def _sniff_webp(head: bytes) -> bool:
    return len(head) >= 12 and head.startswith(b"RIFF") and head[8:12] == b"WEBP"


def _sniff_bmp(head: bytes) -> bool:
    return head.startswith(b"BM")


def _sniff_tiff(head: bytes) -> bool:
    return head.startswith(b"II*\x00") or head.startswith(b"MM\x00*")


# ISO BMFF 品牌(HEIC/HEIF/AVIF;對齊前端 ActivityClosePage.isImageFile)
_HEIF_BRANDS = frozenset({b"heic", b"heix", b"heif", b"hevc", b"mif1", b"msf1"})
_AVIF_BRANDS = frozenset({b"avif", b"avis"})


def _sniff_heif(head: bytes) -> bool:
    return len(head) >= 12 and head[4:8] == b"ftyp" and head[8:12] in _HEIF_BRANDS


def _sniff_avif(head: bytes) -> bool:
    return len(head) >= 12 and head[4:8] == b"ftyp" and head[8:12] in _AVIF_BRANDS


def _sniff_pdf(head: bytes) -> bool:
    return head.startswith(b"%PDF")


def _sniff_zip(head: bytes) -> bool:  # zip 容器(zip/docx/xlsx)
    return head.startswith(b"PK\x03\x04")


def _sniff_ole(head: bytes) -> bool:  # 舊版 Office(doc/xls)
    return head.startswith(b"\xd0\xcf\x11\xe0")


def _sniff_mp4(head: bytes) -> bool:  # mp4/mov:offset 4 起為 ftyp
    return len(head) >= 12 and head[4:8] == b"ftyp"


# 副檔名 → (魔術位元組驗證, 正規 MIME)
_SIGNATURES = {
    ".jpg": (_sniff_jpg, "image/jpeg"),
    ".jpeg": (_sniff_jpg, "image/jpeg"),
    ".png": (_sniff_png, "image/png"),
    ".gif": (_sniff_gif, "image/gif"),
    ".webp": (_sniff_webp, "image/webp"),
    ".bmp": (_sniff_bmp, "image/bmp"),
    ".tif": (_sniff_tiff, "image/tiff"),
    ".tiff": (_sniff_tiff, "image/tiff"),
    ".heic": (_sniff_heif, "image/heic"),
    ".heif": (_sniff_heif, "image/heif"),
    ".avif": (_sniff_avif, "image/avif"),
    ".pdf": (_sniff_pdf, "application/pdf"),
    ".docx": (
        _sniff_zip,
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ),
    ".doc": (_sniff_ole, "application/msword"),
    ".zip": (_sniff_zip, "application/zip"),
    ".mp4": (_sniff_mp4, "video/mp4"),
    ".mov": (_sniff_mp4, "video/quicktime"),
}


@dataclass(frozen=True)
class UploadPolicy:
    name: str
    extensions: frozenset[str]
    max_size: int
    settings_key: str | None = None  # system_settings upload_limits 的鍵;None=固定上限


# 上傳上限(architecture.md §3.5 定案的預設;實際上限走 system_settings upload_limits)
# 影像放寬為所有常見格式(2026-07-16 第八輪,對齊前端 isImageFile)
IMAGE = UploadPolicy(
    "image",
    frozenset(
        {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".tif", ".tiff",
         ".heic", ".heif", ".avif"}
    ),
    10 * _MB,
    settings_key="img",
)
DOCUMENT = UploadPolicy(
    "document", frozenset({".pdf", ".doc", ".docx"}), 50 * _MB, settings_key="doc"
)
# 郵局存簿/申請書:掃描件常為 PDF,也收影像(2026-07-17 需求方拍板 PDF+Image);
# 上限對齊前端 PostalPage 的 50MB,固定值(不入 upload_limits)
PASSBOOK = UploadPolicy("passbook", IMAGE.extensions | frozenset({".pdf"}), 50 * _MB)
ARCHIVE = UploadPolicy("archive", frozenset({".zip"}), 100 * _MB, settings_key="zip")
VIDEO = UploadPolicy("video", frozenset({".mp4", ".mov"}), 200 * _MB, settings_key="video")


async def _policy_max_size(db: AsyncSession, policy: UploadPolicy) -> int:
    """實際上限:管理員後台可調(upload_limits);查無值回退政策常數。"""
    if policy.settings_key is None:
        return policy.max_size
    limits = await get_setting(db, "upload_limits")
    mb = limits.get(policy.settings_key) if isinstance(limits, dict) else None
    return int(mb) * _MB if mb else policy.max_size


def _extension(filename: str) -> str:
    return Path(filename or "").suffix.lower()


async def save_upload(
    db: AsyncSession,
    upload: UploadFile,
    *,
    policy: UploadPolicy,
    module: str,
    uploaded_by: int,
    club_id: int | None = None,
    subject_type: str | None = None,
    subject_id: int | None = None,
    slot: str | None = None,
    dedup: str | None = None,  # None=不去重、"slot"=同 slot 跨單據(照片)、"subject"=同單據(評鑑)
) -> File:
    """串流驗證並落盤;回傳已 add(未 commit)的 File 列,隨呼叫端交易一起提交。"""
    ext = _extension(upload.filename or "")
    if ext not in policy.extensions:
        raise AppError(
            415,
            "UNSUPPORTED_FILE_TYPE",
            f"僅接受 {'/'.join(sorted(e.lstrip('.') for e in policy.extensions))} 檔案",
        )
    sniff, mime = _SIGNATURES[ext]
    max_size = await _policy_max_size(db, policy)

    # 配額檢查(系統總量改用實際磁碟可用空間,不再設邏輯容量與保留空間;
    # 容量不足告警之後人為介入)。此處先做「無鎖」預檢;per-club 權威結算在串流完成後取
    # advisory lock 再重算(避免慢速上傳在串流期間霸佔全域鎖)
    limits = await get_setting(db, "storage_limits")
    club_remaining = None
    if club_id is not None:
        club_remaining = int(limits["per_club_gib"]) * _GIB - await storage_usage(db, club_id)

    disk_root = upload_root()
    # 預檢:無宣告大小時以政策上限保守估計,不等 .part 寫完才發現超額
    declared = upload.size if upload.size else max_size
    if club_remaining is not None and declared > club_remaining:
        raise _insufficient(_CLUB_FULL)
    if declared > shutil.disk_usage(disk_root).free:
        raise _insufficient(_SYSTEM_FULL)

    file_id = uuid.uuid4()
    now = datetime.now(UTC)
    rel_path = f"{module}/{now:%Y}/{now:%m}/{file_id}"
    dest = Path(settings.upload_dir) / rel_path
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(".part")

    hasher = hashlib.sha256()
    size = 0
    first = True
    try:
        with tmp.open("wb") as out:
            while chunk := await upload.read(_CHUNK):
                if first:
                    if not sniff(chunk):
                        raise AppError(415, "UNSUPPORTED_FILE_TYPE", "檔案內容與副檔名不符")
                    first = False
                size += len(chunk)
                if size > max_size:
                    raise AppError(413, "FILE_TOO_LARGE", f"檔案超過 {max_size // _MB}MB 上限")
                # 實際累積大小仍逐塊檢查:宣告 size 是 client 可控值,不可盡信
                if club_remaining is not None and size > club_remaining:
                    raise _insufficient(_CLUB_FULL)
                # 磁碟寫爆由 OS ENOSPC 於 out.write 拋出,交由外層 except 清 tmp
                hasher.update(chunk)
                out.write(chunk)
        if first:  # 空檔案
            raise AppError(415, "UNSUPPORTED_FILE_TYPE", "檔案內容與副檔名不符")

        # per-club 權威配額結算:lock 只覆蓋「重算剩餘量 → flush → 呼叫端 commit」,
        # 不含串流期間(慢速上傳不得霸佔全域鎖);兩個並發上傳在此序列化,
        # 不得同時看見相同剩餘量。系統總量以實際磁碟空間為準,無邏輯上限需在此重算
        # ponytail: 結算仍是全域一把鎖;單校流量足夠,吞吐不足再改 reservation table
        await db.execute(
            sa.text("SELECT pg_advisory_xact_lock(:key)"), {"key": _STORAGE_LOCK_KEY}
        )
        if club_id is not None:
            club_remaining = int(limits["per_club_gib"]) * _GIB - await storage_usage(db, club_id)
            if size > club_remaining:
                raise _insufficient(_CLUB_FULL)

        sha256 = hasher.hexdigest()
        if dedup is not None:
            # slot=同 slot 跨單據(結案照片跨活動);subject=同一單據內(評鑑逐 rubric item)
            scope = (
                File.slot == slot
                if dedup == "slot"
                else sa.and_(File.subject_type == subject_type, File.subject_id == subject_id)
            )
            dup = await db.scalar(
                sa.select(File.id).where(
                    File.club_id == club_id,
                    scope,
                    File.sha256 == sha256,
                    File.archived_at.is_(None),
                )
            )
            if dup is not None:
                raise AppError(409, "DUPLICATE_FILE", "相同內容的檔案已上傳過(照片不得重複)")

        tmp.rename(dest)
        row = File(
            id=file_id,
            club_id=club_id,
            uploaded_by=uploaded_by,
            subject_type=subject_type,
            subject_id=subject_id,
            slot=slot,
            original_name=Path(upload.filename or f"upload{ext}").name,
            size=size,
            mime=mime,
            sha256=sha256,
            path=rel_path,
        )
        db.add(row)
        # 先 flush:讓後續同交易引用 file_id 的列(如 eval_uploads)有正確的插入順序;
        # 併發去重撞唯一索引也在此浮現(全域 handler 回 409)
        await db.flush()
    except BaseException:
        unlink_quiet(tmp)
        # flush 失敗時 dest 已 rename:一併刪除,不留 DB 看不見、無法清理的孤兒檔
        unlink_quiet(dest)
        raise
    return row


def upload_root() -> Path:
    """上傳根目錄(容量統計與配額檢查共用)。"""
    root = Path(settings.upload_dir)
    root.mkdir(parents=True, exist_ok=True)
    return root


async def total_uploaded(
    db: AsyncSession, *, subject_type: str, subject_id: int, slot: str
) -> int:
    """某單據某 slot 的未歸檔檔案加總大小(bytes);供各申請性質的加總上限檢核。"""
    return int(
        await db.scalar(
            sa.select(sa.func.coalesce(sa.func.sum(File.size), 0)).where(
                File.subject_type == subject_type,
                File.subject_id == subject_id,
                File.slot == slot,
                File.archived_at.is_(None),
            )
        )
        or 0
    )


async def can_access(db: AsyncSession, file: File, user: User) -> bool:
    """權限邊界:admin 全通;staff 僅職務相關;club 只能取自己社團;
    viewer 僅「被指派分組內社團」的評鑑上傳檔(2026-07-21 收緊)。"""
    match user.role:
        case UserRole.ADMIN:
            return True
        case UserRole.STAFF:
            # 最小權限(2026-07-16 資安審查):工讀生職務=報修/違規/器材點交,
            # 郵局存簿、活動附件、評鑑上傳等敏感檔不開放
            return file.subject_type in {"maintenance", "violation"}
        case UserRole.CLUB:
            return file.club_id is not None and file.club_id == user.club_id
        case UserRole.VIEWER:
            if not user.can_view_eval or file.subject_type != "eval_upload":
                return False
            # 該檔對應的 eval_upload 須位於「我被指派」的同年度分組內,
            # 且上傳所屬細項的獎項=該分組的獎項(與 viewer API 的指派檢查同維度:
            # 分組×獎項×年度;只評財務獎的委員不得下載同社其他獎項的佐證檔)
            assigned = await db.scalar(
                sa.select(EvalGroup.id)
                .join(EvalGroupClub, EvalGroupClub.group_id == EvalGroup.id)
                .join(
                    EvalGroupReviewer,
                    sa.and_(
                        EvalGroupReviewer.group_id == EvalGroup.id,
                        EvalGroupReviewer.user_id == user.id,
                    ),
                )
                .join(
                    EvalUpload,
                    sa.and_(
                        EvalUpload.club_id == EvalGroupClub.club_id,
                        EvalUpload.year == EvalGroup.year,
                    ),
                )
                .join(
                    AwardRubricItem,
                    sa.and_(
                        AwardRubricItem.id == EvalUpload.rubric_item_id,
                        AwardRubricItem.award_id == EvalGroup.award_id,
                    ),
                )
                .where(EvalUpload.file_id == file.id)
                .limit(1)
            )
            return assigned is not None
    return False


# 瀏覽器可原生預覽的類型;其餘(bmp/tiff/heic 等支援度不一)一律下載
_INLINE_MIMES = {"image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf"}


async def file_response(db: AsyncSession, file_id: uuid.UUID, user: User) -> FileResponse:
    file = await db.get(File, file_id)
    if file is None or not await can_access(db, file, user):
        raise not_found("找不到檔案")  # 無權限與不存在同訊息,避免探測
    if file.archived_at is not None:
        raise AppError(410, "FILE_ARCHIVED", "檔案已由行政歸檔,請洽學務處")
    disk = Path(settings.upload_dir) / file.path
    if not disk.is_file():
        raise not_found("找不到檔案")
    disposition = "inline" if file.mime in _INLINE_MIMES else "attachment"
    response = FileResponse(
        disk,
        media_type=file.mime,
        filename=file.original_name,
        content_disposition_type=disposition,
    )
    if disposition == "inline" and file.mime == "application/pdf":
        # 前端 FilePreview 以 iframe 內嵌 PDF:僅授權成功的 inline PDF 放寬為同源,
        # 其餘 API 回應維持全域 DENY/none(middleware 只補缺漏、不覆寫)
        response.headers["X-Frame-Options"] = "SAMEORIGIN"
        response.headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'self'"
    return response


async def delete_file(db: AsyncSession, file: File) -> Path:
    """刪 DB 列並回傳磁碟路徑;**呼叫端 commit 成功後才 unlink**。

    先刪檔再 commit 的話,rollback 會留下「DB 有列、磁碟無檔」的壞狀態;
    反向(commit 後 unlink 失敗)只留孤兒檔,無害且可清掃。
    """
    disk = Path(settings.upload_dir) / file.path
    await db.delete(file)
    return disk


def enforce_upload_rate(user_id: int) -> None:
    """上傳限流(30 次/分/使用者):防重複上傳大檔耗盡磁碟(2026-07-16 資安審查)。"""
    if not upload_limiter.allow(f"user:{user_id}"):
        raise rate_limited("上傳過於頻繁,請稍後再試")
