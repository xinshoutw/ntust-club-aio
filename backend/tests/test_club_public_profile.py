"""社團對外公開資料:欄位驗證、形象圖轉檔、公開檔案權限、行政端下架閥。"""

import io

import pytest
import sqlalchemy as sa
from fastapi import UploadFile
from PIL import Image

from app.core.config import settings
from app.core.errors import AppError
from app.models import Club, File
from app.models.enums import BannerTextMode, UserRole
from app.schemas.clubs import ClubProfileUpdate
from app.services import files as file_service
from tests.conftest import csrf_headers, login, make_club, make_user


def png_bytes(width: int, height: int, color: tuple[int, int, int] = (10, 10, 10)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (width, height), color).save(buf, format="PNG")
    return buf.getvalue()


def upload_of(name: str, content: bytes) -> UploadFile:
    return UploadFile(io.BytesIO(content), filename=name, size=len(content))


# ---- schema:公開欄位的清理與 null 處理(ISS-105 那條坑的同類) ----


def test_list_fields_take_explicit_null_as_empty():
    """tags / social_links 是 NOT NULL 欄位:顯式 null 是「清空」,不能原樣 setattr 進去。"""
    body = ClubProfileUpdate(tags=None, social_links=None)
    assert body.model_dump(exclude_unset=True) == {"tags": [], "social_links": []}


def test_tags_are_trimmed_deduped_and_length_capped():
    assert ClubProfileUpdate(tags=["  街舞 ", "街舞", "", "桌遊"]).tags == ["街舞", "桌遊"]
    with pytest.raises(ValueError, match="標籤長度"):
        ClubProfileUpdate(tags=["超過八個字的標籤名稱"])


@pytest.mark.parametrize("field", ["banner_dim", "banner_blur", "banner_text_mode"])
def test_display_params_reject_explicit_null(field):
    """0 才是「不套效果」,auto 才是「自動」—— 這幾欄沒有「空」的意思。"""
    with pytest.raises(ValueError):
        ClubProfileUpdate(**{field: None})


def test_blank_text_fields_collapse_to_none():
    body = ClubProfileUpdate(tagline="   ", office_location="", public_email="  ")
    assert body.tagline is None
    assert body.office_location is None
    assert body.public_email is None


def test_urls_and_emails_are_validated():
    with pytest.raises(ValueError, match="報名連結"):
        ClubProfileUpdate(signup_url="ntust.edu.tw/join")
    with pytest.raises(ValueError, match="對外聯絡信箱"):
        ClubProfileUpdate(public_email="not-an-email")
    with pytest.raises(ValueError, match="社群連結"):
        ClubProfileUpdate(social_links=[{"kind": "instagram", "url": "instagram.com/x"}])
    with pytest.raises(ValueError):
        ClubProfileUpdate(social_links=[{"kind": "plurk", "url": "https://plurk.com/x"}])


# ---- 形象圖:轉檔、尺寸、亮度、配額 ----


async def test_club_image_is_converted_to_fixed_size_webp(db):
    """落盤的必須是轉好的 WebP:原圖不留,尺寸固定,比例不合置中裁切。"""
    club = await make_club(db)
    user = await make_user(db, username="club01", club_id=club.id)

    row, luma = await file_service.save_club_image(
        db, upload_of("logo.png", png_bytes(1200, 400)), slot="avatar", uploaded_by=user.id
    )
    await db.commit()

    assert row.mime == "image/webp"
    assert row.original_name == "avatar.webp"
    assert row.public is True
    # 形象圖不計入社團配額 —— 社團不該為了傳結案照片刪掉自己的橫幅
    assert row.club_id is None
    with Image.open(settings.upload_dir / row.path) as img:
        assert img.format == "WEBP"
        assert img.size == file_service.CLUB_IMAGE_SIZES["avatar"]
    assert 0 <= luma <= 255


async def test_banner_luma_reads_the_bottom_third(db):
    """橫幅上的字壓在底部:亮度要取下三分之一,取全圖平均會在上亮下暗的圖上判反。"""
    user = await make_user(db, username="club01")
    tall = Image.new("RGB", (800, 600), (255, 255, 255))
    tall.paste(Image.new("RGB", (800, 200), (0, 0, 0)), (0, 400))  # 下三分之一塗黑
    buf = io.BytesIO()
    tall.save(buf, format="PNG")

    _, luma = await file_service.save_club_image(
        db, upload_of("banner.png", buf.getvalue()), slot="banner", uploaded_by=user.id
    )
    await db.commit()
    assert luma < 40  # 全圖平均會是 ~170


async def test_undecodable_image_is_rejected_as_415_not_500(db):
    """副檔名與魔術位元組都對、內容卻解不開(截斷檔):回 415 讓社團換一張。"""
    user = await make_user(db, username="club01")
    with pytest.raises(AppError) as err:
        await file_service.save_club_image(
            db,
            upload_of("broken.png", b"\x89PNG\r\n\x1a\n" + b"\x00" * 64),
            slot="avatar",
            uploaded_by=user.id,
        )
    assert err.value.status == 415


# ---- 公開檔案的權限邊界 ----


async def test_public_files_bypass_the_role_matrix(db):
    """形象圖的 club_id 是 NULL:走 CLUB 分支的話社團連自己的頭像都預覽不了。"""
    club = await make_club(db)
    other = await make_club(db, name="吉他社")
    owner = await make_user(db, username="club01", club_id=club.id)
    stranger = await make_user(db, username="club02", club_id=other.id)

    row, _ = await file_service.save_club_image(
        db, upload_of("logo.png", png_bytes(300, 300)), slot="avatar", uploaded_by=owner.id
    )
    await db.commit()

    assert await file_service.can_access(db, row, owner) is True
    assert await file_service.can_access(db, row, stranger) is True


async def test_non_public_files_still_obey_the_club_boundary(db):
    """public 是早退,不是把 can_access 整個放行 —— 一般附件的邊界必須原封不動。"""
    club = await make_club(db)
    other = await make_club(db, name="吉他社")
    owner = await make_user(db, username="club01", club_id=club.id)
    stranger = await make_user(db, username="club02", club_id=other.id)

    row = await file_service.save_upload(
        db,
        upload_of("photo.png", png_bytes(50, 50)),
        policy=file_service.IMAGE,
        module="reports",
        uploaded_by=owner.id,
        club_id=club.id,
        slot="report_photo",
    )
    await db.commit()

    assert row.public is False
    assert await file_service.can_access(db, row, owner) is True
    assert await file_service.can_access(db, row, stranger) is False


# ---- 端點 ----


async def test_club_uploads_and_removes_its_banner(client, db):
    club = await make_club(db)
    await make_user(db, username="club01", club_id=club.id)
    await login(client, "club01")

    res = await client.post(
        "/api/v1/club/profile/banner",
        files={"file": ("b.png", png_bytes(2000, 500), "image/png")},
        headers=csrf_headers(client),
    )
    assert res.status_code == 201, res.text
    data = res.json()["data"]
    assert data["banner_file_id"] is not None
    assert data["banner_luma"] is not None
    file_id = data["banner_file_id"]

    res = await client.delete("/api/v1/club/profile/banner", headers=csrf_headers(client))
    assert res.status_code == 200
    assert res.json()["data"]["banner_file_id"] is None
    # 亮度屬於「目前這張圖」:圖沒了值也要跟著走,否則 auto 字色會拿舊圖的亮度判新圖
    assert res.json()["data"]["banner_luma"] is None
    assert await db.get(File, file_id) is None  # 舊檔不留版本


async def test_replacing_an_image_drops_the_previous_file(client, db):
    club = await make_club(db)
    await make_user(db, username="club01", club_id=club.id)
    await login(client, "club01")

    first = await client.post(
        "/api/v1/club/profile/avatar",
        files={"file": ("a.png", png_bytes(400, 400, (200, 200, 200)), "image/png")},
        headers=csrf_headers(client),
    )
    old_id = first.json()["data"]["avatar_file_id"]
    second = await client.post(
        "/api/v1/club/profile/avatar",
        files={"file": ("a.png", png_bytes(400, 400, (20, 20, 20)), "image/png")},
        headers=csrf_headers(client),
    )
    new_id = second.json()["data"]["avatar_file_id"]

    assert new_id != old_id
    assert await db.get(File, old_id) is None


async def test_unknown_image_slot_is_404(client, db):
    club = await make_club(db)
    await make_user(db, username="club01", club_id=club.id)
    await login(client, "club01")
    res = await client.post(
        "/api/v1/club/profile/mascot",
        files={"file": ("a.png", png_bytes(50, 50), "image/png")},
        headers=csrf_headers(client),
    )
    assert res.status_code == 404


async def test_club_profile_round_trips_the_public_fields(client, db):
    club = await make_club(db)
    await make_user(db, username="club01", club_id=club.id)
    await login(client, "club01")

    res = await client.patch(
        "/api/v1/club/profile",
        json={
            "tagline": "每週三晚上一起跳舞",
            "tags": ["街舞", "表演"],
            "recruit_status": "招生中",
            "public_email": "dance@ntust.edu.tw",
            "social_links": [{"kind": "instagram", "url": "https://instagram.com/ntustdance"}],
            "founded_year": 1988,
            "banner_dim": 45,
            "banner_text_mode": "light",
        },
        headers=csrf_headers(client),
    )
    assert res.status_code == 200, res.text
    data = res.json()["data"]
    assert data["tagline"] == "每週三晚上一起跳舞"
    assert data["tags"] == ["街舞", "表演"]
    assert data["banner_dim"] == 45
    assert data["banner_text_mode"] == BannerTextMode.LIGHT.value
    # 下架閥是行政端的處置,社團端看不到也改不動
    assert "public_visible" not in data

    await db.refresh(club)
    assert club.public_visible is True


async def test_club_cannot_set_its_own_visibility(client, db):
    club = await make_club(db)
    await make_user(db, username="club01", club_id=club.id)
    await login(client, "club01")

    res = await client.patch(
        "/api/v1/club/profile",
        json={"public_visible": False},
        headers=csrf_headers(client),
    )
    assert res.status_code == 200
    await db.refresh(club)
    assert club.public_visible is True  # 未知欄位被忽略,不是被寫進去


# ---- 行政端下架閥 ----


async def test_admin_hides_a_club_with_a_reason(client, db):
    club = await make_club(db)
    await make_user(db, username="admin01", role=UserRole.ADMIN, permissions=["aclubset", "aclub"])
    await login(client, "admin01")

    missing = await client.patch(
        f"/api/v1/admin/clubs/{club.id}",
        json={"public_visible": False},
        headers=csrf_headers(client),
    )
    assert missing.status_code == 422  # 下架要留得下「為什麼」

    ok = await client.patch(
        f"/api/v1/admin/clubs/{club.id}",
        json={"public_visible": False, "public_hide_reason": "橫幅圖片不妥"},
        headers=csrf_headers(client),
    )
    assert ok.status_code == 200
    assert ok.json()["data"]["public_visible"] is False
    await db.refresh(club)
    assert club.public_visible is False
    assert club.is_active is True  # 下架不等於停用:帳號照常登入做事


async def test_admin_detail_carries_the_public_block(client, db):
    club = await make_club(db)
    club.tagline = "每週三晚上一起跳舞"
    club.tags = ["街舞"]
    await db.commit()
    await make_user(db, username="admin01", role=UserRole.ADMIN, permissions=["aclub"])
    await login(client, "admin01")

    res = await client.get(f"/api/v1/admin/clubs/{club.id}")
    assert res.status_code == 200, res.text
    public = res.json()["data"]["public"]
    assert public["tagline"] == "每週三晚上一起跳舞"
    assert public["tags"] == ["街舞"]
    # 公開區塊只帶公開欄位,對內欄位不得混進來
    assert "discord_webhook_url" not in public
    assert "advisor_name" not in public


async def test_admin_can_restore_visibility_without_a_reason(client, db):
    club = await make_club(db, public_visible=False)
    await make_user(db, username="admin01", role=UserRole.ADMIN, permissions=["aclubset", "aclub"])
    await login(client, "admin01")

    res = await client.patch(
        f"/api/v1/admin/clubs/{club.id}",
        json={"public_visible": True},
        headers=csrf_headers(client),
    )
    assert res.status_code == 200
    await db.refresh(club)
    assert club.public_visible is True


async def test_public_out_never_leaks_internal_columns():
    """公開形狀是白名單:往 clubs 加一欄內部欄位不得自動漏到校外。"""
    from app.schemas.clubs import ClubPublicOut

    leaked = {"discord_webhook_url", "contact_emails", "advisor_name", "advisor_email",
              "advisor_out_name", "advisor_out_email", "suspend_reason", "suspended_until",
              "is_active", "public_visible"}
    assert leaked.isdisjoint(ClubPublicOut.model_fields)
    assert set(ClubPublicOut.model_fields) <= {c.name for c in Club.__table__.columns}


def test_club_image_fks_do_not_break_table_sorting():
    """clubs → files → clubs 是一個環:少了 use_alter,`sorted_tables` 會放棄排序。

    症狀不是紅燈而是一行 SAWarning —— create_all/drop_all 的順序從此不可靠,
    而 conftest 的 TRUNCATE 清單正是由它產生的。
    """
    import warnings

    from app.models.base import Base

    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        assert Base.metadata.sorted_tables
    cycles = [w for w in caught if "unresolvable cycles" in str(w.message)]
    assert not cycles, [str(w.message) for w in cycles]


# ---- 刪除社團(形象圖在 FK 圖之外)----


async def test_a_club_with_images_can_still_be_deleted(client, db):
    """形象圖的 club_id 是 NULL,FK 圖走訪看不到它 —— 留著會擋住 users 那一刀。

    症狀是「傳過頭像的社團永遠刪不掉」,而確認框剛說這個社團沒有資料。
    """
    club = await make_club(db)
    owner = await make_user(db, username="club01", club_id=club.id)
    row, _ = await file_service.save_club_image(
        db, upload_of("logo.png", png_bytes(300, 300)), slot="avatar", uploaded_by=owner.id
    )
    club.avatar_file_id = row.id
    await db.commit()
    disk = settings.upload_dir / row.path
    assert disk.is_file()

    await make_user(db, username="admin01", role=UserRole.ADMIN, permissions=["aclubset"])
    await login(client, "admin01")

    # 擋刪清單要數得到它,否則承辦按下去連確認框都不會跳
    blocked = await client.delete(f"/api/v1/admin/clubs/{club.id}", headers=csrf_headers(client))
    assert blocked.status_code == 409
    assert "檔案" in blocked.json()["error"]

    res = await client.delete(
        f"/api/v1/admin/clubs/{club.id}?force=true", headers=csrf_headers(client)
    )
    assert res.status_code == 200, res.text
    assert await db.scalar(sa.select(Club.id).where(Club.id == club.id)) is None
    assert await db.scalar(sa.select(File.id).where(File.id == row.id)) is None
    assert not disk.is_file()  # commit 成功後才動磁碟,但確實要動


async def test_club_images_are_counted_in_the_file_management_page(client, db):
    """未知模組前綴會被 `usage()` 直接跳過:形象圖既不進任何模組,也不進總量。

    症狀是檔案管理頁上的佔用比磁碟實際少一截,而大型檔案列表把它標成「線上申請」。
    """
    club = await make_club(db)
    owner = await make_user(db, username="club01", club_id=club.id)
    row, _ = await file_service.save_club_image(
        db, upload_of("logo.png", png_bytes(600, 600)), slot="avatar", uploaded_by=owner.id
    )
    await db.commit()

    await make_user(db, username="admin01", role=UserRole.ADMIN, permissions=["afiles"])
    await login(client, "admin01")

    usage = (await client.get("/api/v1/admin/files/usage")).json()["data"]
    by_key = {m["key"]: m for m in usage["modules"]}
    assert by_key["clubimg"]["count"] == 1
    assert by_key["clubimg"]["size"] == row.size

    listed = (await client.get("/api/v1/admin/files")).json()["data"]
    mine = next(f for f in listed if f["original_name"] == "avatar.webp")
    assert mine["module"] == "clubimg"  # 不是 fallback 的 apps
