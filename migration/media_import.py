"""舊系統活動照片(Club_activityimages)→ club-aio files 表 + UPLOAD_DIR(idempotent)。

用法(於 backend/ 下,cms_import.py 跑完之後):
    uv run python ../migration/media_import.py
    uv run python ../migration/media_import.py --reset   # 清掉上次匯入(含盤上檔案)

**一定要在 `backend/` 下執行**:`UPLOAD_DIR` 預設是相對路徑 `./data/uploads`,
在別的目錄跑會寫到(或清到)不存在的地方。腳本會先確認這件事。

來源目錄預設 `<workspace>/legacy/club_media`(舊機 `~/ClubManagementSystem/club_media`
整包抓下來的副本),可用環境變數 `CLUB_MEDIA` 覆寫。

只遷 `Club_activityimages`(結案照片)。`Club_activityfiles` 的 90 個影像副檔名檔案
不遷 —— 那一桶混了簽到表、宣傳圖與活動照,靠檔名分不出來,誤標成結案照片會直接
影響評鑑 ad2;`PlanFile`(企劃書)與其餘文件走 `text_fields.py` 的人工轉錄。

**清除順序**:`--reset` 必須跑在 `cms_import.py --reset` **之前**。cms 那支的 reset
會無條件刪光 `legacy_id_map` 裡 system=cms 的所有列(含本腳本的照片對照),
先跑它就再也找不到這 4,000 個檔 —— DB 列與盤上 4.9 GB 一起變成沒人管得到的孤兒。
`cms_import.reset()` 已加防呆擋下這個順序,但別依賴它。
"""

# ruff: noqa: E402 - sys.path 調整必須先於 app 匯入(同 cms_import.py)
import asyncio
import csv
import hashlib
import os
import shutil
import sys
import uuid
from collections import defaultdict
from datetime import date
from pathlib import Path

MIGRATION_DIR = Path(__file__).resolve().parent
BACKEND_DIR = MIGRATION_DIR.parent / "backend"
sys.path.insert(0, str(BACKEND_DIR))
sys.path.insert(0, str(MIGRATION_DIR))

import sqlalchemy as sa
from cms_import import IdMap, _scope_bounds, local_dt
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from app.core.config import settings
from app.core.db import async_session_factory
from app.models import Activity, File, LegacyIdMap
from app.models.enums import LegacySystem
from app.services.activity_service import PHOTO_SLOT, PHOTO_SUBJECT
from app.services.files import IMAGE, detect_mime

WORKSPACE = MIGRATION_DIR.parent.parent.parent
MEDIA_DIR = Path(os.environ.get("CLUB_MEDIA") or WORKSPACE / "legacy" / "club_media")
MODULE = "reports"  # files.path 的第一段,與 api/v1/activities.upload_photo 一致
BATCH = 200  # 每批 commit;中途失敗由 _pending 把該批已落盤的檔清掉
_HEAD = 32  # 判魔術位元組要讀的位元組數

LEGACY_TABLE = "Club_activityimages"


def digest_and_head(path: Path) -> tuple[str, bytes]:
    """一次開檔拿到 sha256 與開頭位元組(判 MIME 用)。"""
    with path.open("rb") as fh:
        head = fh.read(_HEAD)
        fh.seek(0)
        return hashlib.file_digest(fh, "sha256").hexdigest(), head


def safe_name(title: str, fallback: str) -> str:
    """與 `files.save_upload` 同一套:去掉任何路徑成分。

    這個名字會成為打包下載的 zip entry 名,帶著 `../` 的話 Windows 端解壓會寫到
    目錄外。這份 dump 的 46,886 筆 title 一筆都沒有分隔符,但下一份就未必。
    """
    return Path((title or "").strip().replace("\\", "/")).name or fallback


async def import_photos(legacy, db: AsyncSession, ids: IdMap) -> None:
    scope_start, scope_end = _scope_bounds()
    rows = (
        await legacy.execute(
            sa.text(
                'SELECT i.id, i.title, i."Image", i."uploadTime", i."FK_Activity_id" AS aid'
                ' FROM "Club_activityimages" i'
                ' JOIN "Club_activity" a ON a.id = i."FK_Activity_id"'
                ' WHERE a."StartTime" >= :start AND a."StartTime" < :end ORDER BY i.id'
            ),
            {"start": scope_start, "end": scope_end},
        )
    ).all()

    # 活動的 club_id 與建立者:照片掛在活動上,權限邊界與上傳者都跟著活動走
    acts = {
        aid: (club_id, created_by)
        for aid, club_id, created_by in await db.execute(
            sa.select(Activity.id, Activity.club_id, Activity.created_by)
        )
    }
    # 同社團內 report_photo 的 sha256 唯一(uq_files_club_report_photo_sha);
    # 先把庫裡既有的收進來,重跑與跨活動重複照片都在寫入前就擋掉
    seen: set[tuple[int | None, str]] = {
        (club_id, sha)
        for club_id, sha in await db.execute(
            sa.select(File.club_id, File.sha256).where(
                File.slot == PHOTO_SLOT, File.archived_at.is_(None)
            )
        )
    }

    created = missing = no_activity = bad_ext = bad_content = 0
    total_bytes = 0
    # 每個舊活動有幾張、跳過幾張:整個活動一張都沒進的要單獨列出來,
    # 只印一行「重複 98」的話,承辦不會知道有活動的成果頁從此是空的
    per_act: dict[int, list[int]] = defaultdict(lambda: [0, 0])
    skipped_rows: list[tuple] = []
    # 已落盤但還沒 commit 的檔:中途失敗時 File 列會回滾,這些檔就沒人管得到了
    # (--reset 靠 id-map 找檔,查不到就掃不出來)
    pending: list[Path] = []
    upload_root = Path(settings.upload_dir)

    def note_skip(row, reason: str) -> None:
        per_act[row.aid][1] += 1
        skipped_rows.append((row.aid, row.id, row.Image, reason))

    try:
        for row in rows:
            if ids.get(LEGACY_TABLE, row.id) is not None:
                continue
            per_act[row.aid][0] += 1
            new_aid = ids.get("Club_activity", row.aid)
            if new_aid is None or int(new_aid) not in acts:
                no_activity += 1  # 活動不在遷移範圍或屬不遷的社團
                note_skip(row, "活動未遷")
                continue
            src = MEDIA_DIR / row.Image
            if not src.is_file():
                missing += 1
                note_skip(row, "盤上缺檔")
                continue
            ext = src.suffix.lower()
            if ext not in IMAGE.extensions:
                bad_ext += 1
                note_skip(row, f"副檔名不收({ext})")
                continue

            club_id, user_id = acts[int(new_aid)]
            sha, head = digest_and_head(src)
            # 副檔名不等於內容:Django ImageField 只保證是圖。以實際內容決定 MIME,
            # 存錯的話 file_response 會用錯的 Content-Type inline 送出
            mime = detect_mime(head, ext)
            if mime is None or not mime.startswith("image/"):
                bad_content += 1
                note_skip(row, "內容不是影像")
                continue
            if (club_id, sha) in seen:
                note_skip(row, "同社團已有相同照片")
                continue
            seen.add((club_id, sha))

            file_id = uuid.uuid4()
            uploaded_at = local_dt(row.uploadTime)
            # 月份歸檔用原始上傳時刻,不用遷移當下 —— 盤上佈局要對得回舊系統
            rel_path = f"{MODULE}/{uploaded_at:%Y}/{uploaded_at:%m}/{file_id}"
            dest = upload_root / rel_path
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(src, dest)
            pending.append(dest)

            size = dest.stat().st_size
            total_bytes += size
            db.add(
                File(
                    id=file_id,
                    club_id=club_id,
                    uploaded_by=user_id,
                    subject_type=PHOTO_SUBJECT,
                    subject_id=int(new_aid),
                    slot=PHOTO_SLOT,
                    original_name=safe_name(row.title, Path(row.Image).name),
                    size=size,
                    mime=mime,
                    sha256=sha,
                    path=rel_path,
                    created_at=uploaded_at,
                )
            )
            ids.record(db, LEGACY_TABLE, row.id, "files", file_id)
            created += 1
            if created % BATCH == 0:
                await db.commit()
                pending.clear()
                print(f"  photos … {created}/{len(rows)}")
        await db.commit()
        pending.clear()
    finally:
        # 這一批的 File 列隨交易回滾了,盤上的檔留著只會變成沒人掃得到的孤兒
        for orphan in pending:
            orphan.unlink(missing_ok=True)

    dup = sum(1 for _, _, _, reason in skipped_rows if reason == "同社團已有相同照片")
    print(
        f"photos: 新增 {created} 張({total_bytes / 1024 / 1024:.0f} MB)"
        f";同社團重複 {dup}、活動未遷 {no_activity}、盤上缺檔 {missing}"
        f"、副檔名不收 {bad_ext}、內容不是影像 {bad_content}"
    )
    emptied = sorted(aid for aid, (total, skipped) in per_act.items() if total and total == skipped)
    if emptied:
        print(
            f"  **{len(emptied)} 個活動一張照片都沒進**(舊 activity id):"
            f"{'、'.join(str(a) for a in emptied[:20])}"
            + (f" …等 {len(emptied)} 個" if len(emptied) > 20 else "")
        )
    if skipped_rows:
        out_dir = MIGRATION_DIR / "out"
        out_dir.mkdir(exist_ok=True)
        out = out_dir / f"photos_skipped_{date.today().isoformat()}.csv"
        with out.open("w", newline="", encoding="utf-8-sig") as fh:
            writer = csv.writer(fh)
            writer.writerow(["legacy_activity_id", "legacy_image_id", "來源路徑", "原因"])
            writer.writerows(skipped_rows)
        print(f"  跳過清單 {len(skipped_rows)} 列 → {out}")


async def reset(db: AsyncSession) -> None:
    """清掉本腳本匯入過的照片(DB 列 + 盤上檔案),換一份新 dump 前先跑。

    只刪自己 id-map 記過的列 —— 新系統上線後社團自己上傳的照片不受影響。
    **必須跑在 `cms_import.py --reset` 之前**(理由見模組 docstring)。

    順序是「先刪 DB 列並 commit,再 unlink」,與 `files.delete_file` 同一條規則:
    反過來的話中途中斷會留下「DB 有列、磁碟無檔」——社團端照樣列出照片、點下去 404。
    commit 之後 unlink 失敗只留孤兒檔,無害且掃得掉。
    """
    rows = list(
        await db.execute(
            sa.select(File.id, File.path)
            .join(
                LegacyIdMap,
                sa.and_(
                    LegacyIdMap.new_id == sa.cast(File.id, sa.Text),
                    LegacyIdMap.legacy_system == LegacySystem.CMS,
                    LegacyIdMap.legacy_table == LEGACY_TABLE,
                ),
            )
        )
    )
    if not rows:
        print("沒有可清除的照片匯入紀錄")
        return
    upload_root = Path(settings.upload_dir)
    if not (upload_root / MODULE).is_dir():
        sys.exit(
            f"找不到 {upload_root / MODULE}(UPLOAD_DIR={settings.upload_dir} 是相對路徑)。\n"
            "請在 backend/ 下執行 —— 現在清下去 DB 列會沒,盤上 4.9 GB 卻一個都刪不掉。"
        )

    await db.execute(sa.delete(File).where(File.id.in_([fid for fid, _ in rows])))
    await db.execute(
        sa.delete(LegacyIdMap).where(
            LegacyIdMap.legacy_system == LegacySystem.CMS,
            LegacyIdMap.legacy_table == LEGACY_TABLE,
        )
    )
    await db.commit()

    unlinked = kept = 0
    for _, rel_path in rows:
        disk = upload_root / rel_path
        if disk.is_file():
            disk.unlink()
            unlinked += 1
        else:
            kept += 1
    tail = f"(找不到 {kept} 個)" if kept else ""
    print(f"已清除照片 {len(rows)} 列、盤上檔案 {unlinked} 個{tail}")


async def main() -> None:
    async with async_session_factory() as db:
        if "--reset" in sys.argv:
            await reset(db)
            return
        if not MEDIA_DIR.is_dir():
            sys.exit(f"找不到 media 目錄:{MEDIA_DIR}(可用 CLUB_MEDIA 指定)")
        upload_root = Path(settings.upload_dir)
        if not upload_root.is_absolute() and Path.cwd() != BACKEND_DIR:
            sys.exit(
                f"UPLOAD_DIR={settings.upload_dir} 是相對路徑,請在 {BACKEND_DIR} 下執行"
                f"(目前在 {Path.cwd()})"
            )
        legacy_engine = create_async_engine(
            settings.sqlalchemy_url.set(database=os.environ.get("LEGACY_DB", "legacy_clubs"))
        )
        ids = IdMap()
        await ids.load(db)
        async with legacy_engine.connect() as legacy:
            await import_photos(legacy, db, ids)
        await legacy_engine.dispose()
    print("完成。")


if __name__ == "__main__":
    asyncio.run(main())
