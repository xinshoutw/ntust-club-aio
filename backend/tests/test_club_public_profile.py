"""社團對外公開資料:欄位驗證、形象圖轉檔、公開檔案權限、行政端下架閥。"""

import io
import pathlib

import pytest
import sqlalchemy as sa
from fastapi import UploadFile
from PIL import Image

from app.core.config import settings
from app.core.errors import AppError
from app.models import Club, File
from app.models.enums import UserRole
from app.schemas.clubs import ClubProfileUpdate
from app.services import files as file_service
from tests.conftest import csrf_headers, login, make_club, make_user


def png_bytes(width: int, height: int, color: tuple[int, int, int] = (10, 10, 10)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (width, height), color).save(buf, format="PNG")
    return buf.getvalue()


def transparent_png_bytes(size: int = 300) -> bytes:
    """全透明的 PNG:社團上傳的 logo 最常見就是這種去背圖。"""
    buf = io.BytesIO()
    Image.new("RGBA", (size, size), (0, 0, 0, 0)).save(buf, format="PNG")
    return buf.getvalue()


def upload_of(name: str, content: bytes) -> UploadFile:
    return UploadFile(io.BytesIO(content), filename=name, size=len(content))


# ---- schema:公開欄位的清理與 null 處理(ISS-105 那條坑的同類) ----


def test_tags_take_explicit_null_as_empty():
    """tags 是 NOT NULL 欄位:顯式 null 是「清空」,不能原樣 setattr 進去。"""
    assert ClubProfileUpdate(tags=None).model_dump(exclude_unset=True) == {"tags": []}


def test_tags_must_come_from_the_master_list():
    """自由填寫會讓導覽頁的篩選長歪:同一件事三種寫法,篩選器列不完也對不起來。"""
    assert ClubProfileUpdate(tags=["  程式 ", "程式", "運動"]).tags == ["程式", "運動"]


def test_unknown_tags_are_dropped_not_rejected():
    """主檔外的值**丟掉**而不是 422。

    前端每次 PATCH 都原樣送回整個 tags,而挑選器只畫得出主檔裡的按鈕 ——
    raise 的話,庫裡有舊標籤的社團從此連改一句 tagline 都送不出去,
    而那個標籤在畫面上看不到也刪不掉。
    """
    assert ClubProfileUpdate(tags=["程式", "街舞"]).tags == ["程式"]


def test_too_many_tags_are_trimmed_not_rejected():
    """上限也一樣:超量的**裁掉**而不是 422。

    上限寫在 `Field(max_length=...)` 上的話,欄位層檢查會搶在 `_clean_tags` 之前跑,
    上面那條規則就只在「剛好不超量」時成立 —— 而主檔這一版才收斂,庫裡本來就有
    選了四五個的社團。
    """
    body = ClubProfileUpdate(tagline="改一句話", tags=["程式", "運動", "戶外", "音樂", "街舞"])
    assert body.tags == ["程式", "運動", "戶外"]


@pytest.mark.parametrize(
    "raw",
    [
        "ntust_dance",
        "@ntust_dance",
        "https://www.instagram.com/ntust_dance/",
        "https://instagram.com/ntust_dance",
        # IG 自己的分享連結一律帶 query —— 少剝這一段,最常見的貼法就換來 422
        "https://www.instagram.com/ntust_dance?igsh=MzRlODBiNWFlZA==",
        "https://www.instagram.com/ntust_dance/?igsh=MzRlODBiNWFlZA%3D%3D",
        # 輸入框的 `instagram.com /` 前綴正好在暗示可以省略 scheme
        "instagram.com/ntust_dance",
        "m.instagram.com/ntust_dance",
        "https://instagr.am/ntust_dance",
    ],
)
def test_instagram_is_stored_as_a_bare_id(raw):
    assert ClubProfileUpdate(instagram=raw).instagram == "ntust_dance"


@pytest.mark.parametrize(
    "raw",
    [
        "  ",
        "not a handle",
        "這不是合法帳號",
        # `$` 會放行結尾換行,fullmatch 不會
        "abc\n/",
    ],
)
def test_an_unusable_instagram_value_is_dropped_not_rejected(raw):
    """剝不出帳號就當沒填。

    raise 的話,庫裡留著一個舊格式的值就會讓那個社團的管理項目表單每次 PATCH 都 422
    (前端原樣送回這一欄),而畫面上那一欄看起來完全正常 —— 與 tags 同一個理由。
    """
    assert ClubProfileUpdate(instagram=raw).instagram is None


def test_instagram_keeps_only_the_last_path_segment():
    """規則就是「`/` 後面那一段」,不認網域。

    代價:`kind` 標成 instagram 卻填了別的平台的舊值(舊 SocialLink 只要求 http(s),
    這是合法舊值)會被當成帳號收下,社團頁連出去是一個不存在的 IG。換來的是不必列舉
    `m.` / `instagr.am` / 未來任何一種分享網域 —— 列舉漏一個就是一個社團被鎖在 422 裡。
    同理,貼單篇貼文／限動的連結(`instagram.com/p/CxYz123/`)會取到 `CxYz123`。
    兩者都靠**存檔後把正規化結果回填欄位**讓社團自己看見(`ClubSettingsPage.onFinish`),
    而不是在這裡維護一份 `p` / `reel` / `tagged` / `explore` 的保留字清單 —— 那種清單
    漏一個就是一個錯帳號,和「列舉 IG 的分享網域」是同一個坑。
    """
    assert ClubProfileUpdate(instagram="https://www.facebook.com/wrongplatform").instagram == (
        "wrongplatform"
    )



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


# ---- 形象圖:轉檔、尺寸、亮度、配額 ----


async def test_club_image_is_converted_to_fixed_size_webp(db):
    """落盤的必須是轉好的 WebP:原圖不留,尺寸固定,比例不合置中裁切。"""
    club = await make_club(db)
    user = await make_user(db, username="club01", club_id=club.id)

    row = await file_service.save_club_image(
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


async def _avatar_of(db, club, owner):
    row = await file_service.save_club_image(
        db, upload_of("logo.png", png_bytes(300, 300)), slot="avatar", uploaded_by=owner.id
    )
    club.avatar_file_id = row.id
    await db.commit()
    return row


async def test_a_visible_clubs_image_is_readable_by_any_account(db):
    """形象圖的 club_id 是 NULL:走 CLUB 分支的話社團連自己的頭像都預覽不了。

    公開的社團,它的形象圖匿名都拿得到了,校內帳號自然也可以。
    """
    club = await make_club(db)
    other = await make_club(db, name="吉他社")
    owner = await make_user(db, username="club01", club_id=club.id)
    stranger = await make_user(db, username="club02", club_id=other.id)

    row = await _avatar_of(db, club, owner)

    assert await file_service.can_access(db, row, owner) is True
    assert await file_service.can_access(db, row, stranger) is True


@pytest.mark.parametrize("hide", [{"public_visible": False}, {"is_active": False}])
async def test_a_hidden_clubs_image_stops_being_readable_by_others(db, hide):
    """下架要擋住**兩條**通道。

    只擋 `/public/files/{id}` 的話,任何持有這個 UUID 的校內帳號(別社的社團、評審、
    沒有檔案管理權限的承辦)照樣從 `/files/{id}` 下載得到 —— 行政端按下下架等於沒按。
    社團自己不受影響:下架不表示它管不了自己的形象圖,設定頁還要預覽。
    """
    club = await make_club(db)
    other = await make_club(db, name="吉他社")
    owner = await make_user(db, username="club01", club_id=club.id)
    stranger = await make_user(db, username="club02", club_id=other.id)
    viewer = await make_user(db, username="judge01", role="viewer")

    row = await _avatar_of(db, club, owner)
    for k, v in hide.items():
        setattr(club, k, v)
    await db.commit()

    assert await file_service.can_access(db, row, stranger) is False
    assert await file_service.can_access(db, row, viewer) is False
    assert await file_service.can_access(db, row, owner) is True


async def test_a_transparent_logo_is_flattened_onto_white(db):
    """透明底不能變黑底。

    `convert("RGB")` 是直接丟掉 alpha —— 透明像素留下的是底層 RGB,而多數編碼器
    在那裡寫 0。字卡與社團頁的底都是白的,壓到白底才和社團看到的原圖一樣。
    """
    club = await make_club(db)
    owner = await make_user(db, username="club01", club_id=club.id)

    row = await file_service.save_club_image(
        db, upload_of("logo.png", transparent_png_bytes()), slot="avatar", uploaded_by=owner.id
    )
    await db.commit()

    with Image.open(pathlib.Path(settings.upload_dir) / row.path) as out:
        assert out.convert("RGB").getpixel((5, 5)) == (255, 255, 255)


async def test_an_unreferenced_public_image_is_readable_by_nobody(db):
    """上傳成功但沒掛到任何社團上的孤兒檔,不因為 `public` 三個字就人人可取。"""
    club = await make_club(db)
    owner = await make_user(db, username="club01", club_id=club.id)

    row = await file_service.save_club_image(
        db, upload_of("logo.png", png_bytes(300, 300)), slot="avatar", uploaded_by=owner.id
    )
    await db.commit()

    assert await file_service.can_access(db, row, owner) is False


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
        "/api/v1/club/profile/banner/upload",
        files={"file": ("b.png", png_bytes(2000, 500), "image/png")},
        headers=csrf_headers(client),
    )
    assert res.status_code == 201, res.text
    data = res.json()["data"]
    assert data["banner_file_id"] is not None
    file_id = data["banner_file_id"]

    res = await client.delete("/api/v1/club/profile/banner", headers=csrf_headers(client))
    assert res.status_code == 200
    assert res.json()["data"]["banner_file_id"] is None
    assert await db.get(File, file_id) is None  # 舊檔不留版本


async def test_replacing_an_image_drops_the_previous_file(client, db):
    club = await make_club(db)
    await make_user(db, username="club01", club_id=club.id)
    await login(client, "club01")

    first = await client.post(
        "/api/v1/club/profile/avatar/upload",
        files={"file": ("a.png", png_bytes(400, 400, (200, 200, 200)), "image/png")},
        headers=csrf_headers(client),
    )
    old_id = first.json()["data"]["avatar_file_id"]
    second = await client.post(
        "/api/v1/club/profile/avatar/upload",
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
        "/api/v1/club/profile/mascot/upload",
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
            "tags": ["運動", "表演"],
            "recruit_status": "歡迎加入",
            "public_email": "dance@ntust.edu.tw",
            "instagram": "ntustdance",
        },
        headers=csrf_headers(client),
    )
    assert res.status_code == 200, res.text
    data = res.json()["data"]
    assert data["tagline"] == "每週三晚上一起跳舞"
    assert data["tags"] == ["運動", "表演"]
    assert data["instagram"] == "ntustdance"
    # 下架閥**唯讀**帶給社團:開關仍只在行政端,但社團要知道自己公不公開
    assert data["public_visible"] is True

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
    club.tags = ["運動"]
    await db.commit()
    await make_user(db, username="admin01", role=UserRole.ADMIN, permissions=["aclub"])
    await login(client, "admin01")

    res = await client.get(f"/api/v1/admin/clubs/{club.id}")
    assert res.status_code == 200, res.text
    public = res.json()["data"]["public"]
    assert public["tagline"] == "每週三晚上一起跳舞"
    assert public["tags"] == ["運動"]
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
    row = await file_service.save_club_image(
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
    row = await file_service.save_club_image(
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


def test_fit_webp_never_touches_the_source_file():
    """轉檔只回位元組,不碰磁碟。

    `run_in_executor` 取消不會停 thread:就地覆寫原檔的話,請求被取消後
    `_drop_uncommitted_uploads` 會先刪掉落盤的檔,thread 這時才把它建回來 ——
    留下一個 DB 沒有列、檔案管理掃不到、沒有任何清理路徑管得到的孤兒檔。
    """
    import tempfile

    with tempfile.TemporaryDirectory() as tmp:
        src = pathlib.Path(tmp) / "source.png"
        src.write_bytes(png_bytes(900, 900, (200, 200, 200)))
        before = src.read_bytes()

        data = file_service._fit_webp(src, (256, 256))

        assert src.read_bytes() == before  # 原檔一個位元組都沒動
        assert list(pathlib.Path(tmp).iterdir()) == [src]  # 也沒留下任何暫存檔
        with Image.open(io.BytesIO(data)) as out:
            assert out.format == "WEBP"
            assert out.size == (256, 256)


async def test_removing_an_image_twice_is_not_an_error(client, db):
    """換圖與移除在 `clubs` 上取列鎖序列化,刪舊檔走 Core(配到 0 列即無事)。

    用 ORM 的 `db.delete` 的話,後到的請求在 flush 時會丟 `StaleDataError` ——
    那不是 `IntegrityError`,全域 handler 接不住,使用者拿到的是 500。
    """
    club = await make_club(db)
    await make_user(db, username="club01", club_id=club.id)
    await login(client, "club01")

    await client.post(
        "/api/v1/club/profile/avatar/upload",
        files={"file": ("a.png", png_bytes(300, 300), "image/png")},
        headers=csrf_headers(client),
    )
    first = await client.delete("/api/v1/club/profile/avatar", headers=csrf_headers(client))
    second = await client.delete("/api/v1/club/profile/avatar", headers=csrf_headers(client))
    assert (first.status_code, second.status_code) == (200, 200)
    assert second.json()["data"]["avatar_file_id"] is None


async def test_a_stale_instagram_value_does_not_break_reading_the_profile(db, client):
    """輸出 schema 不沿用輸入的限制:庫裡的舊值不該讓社團連管理項目都打不開。

    帳號格式收緊、或有人直接改 DB,只要輸出側掛著輸入的驗證,那一列一讀就 500
    (AGENTS.md 記下的坑,實測過 60 個活動打不開)。
    """
    club = await make_club(db)
    await make_user(db, username="club01", club_id=club.id)
    club.instagram = "這不是合法帳號"
    club.tags = ["已經不在主檔裡的標籤"]
    await db.commit()

    await login(client, "club01")
    res = await client.get("/api/v1/club/profile")
    assert res.status_code == 200, res.text
    assert res.json()["data"]["instagram"] == "這不是合法帳號"
    assert res.json()["data"]["tags"] == ["已經不在主檔裡的標籤"]



async def test_image_changes_are_traceable_in_the_audit_trail(client, db):
    from app.models import AuditLog

    club = await make_club(db)
    await make_user(db, username="club01", club_id=club.id)
    await login(client, "club01")

    image_logs = (
        sa.select(sa.func.count())
        .select_from(AuditLog)
        .where(AuditLog.action.like("club_avatar_%"))
    )
    # 本來就沒圖時按移除:什麼都沒發生,不該留下一筆紀錄(登入自己有一筆,不算)
    await client.delete("/api/v1/club/profile/avatar", headers=csrf_headers(client))
    assert await db.scalar(image_logs) == 0

    res = await client.post(
        "/api/v1/club/profile/avatar/upload",
        files={"file": ("a.png", png_bytes(300, 300), "image/png")},
        headers=csrf_headers(client),
    )
    file_id = res.json()["data"]["avatar_file_id"]
    row = await db.scalar(sa.select(AuditLog).where(AuditLog.action == "club_avatar_updated"))
    assert row is not None
    assert f"club={club.id}" in row.detail and file_id in row.detail


async def test_the_club_can_see_whether_its_page_is_public(client, db):
    """開關只在行政端,但社團要知道自己公不公開 ——
    否則按「預覽社團頁」撞上 404,看起來像系統壞了。"""
    club = await make_club(db, public_visible=False)
    await make_user(db, username="club01", club_id=club.id)
    await login(client, "club01")

    data = (await client.get("/api/v1/club/profile")).json()["data"]
    assert data["public_visible"] is False

    # 唯讀:社團端送這一欄不會生效(ClubProfileUpdate 沒有它)
    await client.patch(
        "/api/v1/club/profile", json={"public_visible": True}, headers=csrf_headers(client)
    )
    await db.refresh(club)
    assert club.public_visible is False
