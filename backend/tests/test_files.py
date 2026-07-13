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


@pytest.fixture(autouse=True)
def _tmp_upload_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "upload_dir", tmp_path)


def fake_upload(name: str, content: bytes) -> UploadFile:
    return UploadFile(io.BytesIO(content), filename=name)


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
            reject_duplicate_in_club_slot=True,
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


async def test_download_scoped_to_own_club(client, db):
    club_a = await make_club(db, name="社A")
    club_b = await make_club(db, name="社B")
    owner = await make_user(db, username="club-a", club_id=club_a.id)
    await make_user(db, username="club-b", club_id=club_b.id)
    await make_user(db, username="admin01", role="admin")

    row = await file_service.save_upload(
        db,
        fake_upload("photo.png", PNG_BYTES),
        policy=file_service.IMAGE,
        module="reports",
        uploaded_by=owner.id,
        club_id=club_a.id,
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

    await login(client, "admin01")
    assert (await client.get(url)).status_code == 200

    assert (await client.get(f"/api/v1/files/{uuid.uuid4()}")).status_code == 404


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
