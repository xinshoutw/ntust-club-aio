"""檔案上傳/下載服務(docs/architecture.md §3.5、data-model.md §3.4)。

- 後端重驗:副檔名 × 魔術位元組必須一致,client 宣稱的 MIME 一律不信
- 串流寫盤(1MB chunk,不整檔進記憶體),邊寫邊算 sha256、邊檢查大小上限
- 佈局 {module}/{YYYY}/{MM}/{uuid}(月份歸檔);uuid 下載路徑不可列舉
- 評鑑照片以 sha256 於同社團內拒絕重複(跨活動、檔名不同亦擋)
- 下載一律經權限檢查;已歸檔(archived_at)回 410
"""

import hashlib
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

import sqlalchemy as sa
from fastapi import UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.errors import AppError, not_found
from app.models import File, User
from app.models.enums import UserRole
from app.services.settings_service import get_setting

_CHUNK = 1024 * 1024
_MB = 1024 * 1024


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
    reject_duplicate_in_club_slot: bool = False,
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
                hasher.update(chunk)
                out.write(chunk)
        if first:  # 空檔案
            raise AppError(415, "UNSUPPORTED_FILE_TYPE", "檔案內容與副檔名不符")

        sha256 = hasher.hexdigest()
        if reject_duplicate_in_club_slot:
            dup = await db.scalar(
                sa.select(File.id).where(
                    File.club_id == club_id,
                    File.slot == slot,
                    File.sha256 == sha256,
                    File.archived_at.is_(None),
                )
            )
            if dup is not None:
                raise AppError(409, "DUPLICATE_FILE", "相同內容的檔案已上傳過(照片不得重複)")

        tmp.rename(dest)
    except BaseException:
        tmp.unlink(missing_ok=True)
        raise

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
    # 先 flush:讓後續同交易引用 file_id 的列(如 eval_uploads)有正確的插入順序
    await db.flush()
    return row


def can_access(file: File, user: User) -> bool:
    """權限邊界:admin/staff 全通;club 只能取自己社團;viewer 取評鑑上傳(需開權)。"""
    match user.role:
        case UserRole.ADMIN | UserRole.STAFF:
            return True
        case UserRole.CLUB:
            return file.club_id is not None and file.club_id == user.club_id
        case UserRole.VIEWER:
            return user.can_view_eval and file.subject_type == "eval_upload"
    return False


# 瀏覽器可原生預覽的類型;其餘(bmp/tiff/heic 等支援度不一)一律下載
_INLINE_MIMES = {"image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf"}


async def file_response(db: AsyncSession, file_id: uuid.UUID, user: User) -> FileResponse:
    file = await db.get(File, file_id)
    if file is None or not can_access(file, user):
        raise not_found("找不到檔案")  # 無權限與不存在同訊息,避免探測
    if file.archived_at is not None:
        raise AppError(410, "FILE_ARCHIVED", "檔案已由行政歸檔,請洽學務處")
    disk = Path(settings.upload_dir) / file.path
    if not disk.is_file():
        raise not_found("找不到檔案")
    disposition = "inline" if file.mime in _INLINE_MIMES else "attachment"
    return FileResponse(
        disk,
        media_type=file.mime,
        filename=file.original_name,
        content_disposition_type=disposition,
    )


async def delete_file(db: AsyncSession, file: File) -> Path:
    """刪 DB 列並回傳磁碟路徑;**呼叫端 commit 成功後才 unlink**。

    先刪檔再 commit 的話,rollback 會留下「DB 有列、磁碟無檔」的壞狀態;
    反向(commit 後 unlink 失敗)只留孤兒檔,無害且可清掃。
    """
    disk = Path(settings.upload_dir) / file.path
    await db.delete(file)
    return disk
