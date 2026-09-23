"""免登入的社團導覽端點:誰看得到、看得到什麼、看不到什麼。

這是整個系統唯一對匿名開放的社團資料面,所以「不該回什麼」與「該回什麼」一樣重要。
"""

import datetime as dt
import io
import itertools

import pytest
from fastapi import UploadFile
from PIL import ExifTags, Image

from app.core.config import settings
from app.models import Activity, File
from app.models.enums import ActivityStatus, ActivityType
from app.services import files as file_service
from tests.conftest import login, make_club, make_user

URL = "/api/v1/public/clubs"


def png_bytes(size: int = 240) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (size, size), (40, 60, 90)).save(buf, format="PNG")
    return buf.getvalue()


async def make_activity(
    db, club, *, name: str, status: ActivityStatus, day: dt.date, created_by: int
) -> Activity:
    row = Activity(
        club_id=club.id,
        name=name,
        content="期末成果發表，歡迎自由入場",
        location="體育館",
        type=ActivityType.EVENT,
        date=day,
        end_date=day,
        status=status,
        created_by=created_by,
    )
    db.add(row)
    await db.commit()
    return row


async def seed_club(db, **kw):
    club = await make_club(db, **kw)
    club.intro = "我們是熱舞社"
    club.tagline = "每週三晚上一起跳舞"
    club.tags = ["運動"]
    club.public_email = "dance@ntust.edu.tw"
    club.instagram = "ntust_dance"
    # 對內欄位:一個都不該出現在公開端點上
    club.contact_emails = ["inner@ntust.edu.tw"]
    club.discord_webhook_url = "https://discord.com/api/webhooks/1/abc"
    club.advisor_name = "王老師"
    club.advisor_email = "teacher@ntust.edu.tw"
    club.suspend_reason = "器材逾期"
    await db.commit()
    return club


# ---- 誰出現在導覽頁 ----


async def test_anonymous_sees_the_visible_clubs(client, db):
    await seed_club(db)
    res = await client.get(URL)
    assert res.status_code == 200, res.text
    assert [c["name"] for c in res.json()["data"]] == ["熱舞社"]


async def test_hidden_and_inactive_clubs_are_absent_everywhere(client, db):
    listed = await make_club(db, name="吉他社")
    hidden = await make_club(db, name="熱舞社", public_visible=False)
    closed = await make_club(db, name="圍棋社", is_active=False)

    names = [c["name"] for c in (await client.get(URL)).json()["data"]]
    assert names == ["吉他社"]

    for club in (hidden, closed):
        # 404 而不是「已停社」頁:對外沒有必要交代某個社團曾經存在
        assert (await client.get(f"{URL}/{club.id}")).status_code == 404
        assert (await client.get(f"{URL}/{club.id}/activities")).status_code == 404
    assert (await client.get(f"{URL}/{listed.id}")).status_code == 200


async def test_the_list_order_is_stable(client, db):
    """端點只保證一個穩定次序(名稱),**導覽頁的順序由前端決定**。

    DB 的 collation 是 `en_US.utf8`,對中文等於碼位序,排不出有意義的順序;
    真正的規則(性質 → 名稱)在 `ClubDirectoryPage`,前端手上本來就是全量。

    下面的 `first == sorted(first)` 因此**同時釘住了那個 collation 假設** ——
    哪天測試庫換成 `zh_TW` 這條會紅,那時要改的是這個斷言,不是 `order_by`。
    """
    for name in ("熱舞社", "吉他社", "圍棋社"):
        await make_club(db, name=name)

    first = [c["name"] for c in (await client.get(URL)).json()["data"]]
    second = [c["name"] for c in (await client.get(URL)).json()["data"]]
    assert first == second
    # 釘住次序本身,不只是「兩次一樣」—— 後者把 order_by 整條刪掉也會綠
    assert first == sorted(first)
    assert sorted(first) == sorted(["熱舞社", "吉他社", "圍棋社"])


# ---- 回什麼、不回什麼 ----


async def test_the_card_carries_no_internal_fields(client, db):
    await seed_club(db)
    card = (await client.get(URL)).json()["data"][0]
    assert card["tagline"] == "每週三晚上一起跳舞"
    assert card["tags"] == ["運動"]
    # 字卡不帶長文:六十幾張卡一次回傳,詳細頁才要的東西不該跟著走一遍
    assert "intro" not in card and "join_info" not in card
    assert "instagram" not in card


@pytest.mark.parametrize(
    "leaked",
    [
        "contact_emails",
        "discord_webhook_url",
        "advisor_name",
        "advisor_email",
        "advisor_out_name",
        "suspend_reason",
        "suspended_until",
        "is_active",
        "public_visible",
    ],
)
async def test_detail_never_leaks_internal_fields(client, db, leaked):
    club = await seed_club(db)
    detail = (await client.get(f"{URL}/{club.id}")).json()["data"]
    assert leaked not in detail


async def test_detail_carries_the_public_fields(client, db):
    club = await seed_club(db)
    detail = (await client.get(f"{URL}/{club.id}")).json()["data"]
    assert detail["intro"] == "我們是熱舞社"
    assert detail["public_email"] == "dance@ntust.edu.tw"
    assert detail["instagram"] == "ntust_dance"


async def test_stale_values_do_not_break_the_public_page(client, db):
    """輸出側不掛輸入的驗證:庫裡的舊值不該讓整個社團的公開頁 500。"""
    club = await make_club(db)
    club.instagram = "這不是合法帳號"
    club.tags = ["已經不在主檔裡的標籤"]
    await db.commit()
    res = await client.get(f"{URL}/{club.id}")
    assert res.status_code == 200, res.text
    assert res.json()["data"]["instagram"] == "這不是合法帳號"


# ---- 活動 ----


@pytest.mark.parametrize(
    ("status", "public"),
    [
        (ActivityStatus.DRAFT, False),
        (ActivityStatus.PENDING_ADVISOR, False),
        (ActivityStatus.PENDING_CHIEF, False),
        (ActivityStatus.PENDING_DEAN, False),
        (ActivityStatus.REJECTED, False),
        (ActivityStatus.APPROVED, True),
        (ActivityStatus.CLOSING_PENDING_ADVISOR, True),
        (ActivityStatus.CLOSED, True),
    ],
)
async def test_only_approved_activities_are_public(client, db, status, public):
    """舊系統的公開月曆沒過濾狀態,把審核中的草稿全放出去了 —— 同一個坑。"""
    club = await make_club(db)
    user = await make_user(db, username="club01", club_id=club.id)
    await make_activity(
        db, club, name="成果發表", status=status, day=dt.date(2026, 3, 1), created_by=user.id
    )

    rows = (await client.get(f"{URL}/{club.id}/activities")).json()["data"]
    assert bool(rows) is public


async def test_activity_rows_carry_the_content_but_no_money(client, db):
    """活動彈窗(D-42)要活動內容;補助、經費來源與承辦備註是學務處與社團之間的事。"""
    club = await make_club(db)
    user = await make_user(db, username="club01", club_id=club.id)
    activity = await make_activity(
        db,
        club,
        name="成果發表",
        status=ActivityStatus.CLOSED,
        day=dt.date(2026, 3, 1),
        created_by=user.id,
    )
    activity.school_approved = 3000
    activity.fund_source = "學務處補助"
    activity.admin_note = "結案記得附收據"
    await db.commit()

    row = (await client.get(f"{URL}/{club.id}/activities")).json()["data"][0]
    assert row["name"] == "成果發表"
    assert row["location"] == "體育館"
    assert row["content"] == "期末成果發表，歡迎自由入場"
    for field in ("school_approved", "admin_note", "fund_source", "status", "budget_items"):
        assert field not in row
    assert "3000" not in str(row) and "收據" not in str(row)


async def test_only_the_ten_most_recent_activities_are_public(client, db):
    """公開頁回答的是「這個社團在辦什麼」,不是完整流水帳 —— 只列最近 10 次。"""
    club = await make_club(db)
    user = await make_user(db, username="club01", club_id=club.id)
    for day in range(1, 15):
        await make_activity(
            db,
            club,
            name=f"第 {day} 場",
            status=ActivityStatus.APPROVED,
            day=dt.date(2026, 3, day),
            created_by=user.id,
        )

    rows = (await client.get(f"{URL}/{club.id}/activities")).json()["data"]
    assert len(rows) == 10
    # 截掉的是最舊的,留下的是最近的
    assert rows[0]["name"] == "第 14 場"
    assert rows[-1]["name"] == "第 5 場"


async def test_activities_are_newest_first_and_filterable_by_semester(client, db):
    club = await make_club(db)
    user = await make_user(db, username="club01", club_id=club.id)
    for name, day in (
        ("上學期活動", dt.date(2025, 10, 1)),  # 114-1
        ("下學期活動", dt.date(2026, 3, 1)),  # 114-2
    ):
        await make_activity(
            db, club, name=name, status=ActivityStatus.APPROVED, day=day, created_by=user.id
        )

    rows = (await client.get(f"{URL}/{club.id}/activities")).json()["data"]
    assert [r["name"] for r in rows] == ["下學期活動", "上學期活動"]

    scoped = (
        await client.get(f"{URL}/{club.id}/activities", params={"semester": "114-1"})
    ).json()["data"]
    assert [r["name"] for r in scoped] == ["上學期活動"]

    assert (
        await client.get(f"{URL}/{club.id}/activities", params={"semester": "2026"})
    ).status_code == 422


# ---- 公開檔案通道 ----


async def make_public_image(db, club, slot: str = "avatar") -> File:
    """上傳並掛到社團上 —— 公開通道要求「引用它的社團現在是公開的」,
    沒掛上去的孤兒檔本來就不該送得出去(上傳端點一律在同一個交易內掛好)。"""
    owner = await make_user(db, username=f"club{club.id}", club_id=club.id)
    content = png_bytes()
    row = await file_service.save_club_image(
        db,
        UploadFile(io.BytesIO(content), filename="a.png", size=len(content)),
        slot=slot,
        uploaded_by=owner.id,
    )
    setattr(club, f"{slot}_file_id", row.id)
    await db.commit()
    return row


async def test_public_files_are_served_anonymously_and_cached(client, db):
    club = await make_club(db)
    row = await make_public_image(db, club)

    res = await client.get(f"/api/v1/public/files/{row.id}")
    assert res.status_code == 200, res.text
    assert res.headers["content-type"] == "image/webp"
    # 每張字卡每次進站重抓一次沒有道理,但也不能長到讓下架撤不回來
    assert "no-store" not in res.headers["cache-control"]
    assert "immutable" not in res.headers["cache-control"]
    max_age = int(res.headers["cache-control"].split("max-age=")[1].split(",")[0])
    assert 0 < max_age <= 3600
    # **private 不是 public**:社團下架的理由常常正是那張圖,`public` 會讓 CDN 與
    # 公司 proxy 替別人留一份。瀏覽器自己的快取不受影響
    assert res.headers["cache-control"].startswith("private")


async def test_private_files_are_not_reachable_through_the_public_channel(client, db):
    """不公開與不存在同一個 404:別讓人靠狀態碼探測某個 id 存不存在。"""
    club = await make_club(db)
    owner = await make_user(db, username="club01", club_id=club.id)
    private = await file_service.save_upload(
        db,
        UploadFile(io.BytesIO(png_bytes()), filename="photo.png", size=len(png_bytes())),
        policy=file_service.IMAGE,
        module="reports",
        uploaded_by=owner.id,
        club_id=club.id,
        slot="report_photo",
    )
    await db.commit()

    assert private.public is False
    assert (await client.get(f"/api/v1/public/files/{private.id}")).status_code == 404
    missing = "00000000-0000-4000-8000-000000000000"
    assert (await client.get(f"/api/v1/public/files/{missing}")).status_code == 404


async def test_archived_public_files_are_not_served(client, db):
    club = await make_club(db)
    row = await make_public_image(db, club)
    row.archived_at = dt.datetime.now(dt.UTC)
    await db.commit()

    assert (await client.get(f"/api/v1/public/files/{row.id}")).status_code == 404


def test_public_images_have_their_own_rate_limit_bucket():
    """導覽頁一張字卡有頭像+橫幅兩張圖:六十幾個社團首次進站是一秒內一百多個請求。

    與其餘公開端點共用 `zone=public`(60r/m、burst 30)的話,約九成直接 429、
    整片字卡牆破圖,而 429 不會被快取 —— 桶子以 1r/s 排空,使用者得重整兩分鐘。
    """
    import re
    from pathlib import Path as _Path

    conf = (_Path(__file__).resolve().parents[2] / "frontend" / "nginx.conf").read_text()
    rates = dict(re.findall(r"limit_req_zone \S+ zone=(\w+):\S+ rate=(\d+)r/m", conf))
    assert "public_files" in rates, "圖片沒有自己的限流桶"
    assert int(rates["public_files"]) > int(rates["public"])

    block = re.search(r"location \^~ /api/v1/public/files/ \{(.*?)\n    \}", conf, re.S)
    assert block, "找不到公開圖片的 location(`^~` 取最長前綴,順序無關)"
    assert "limit_req zone=public_files" in block[1]


@pytest.mark.parametrize("hide", [{"public_visible": False}, {"is_active": False}])
async def test_images_of_a_hidden_club_stop_being_served(client, db, hide):
    """形象圖是一個社團最對外的一份資料,而下架的理由常常就是那張圖。

    只問檔案自己的 `public` 旗標的話,社團 404 了但它的橫幅照樣拿得到。
    """
    club = await make_club(db)
    row = await make_public_image(db, club, slot="banner")
    url = f"/api/v1/public/files/{row.id}"
    assert (await client.get(url)).status_code == 200

    for field, value in hide.items():
        setattr(club, field, value)
    await db.commit()

    assert (await client.get(f"{URL}/{club.id}")).status_code == 404
    assert (await client.get(url)).status_code == 404  # 圖也要跟著消失


async def test_an_unreferenced_public_file_is_not_served(client, db):
    """公開通道問的是「這張圖是誰的、那個社團公不公開」,沒人引用就沒有答案。

    孤兒檔(上傳成功但綁定失敗之類)不該因為 `public` 旗標還在就送得出去。
    """
    club = await make_club(db)
    owner = await make_user(db, username="club01", club_id=club.id)
    content = png_bytes()
    row = await file_service.save_club_image(
        db,
        UploadFile(io.BytesIO(content), filename="a.png", size=len(content)),
        slot="avatar",
        uploaded_by=owner.id,
    )
    await db.commit()  # 刻意不掛到 club 上

    assert row.public is True
    assert (await client.get(f"/api/v1/public/files/{row.id}")).status_code == 404


@pytest.mark.parametrize("path", ["{}", "{}/activities"])
@pytest.mark.parametrize("club_id", ["2147483648", "99999999999999999999999999", "0", "-1"])
async def test_out_of_range_club_ids_never_reach_the_database(client, path, club_id):
    """主鍵是 int4:超界的值在 asyncpg 綁參數時 OverflowError,全域 handler 回 500
    並吐一份完整 traceback。這是匿名打得到的路徑,未登入零成本就能灌爆 log。
    """
    res = await client.get(f"{URL}/{path.format(club_id)}")
    assert res.status_code == 422, res.text


async def test_out_of_range_venue_id_is_rejected(client):
    res = await client.get(
        "/api/v1/public/bookings/availability-range",
        params={"start": "2026-03-01", "end": "2026-03-02", "venue": 2147483648},
    )
    assert res.status_code == 422, res.text


async def test_the_public_channel_only_serves_image_media_types(client, db):
    """`media_type` 取自 DB;唯一的 writer 寫 image/webp,但那是約定不是收口。

    真被改成 text/html 就會以同源 HTML 內嵌渲染 —— `default-src 'none'` 擋得下 script,
    但 CSP3 的 `form-action` 不 fallback 到 default-src,純表單釣魚頁照樣成立。
    """
    club = await make_club(db)
    row = await make_public_image(db, club)
    row.mime = "text/html"
    await db.commit()

    assert (await client.get(f"/api/v1/public/files/{row.id}")).status_code == 404


async def test_a_vanished_file_is_404_not_500(client, db):
    """check-then-open 的窗口:社團換圖的 unlink 排在 commit 之後,
    而這支是全站請求量最高的檔案端點。"""
    club = await make_club(db)
    row = await make_public_image(db, club)
    (settings.upload_dir / row.path).unlink()

    assert (await client.get(f"/api/v1/public/files/{row.id}")).status_code == 404


async def test_file_management_offers_to_download_what_anyone_can_already_fetch(client, db):
    """公開檔對全世界開著,檔案管理頁卻收起下載鈕 —— 畫面與事實相反。

    `FILE_SUBJECT_KEYS` 沒有 `club_image`,`can_download()` 因此 fail-closed,
    而同一個人打 `/files/{id}` 拿得到(`can_access` 對 public 早退)。
    """
    from app.models.enums import UserRole

    club = await make_club(db)
    row = await make_public_image(db, club)
    await make_user(db, username="admin01", role=UserRole.ADMIN, permissions=["afiles"])
    await login(client, "admin01")

    listed = (await client.get("/api/v1/admin/files")).json()["data"]
    mine = next(f for f in listed if f["original_name"] == "avatar.webp")
    assert mine["can_download"] is True
    assert (await client.get(f"/api/v1/files/{row.id}")).status_code == 200


async def test_the_directory_list_is_cacheable(client, db):
    """一份幾乎不變的主檔,全域的 no-store 會讓每次進站、每次上一頁都重查一遍。"""
    await make_club(db)
    res = await client.get(URL)
    assert "max-age" in res.headers["cache-control"]
    assert "no-store" not in res.headers["cache-control"]


async def test_activity_rows_carry_a_stable_key(client, db):
    """前端不顯示單號,但列表要一個穩定的 key —— 同日同名的兩場活動會互撞。"""
    club = await make_club(db)
    user = await make_user(db, username="club01", club_id=club.id)
    row = await make_activity(
        db,
        club,
        name="成果發表",
        status=ActivityStatus.APPROVED,
        day=dt.date(2026, 3, 1),
        created_by=user.id,
    )
    listed = (await client.get(f"{URL}/{club.id}/activities")).json()["data"]
    assert listed[0]["id"] == row.id


# ---- 結案照片(社團詳細頁的活動彈窗,D-42)----

PHOTO_URL = "/api/v1/public/files/activity-photos"
_colors = itertools.count(1)


def jpeg_bytes(size: tuple[int, int] = (64, 48), exif: Image.Exif | None = None) -> bytes:
    """每次呼叫換一個顏色:同社的結案照片有 SHA-256 唯一索引,一模一樣的位元組會撞
    (色差要拉開:JPEG 量化會把只差 1 的純色編成同一串位元組)。"""
    n = next(_colors)
    buf = io.BytesIO()
    Image.new("RGB", size, (n * 40 % 256, n * 90 % 256, 90)).save(
        buf, format="JPEG", **({"exif": exif} if exif is not None else {})
    )
    return buf.getvalue()


async def make_photo(db, activity, *, content: bytes | None = None, slot="report_photo") -> File:
    """與 `api/v1/activities.upload_photo` 同一組定位:subject=activity、slot=report_photo。"""
    data = content or jpeg_bytes()
    row = await file_service.save_upload(
        db,
        UploadFile(io.BytesIO(data), filename="p.jpg", size=len(data)),
        policy=file_service.IMAGE,
        module="reports",
        uploaded_by=activity.created_by,
        club_id=activity.club_id,
        subject_type="activity",
        subject_id=activity.id,
        slot=slot,
    )
    await db.commit()
    return row


async def activity_with_photos(db, n: int = 2, status=ActivityStatus.CLOSED):
    club = await make_club(db)
    user = await make_user(db, username="club01", club_id=club.id)
    activity = await make_activity(
        db, club, name="成果發表", status=status, day=dt.date(2026, 3, 1), created_by=user.id
    )
    return club, activity, [await make_photo(db, activity) for _ in range(n)]


@pytest.mark.parametrize(
    ("status", "public"),
    [
        (ActivityStatus.APPROVED, False),
        (ActivityStatus.CLOSING_PENDING_ADVISOR, False),
        (ActivityStatus.CLOSED, True),
    ],
)
async def test_only_closed_activities_publish_their_photos(client, db, status, public):
    """結案準備中的照片是社團還在刪換的草稿,送審中的還沒有承辦看過 —— 結案通過才公開。
    清單與通道同一條界線:拿得到 id 卻打不開,或打得開卻不在清單上,都是漏一邊。"""
    club, _, photos = await activity_with_photos(db, status=status)

    row = (await client.get(f"{URL}/{club.id}/activities")).json()["data"][0]
    assert row["photo_file_ids"] == ([str(p.id) for p in photos] if public else [])
    for p in photos:
        assert (await client.get(f"{PHOTO_URL}/{p.id}")).status_code == (200 if public else 404)


async def test_a_photo_goes_out_as_a_bounded_jpeg_without_metadata(client, db):
    """不送原檔:手機原圖動輒數 MB,EXIF 還帶拍攝座標(開發庫抽樣 300 張有 20 張)。
    COM 註解也不帶(開發庫有 72 張帶著 Discord 寫進去的 JSON);色彩描述檔留著,
    P3 的照片少了它會被當成 sRGB、整張變淡。"""
    from PIL import ImageCms

    exif = Image.Exif()
    exif[ExifTags.Base.Make] = "Apple"
    exif.get_ifd(ExifTags.IFD.GPSInfo)[ExifTags.GPS.GPSLatitude] = (25.0, 0.0, 0.0)
    icc = ImageCms.ImageCmsProfile(ImageCms.createProfile("sRGB")).tobytes()
    buf = io.BytesIO()
    Image.new("RGB", (3200, 1600), (200, 60, 90)).save(
        buf, format="JPEG", exif=exif, comment=b'{"uploader": "someone"}', icc_profile=icc
    )
    _, activity, _ = await activity_with_photos(db, n=0)
    photo = await make_photo(db, activity, content=buf.getvalue())

    res = await client.get(f"{PHOTO_URL}/{photo.id}")
    assert res.status_code == 200, res.text
    assert res.headers["content-type"] == "image/jpeg"
    # 同形象圖:瀏覽器留一小時,CDN 與 proxy 不替別人留(下架撤得回來)
    assert res.headers["cache-control"] == "private, max-age=3600"
    with Image.open(io.BytesIO(res.content)) as img:
        assert (img.format, img.size) == ("JPEG", (1600, 800))
        assert not img.getexif()
        assert "comment" not in img.info
        assert img.info.get("icc_profile") == icc


async def test_a_cache_left_by_the_old_renderer_is_not_served(client, db):
    """舊規則(v1,`.preview.jpg`)轉出的快取沒清 COM 註解:升級後照片通道不能拿它直接送,
    要照新規則重轉。"""
    _, _, photos = await activity_with_photos(db, n=1)
    stale = io.BytesIO()
    Image.new("RGB", (64, 48), (10, 200, 30)).save(
        stale, format="JPEG", comment=b'{"uploader": "x"}'
    )
    (settings.upload_dir / (photos[0].path + ".preview.jpg")).write_bytes(stale.getvalue())

    res = await client.get(f"{PHOTO_URL}/{photos[0].id}")
    assert res.status_code == 200, res.text
    with Image.open(io.BytesIO(res.content)) as img:
        assert "comment" not in img.info


async def test_an_oversized_colour_profile_is_dropped(client, db):
    """ICC 的內容 Pillow 不驗,照抄的話社團上傳的照片可以夾帶幾 MB 任意資料由公開通道送出去。"""
    buf = io.BytesIO()
    Image.new("RGB", (64, 48), (10, 200, 30)).save(
        buf, format="JPEG", icc_profile=b"x" * (file_service.PREVIEW_MAX_ICC_BYTES + 1)
    )
    _, activity, _ = await activity_with_photos(db, n=0)
    photo = await make_photo(db, activity, content=buf.getvalue())

    res = await client.get(f"{PHOTO_URL}/{photo.id}")
    assert res.status_code == 200, res.text
    with Image.open(io.BytesIO(res.content)) as img:
        assert "icc_profile" not in img.info


@pytest.mark.parametrize("hide", [{"public_visible": False}, {"is_active": False}])
async def test_photos_of_a_hidden_club_stop_being_served(client, db, hide):
    club, _, photos = await activity_with_photos(db, n=1)
    url = f"{PHOTO_URL}/{photos[0].id}"
    assert (await client.get(url)).status_code == 200

    for field, value in hide.items():
        setattr(club, field, value)
    await db.commit()
    assert (await client.get(url)).status_code == 404


async def test_only_unarchived_report_photos_go_out(client, db):
    """同一場活動的結案附件(保單、簽到表)與行政歸檔的照片都不走這條通道。"""
    club, activity, photos = await activity_with_photos(db, n=2)
    photos[1].archived_at = dt.datetime.now(dt.UTC)
    await db.commit()
    doc = await make_photo(db, activity, slot="report_doc")

    row = (await client.get(f"{URL}/{club.id}/activities")).json()["data"][0]
    assert row["photo_file_ids"] == [str(photos[0].id)]
    for f in (photos[1], doc):
        assert (await client.get(f"{PHOTO_URL}/{f.id}")).status_code == 404


async def test_club_images_do_not_go_out_through_the_photo_channel(client, db):
    club = await make_club(db)
    image = await make_public_image(db, club)
    assert (await client.get(f"{PHOTO_URL}/{image.id}")).status_code == 404


async def test_oversized_sources_are_neither_listed_nor_served(client, db, monkeypatch):
    """通道只送轉得出來的 JPEG;轉不了的來源不該在清單上列一個點下去 404 的 id。"""
    club, _, photos = await activity_with_photos(db, n=1)
    monkeypatch.setattr(file_service, "PREVIEW_MAX_SOURCE_BYTES", photos[0].size - 1)

    row = (await client.get(f"{URL}/{club.id}/activities")).json()["data"][0]
    assert row["photo_file_ids"] == []
    assert (await client.get(f"{PHOTO_URL}/{photos[0].id}")).status_code == 404


@pytest.mark.parametrize("breakage", ["missing", "corrupt", "disk_alert"])
async def test_an_unrenderable_photo_is_404_never_the_original(client, db, monkeypatch, breakage):
    """轉不出來就 404,不退回原檔 —— 那等於把 EXIF 連同座標一起送出去;也不是 500。"""
    _, _, photos = await activity_with_photos(db, n=1)
    disk = settings.upload_dir / photos[0].path
    if breakage == "missing":
        disk.unlink()
    elif breakage == "corrupt":
        disk.write_bytes(b"\xff\xd8\xff" + b"\x00" * 64)
    else:  # 告警水位不建新快取(已有的照給,見 test_files)
        monkeypatch.setattr(file_service, "disk_level", lambda usage=None: "alert")

    assert (await client.get(f"{PHOTO_URL}/{photos[0].id}")).status_code == 404


async def test_a_broken_photo_is_decoded_once_not_on_every_request(client, db, monkeypatch):
    """壞檔每次都要整張解到最後才失敗,而這條通道匿名打得到:不記住的話,
    同一張壞圖可以被拿來反覆佔住只有兩條的轉檔池(開發庫就有一張截斷的 JPEG)。"""
    _, _, photos = await activity_with_photos(db, n=1)
    (settings.upload_dir / photos[0].path).write_bytes(b"\xff\xd8\xff" + b"\x00" * 64)
    calls: list = []
    real = file_service._render_preview

    def counting(src, dst):
        calls.append(src)
        real(src, dst)

    monkeypatch.setattr(file_service, "_render_preview", counting)
    for _ in range(3):
        assert (await client.get(f"{PHOTO_URL}/{photos[0].id}")).status_code == 404
    assert len(calls) == 1


async def test_no_db_connection_is_held_while_waiting_for_the_converter(client, db, monkeypatch):
    """轉檔池只有兩條,匿名請求在那裡排隊時不該同時握著全站共用的 DB 連線 ——
    否則幾十個並發請求就把連線池借光,登入後的頁面跟著逾時。"""
    from app.core.db import engine

    _, _, photos = await activity_with_photos(db, n=1)
    await db.close()  # 測試自己的 session 也還回去,量到的才只有請求那一條
    held: list[int] = []
    real = file_service._render_preview

    def measuring(src, dst):
        held.append(engine.pool.checkedout())
        real(src, dst)

    monkeypatch.setattr(file_service, "_render_preview", measuring)
    assert (await client.get(f"{PHOTO_URL}/{photos[0].id}")).status_code == 200
    assert held == [0]


async def test_one_burst_for_one_photo_converts_it_once(client, db, monkeypatch):
    """一波並發打同一張(冷快取):後到的等同一份結果,不各自再解一次 —— 轉檔池只有兩條。"""
    import asyncio
    import time

    _, _, photos = await activity_with_photos(db, n=1)
    calls: list = []
    real = file_service._render_preview

    def slow(src, dst):
        calls.append(src)
        time.sleep(0.2)  # 讓整波請求都在第一張轉完之前抵達
        real(src, dst)

    monkeypatch.setattr(file_service, "_render_preview", slow)
    url = f"{PHOTO_URL}/{photos[0].id}"
    results = await asyncio.gather(*(client.get(url) for _ in range(5)))
    assert [r.status_code for r in results] == [200] * 5
    assert len(calls) == 1


async def test_a_failed_photo_is_retried_after_a_while(client, db, monkeypatch):
    """記住失敗是為了擋反覆解碼,不是判死到重啟:原檔修好(或暫時讀不到的錯誤過去)之後要能重試。"""
    _, _, photos = await activity_with_photos(db, n=1)
    disk = settings.upload_dir / photos[0].path
    good = disk.read_bytes()
    disk.write_bytes(b"\xff\xd8\xff" + b"\x00" * 64)
    url = f"{PHOTO_URL}/{photos[0].id}"
    assert (await client.get(url)).status_code == 404

    disk.write_bytes(good)
    assert (await client.get(url)).status_code == 404  # 還在冷卻期,不重解
    monkeypatch.setattr(file_service, "PREVIEW_RETRY_AFTER", 0)
    assert (await client.get(url)).status_code == 200


async def test_the_photo_channel_does_not_queue_past_a_short_backlog(
    client, db, monkeypatch, caplog
):
    """斷線不會取消 handler,排進去的轉檔一律跑完:從清單列舉 id 一張張打,就能排出幾分鐘
    吃滿兩顆核心的佇列。超過上限的先回 404,但不記成失敗 —— 空下來之後同一張照常轉。"""
    import asyncio
    import threading

    from app.api.v1 import public

    monkeypatch.setattr(public, "PUBLIC_PREVIEW_BACKLOG", 2)
    monkeypatch.setattr(file_service, "_backlog_warned_at", float("-inf"))
    _, _, photos = await activity_with_photos(db, n=3)
    release = threading.Event()
    real = file_service._render_preview

    def stuck(src, dst):
        release.wait(10)
        real(src, dst)

    monkeypatch.setattr(file_service, "_render_preview", stuck)
    queued = [asyncio.ensure_future(client.get(f"{PHOTO_URL}/{p.id}")) for p in photos[:2]]
    try:
        for _ in range(100):
            if len(file_service._PREVIEW_INFLIGHT) == 2:
                break
            await asyncio.sleep(0.02)
        assert (await client.get(f"{PHOTO_URL}/{photos[2].id}")).status_code == 404
        assert (await client.get(f"{PHOTO_URL}/{photos[2].id}")).status_code == 404
        # 拒絕對外跟壞檔一樣是 404:log 要看得出是排隊滿了,而且被灌時不跟著灌
        full = [r for r in caplog.records if "preview backlog full" in r.getMessage()]
        assert len(full) == 1
    finally:
        release.set()
    assert [r.status_code for r in await asyncio.gather(*queued)] == [200, 200]
    assert (await client.get(f"{PHOTO_URL}/{photos[2].id}")).status_code == 200
