import io
import uuid
from datetime import UTC, datetime

import pytest
import sqlalchemy as sa
from fastapi import UploadFile

from app.core.config import settings
from app.core.errors import AppError
from app.models import File
from app.services import files as file_service
from tests.conftest import login, make_club, make_user

PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
JPG_BYTES = b"\xff\xd8\xff\xe0" + b"\x00" * 64


def fake_upload(name: str, content: bytes) -> UploadFile:
    # size=宣告大小(Starlette 於真實請求會計算);配額預檢據此提前拒絕
    return UploadFile(io.BytesIO(content), filename=name, size=len(content))


async def test_save_upload_streams_and_hashes(db):
    club = await make_club(db)
    user = await make_user(db, username="club01", club_id=club.id)

    row = await file_service.save_upload(
        db,
        fake_upload("成果照片.png", PNG_BYTES),
        policy=file_service.IMAGE,
        module="reports",
        uploaded_by=user.id,
        club_id=club.id,
        slot="report_photo",
    )
    await db.commit()

    assert row.mime == "image/png"
    assert row.size == len(PNG_BYTES)
    now = datetime.now(UTC)
    assert row.path == f"reports/{now:%Y}/{now:%m}/{row.id}"
    assert (settings.upload_dir / row.path).read_bytes() == PNG_BYTES


async def test_magic_bytes_mismatch_rejected(db):
    user = await make_user(db, username="club01")
    with pytest.raises(AppError) as err:
        await file_service.save_upload(
            db,
            fake_upload("evil.png", b"<script>alert(1)</script>" + b"a" * 32),
            policy=file_service.IMAGE,
            module="reports",
            uploaded_by=user.id,
        )
    assert err.value.code == "UNSUPPORTED_FILE_TYPE"
    # 驗證失敗不得殘留暫存檔
    assert not any(p.is_file() for p in settings.upload_dir.rglob("*"))


async def test_disallowed_extension_rejected(db):
    user = await make_user(db, username="club01")
    with pytest.raises(AppError) as err:
        await file_service.save_upload(
            db,
            fake_upload("report.pdf", b"%PDF-1.7 xxx"),
            policy=file_service.IMAGE,  # 照片槽位不收 PDF
            module="reports",
            uploaded_by=user.id,
        )
    assert err.value.code == "UNSUPPORTED_FILE_TYPE"


async def test_oversize_rejected(db, monkeypatch):
    user = await make_user(db, username="club01")
    small = file_service.UploadPolicy("image", frozenset({".png"}), max_size=16)
    with pytest.raises(AppError) as err:
        await file_service.save_upload(
            db,
            fake_upload("big.png", PNG_BYTES),
            policy=small,
            module="reports",
            uploaded_by=user.id,
        )
    assert err.value.code == "FILE_TOO_LARGE"
    assert not any(settings.upload_dir.rglob("*.part"))


async def test_duplicate_photo_rejected_within_club(db):
    club_a = await make_club(db, name="社A")
    club_b = await make_club(db, name="社B")
    user = await make_user(db, username="club01", club_id=club_a.id)

    async def upload(club_id: int, name: str):
        return await file_service.save_upload(
            db,
            fake_upload(name, JPG_BYTES),
            policy=file_service.IMAGE,
            module="reports",
            uploaded_by=user.id,
            club_id=club_id,
            slot="report_photo",
            dedup="slot",
        )

    await upload(club_a.id, "photo1.jpg")
    await db.commit()

    # 同社團、同內容、不同檔名 → 擋
    with pytest.raises(AppError) as err:
        await upload(club_a.id, "renamed.jpg")
    assert err.value.code == "DUPLICATE_FILE"

    # 不同社團同內容 → 允許
    row = await upload(club_b.id, "photo1.jpg")
    await db.commit()
    assert row.club_id == club_b.id


_GIB = 1024**3


def _fake_row(club_id: int | None, uploaded_by: int, size: int, *, archived=False, tag="big"):
    """只進 DB 的佔用列(不落盤):把用量推到配額邊界用。"""
    return File(
        club_id=club_id,
        uploaded_by=uploaded_by,
        original_name=f"{tag}.bin",
        size=size,
        mime="application/octet-stream",
        sha256=tag,
        path=f"reports/2026/07/{tag}",
        archived_at=datetime.now(UTC) if archived else None,
    )


async def test_club_quota_exceeded_rejected(db):
    club = await make_club(db)
    user = await make_user(db, username="club01", club_id=club.id)
    db.add(_fake_row(club.id, user.id, 2 * _GIB - 50))  # 剩 50 bytes
    await db.commit()

    with pytest.raises(AppError) as err:
        await file_service.save_upload(
            db,
            fake_upload("p.png", PNG_BYTES),
            policy=file_service.IMAGE,
            module="reports",
            uploaded_by=user.id,
            club_id=club.id,
        )
    assert err.value.code == "INSUFFICIENT_STORAGE"
    assert "社團" in err.value.message
    await db.rollback()
    # 拒絕時不留 .part/dest/DB row
    assert not any(p.is_file() for p in settings.upload_dir.rglob("*"))
    assert await db.scalar(sa.select(sa.func.count()).select_from(File)) == 1


async def test_system_disk_full_rejected(db, monkeypatch):
    """系統總量改用實際磁碟可用空間:free 小於檔案即拒絕(2026-07-17)。"""
    import collections

    user = await make_user(db, username="club01")
    usage = collections.namedtuple("usage", "total used free")
    # 磁碟僅剩 10 bytes → 任何檔案都放不下(mock stdlib 查詢)
    monkeypatch.setattr(
        file_service.shutil, "disk_usage", lambda p: usage(100 * _GIB, 100 * _GIB - 10, 10)
    )
    with pytest.raises(AppError) as err:
        await file_service.save_upload(
            db,
            fake_upload("p.png", PNG_BYTES),
            policy=file_service.IMAGE,
            module="reports",
            uploaded_by=user.id,
        )
    assert err.value.code == "INSUFFICIENT_STORAGE"
    assert "系統" in err.value.message


async def test_archived_files_not_counted_in_quota(db):
    club = await make_club(db)
    user = await make_user(db, username="club01", club_id=club.id)
    # 歸檔檔案已離盤:同樣大小若未歸檔會擋,歸檔後不佔配額
    db.add(_fake_row(club.id, user.id, 2 * _GIB, archived=True))
    await db.commit()

    row = await file_service.save_upload(
        db,
        fake_upload("p.png", PNG_BYTES),
        policy=file_service.IMAGE,
        module="reports",
        uploaded_by=user.id,
        club_id=club.id,
    )
    await db.commit()
    assert row.size == len(PNG_BYTES)


async def test_concurrent_uploads_cannot_pierce_quota(db):
    """並發上傳不得一起穿透剩餘額度(advisory lock 持有到交易結束)。"""
    import asyncio

    from app.core.db import async_session_factory

    club = await make_club(db)
    user = await make_user(db, username="club01", club_id=club.id)
    db.add(_fake_row(club.id, user.id, 2 * _GIB - 60 * 1024))  # 剩 60 KB
    await db.commit()

    body = PNG_BYTES + b"\x00" * (40 * 1024)  # 各約 40 KB,只容得下一個

    async def upload_one(i: int) -> bool:
        async with async_session_factory() as s:
            try:
                await file_service.save_upload(
                    s,
                    fake_upload(f"p{i}.png", body + bytes([i])),
                    policy=file_service.IMAGE,
                    module="reports",
                    uploaded_by=user.id,
                    club_id=club.id,
                )
                await s.commit()
                return True
            except AppError as err:
                assert err.code == "INSUFFICIENT_STORAGE"
                return False

    results = await asyncio.gather(upload_one(1), upload_one(2))
    assert sorted(results) == [False, True]


async def test_duplicate_flush_conflict_leaves_no_orphan(db):
    """撞唯一索引(併發去重的 DB 收口)時,已 rename 的實體檔必須一併刪除。"""
    from sqlalchemy.exc import IntegrityError

    club = await make_club(db)
    user = await make_user(db, username="club01", club_id=club.id)
    await file_service.save_upload(
        db,
        fake_upload("p.jpg", JPG_BYTES),
        policy=file_service.IMAGE,
        module="reports",
        uploaded_by=user.id,
        club_id=club.id,
        slot="report_photo",
    )
    await db.commit()

    # 略過應用層先查(=另一 session 同時通過檢查的情境),直接撞 DB 唯一索引
    with pytest.raises(IntegrityError):
        await file_service.save_upload(
            db,
            fake_upload("dup.jpg", JPG_BYTES),
            policy=file_service.IMAGE,
            module="reports",
            uploaded_by=user.id,
            club_id=club.id,
            slot="report_photo",
        )
    await db.rollback()

    disk_files = [p for p in settings.upload_dir.rglob("*") if p.is_file()]
    assert len(disk_files) == 1  # 只剩第一個檔;無 .part、無 DB 看不見的孤兒
    assert await db.scalar(sa.select(sa.func.count()).select_from(File)) == 1


async def test_windows_path_stripped_from_stored_name(db):
    """存下的檔名會成為打包下載的 zip entry 名,不能留下任何路徑成分。"""
    club = await make_club(db)
    user = await make_user(db, username="club01", club_id=club.id)
    row = await file_service.save_upload(
        db,
        fake_upload(r"a\..\..\Users\Public\evil.png", PNG_BYTES),
        policy=file_service.IMAGE,
        module="reports",
        uploaded_by=user.id,
        club_id=club.id,
    )
    assert row.original_name == "evil.png"


async def test_uncommitted_upload_leaves_no_orphan(db):
    """呼叫端沒 commit(交易失敗或請求中途拋錯)時,已落盤的檔案不得留在磁碟上。"""
    from app.core.db import async_session_factory

    club = await make_club(db)
    user = await make_user(db, username="club01", club_id=club.id)

    async def upload(session, name: str, content: bytes):
        row = await file_service.save_upload(
            session,
            fake_upload(name, content),
            policy=file_service.IMAGE,
            module="reports",
            uploaded_by=user.id,
            club_id=club.id,
        )
        return settings.upload_dir / row.path

    async with async_session_factory() as session:
        kept = await upload(session, "keep.png", PNG_BYTES)
        await session.commit()
        dropped = await upload(session, "drop.jpg", JPG_BYTES)
        assert dropped.is_file()

    assert not dropped.exists()
    assert kept.is_file()  # 已 commit 的檔案不得被後續回滾牽連


async def test_download_scoped_to_own_club(client, db):
    club_a = await make_club(db, name="社A")
    club_b = await make_club(db, name="社B")
    owner = await make_user(db, username="club-a", club_id=club_a.id)
    await make_user(db, username="club-b", club_id=club_b.id)
    await make_user(db, username="admin01", role="admin", permissions=["aclose"])
    await make_user(db, username="admin-files", role="admin", permissions=["afiles"])

    row = await file_service.save_upload(
        db,
        fake_upload("photo.png", PNG_BYTES),
        policy=file_service.IMAGE,
        module="reports",
        uploaded_by=owner.id,
        club_id=club_a.id,
        subject_type="activity",
        subject_id=1,
        slot="report_photo",
    )
    await db.commit()
    url = f"/api/v1/files/{row.id}"

    await login(client, "club-a")
    resp = await client.get(url)
    assert resp.status_code == 200
    assert resp.content == PNG_BYTES
    assert resp.headers["content-type"].startswith("image/png")

    await login(client, "club-b")
    assert (await client.get(url)).status_code == 404  # 他社檔案視同不存在

    # 結案審核看得到活動照片
    await login(client, "admin01")
    assert (await client.get(url)).status_code == 200

    # 檔案管理是「看磁碟怎麼被吃掉」,不是取得內容:下載仍需該類檔案的頁面權限
    await login(client, "admin-files")
    assert (await client.get(url)).status_code == 404

    assert (await client.get(f"/api/v1/files/{uuid.uuid4()}")).status_code == 404


async def test_inline_pdf_allows_same_origin_framing_only(client, db):
    """授權成功的 inline PDF 放寬為 SAMEORIGIN(FilePreview iframe);其餘維持 DENY。"""
    club = await make_club(db)
    owner = await make_user(db, username="club01", club_id=club.id)
    pdf = await file_service.save_upload(
        db,
        fake_upload("plan.pdf", b"%PDF-1.7 test content"),
        policy=file_service.DOCUMENT,
        module="activities",
        uploaded_by=owner.id,
        club_id=club.id,
    )
    png = await file_service.save_upload(
        db,
        fake_upload("photo.png", PNG_BYTES),
        policy=file_service.IMAGE,
        module="reports",
        uploaded_by=owner.id,
        club_id=club.id,
    )
    await db.commit()

    await login(client, "club01")
    resp = await client.get(f"/api/v1/files/{pdf.id}")
    assert resp.status_code == 200
    assert resp.headers["x-frame-options"] == "SAMEORIGIN"
    assert "frame-ancestors 'self'" in resp.headers["content-security-policy"]

    # 圖片與一般 API 回應不放寬
    resp = await client.get(f"/api/v1/files/{png.id}")
    assert resp.headers["x-frame-options"] == "DENY"
    resp = await client.get("/api/v1/auth/me")
    assert resp.headers["x-frame-options"] == "DENY"
    assert "frame-ancestors 'none'" in resp.headers["content-security-policy"]


async def test_archived_file_returns_410(client, db):
    club = await make_club(db)
    owner = await make_user(db, username="club01", club_id=club.id)
    row = await file_service.save_upload(
        db,
        fake_upload("photo.png", PNG_BYTES),
        policy=file_service.IMAGE,
        module="reports",
        uploaded_by=owner.id,
        club_id=club.id,
    )
    await db.commit()
    await db.execute(sa.update(File).values(archived_at=datetime.now(UTC)))
    await db.commit()

    await login(client, "club01")
    resp = await client.get(f"/api/v1/files/{row.id}")
    assert resp.status_code == 410
    assert resp.json()["meta"]["code"] == "FILE_ARCHIVED"


async def test_common_image_formats_accepted(db):
    """結案照片放寬為所有常見影像格式(2026-07-16 第八輪,魔術位元組驗證)。"""
    user = await make_user(db, username="club01")
    samples = {
        "a.gif": b"GIF89a" + b"\x00" * 32,
        "b.webp": b"RIFF\x00\x00\x00\x00WEBP" + b"\x00" * 32,
        "c.bmp": b"BM" + b"\x00" * 32,
        "d.tiff": b"II*\x00" + b"\x00" * 32,
        "e.heic": b"\x00\x00\x00\x18ftypheic" + b"\x00" * 32,
        "f.avif": b"\x00\x00\x00\x18ftypavif" + b"\x00" * 32,
    }
    for name, content in samples.items():
        row = await file_service.save_upload(
            db,
            fake_upload(name, content),
            policy=file_service.IMAGE,
            module="reports",
            uploaded_by=user.id,
        )
        assert row.mime.startswith("image/"), name
    await db.commit()

    # mp4 品牌的 ftyp 不得冒充 heic;副檔名與內容不符一律 415
    with pytest.raises(AppError) as err:
        await file_service.save_upload(
            db,
            fake_upload("fake.heic", b"\x00\x00\x00\x18ftypisom" + b"\x00" * 32),
            policy=file_service.IMAGE,
            module="reports",
            uploaded_by=user.id,
        )
    assert err.value.code == "UNSUPPORTED_FILE_TYPE"


async def test_upload_limit_reads_settings(db):
    """上傳上限讀 system_settings upload_limits(管理員後台可調)。"""
    from app.models import SystemSetting

    user = await make_user(db, username="club01")
    db.add(SystemSetting(key="upload_limits", value={"img": 1}))  # 圖片上限 1MB
    await db.commit()

    with pytest.raises(AppError) as err:
        await file_service.save_upload(
            db,
            fake_upload("big.png", PNG_BYTES[:8] + b"\x00" * (1024 * 1024 + 16)),
            policy=file_service.IMAGE,
            module="reports",
            uploaded_by=user.id,
        )
    assert err.value.code == "FILE_TOO_LARGE"
    assert "1MB" in err.value.message


async def test_staff_limited_to_duty_files(client, db):
    """工讀生僅可取職務相關檔案(報修/違規佐證);郵局存簿等敏感檔視同不存在。"""
    club = await make_club(db)
    owner = await make_user(db, username="club01", club_id=club.id)
    await make_user(db, username="staff01", role="staff")

    passbook = await file_service.save_upload(
        db,
        fake_upload("pb.png", PNG_BYTES),
        policy=file_service.IMAGE,
        module="postal",
        uploaded_by=owner.id,
        club_id=club.id,
        subject_type="postal_change",
        slot="passbook",
    )
    evidence = await file_service.save_upload(
        db,
        fake_upload("ev.png", PNG_BYTES + b"\x00"),
        policy=file_service.IMAGE,
        module="maintenance",
        uploaded_by=owner.id,
        club_id=club.id,
        subject_type="maintenance",
        slot="evidence",
    )
    await db.commit()

    await login(client, "staff01")
    assert (await client.get(f"/api/v1/files/{passbook.id}")).status_code == 404
    assert (await client.get(f"/api/v1/files/{evidence.id}")).status_code == 200
