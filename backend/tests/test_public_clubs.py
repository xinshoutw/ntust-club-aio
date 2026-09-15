"""免登入的社團導覽端點:誰看得到、看得到什麼、看不到什麼。

這是整個系統唯一對匿名開放的社團資料面,所以「不該回什麼」與「該回什麼」一樣重要。
"""

import datetime as dt
import io

import pytest
from fastapi import UploadFile
from PIL import Image

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
        content="內部核銷用的活動內容",
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


async def test_clubs_with_a_banner_come_first(client, db):
    await make_club(db, name="吉他社")  # 無橫幅,名稱在前
    with_banner = await make_club(db, name="熱舞社")
    owner = await make_user(db, username="club01", club_id=with_banner.id)
    row = await file_service.save_club_image(
        db,
        UploadFile(io.BytesIO(png_bytes()), filename="b.png", size=len(png_bytes())),
        slot="banner",
        uploaded_by=owner.id,
    )
    with_banner.banner_file_id = row.id
    await db.commit()

    names = [c["name"] for c in (await client.get(URL)).json()["data"]]
    assert names == ["熱舞社", "吉他社"]


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


async def test_activity_rows_carry_no_content_or_money(client, db):
    club = await make_club(db)
    user = await make_user(db, username="club01", club_id=club.id)
    await make_activity(
        db,
        club,
        name="成果發表",
        status=ActivityStatus.CLOSED,
        day=dt.date(2026, 3, 1),
        created_by=user.id,
    )

    row = (await client.get(f"{URL}/{club.id}/activities")).json()["data"][0]
    assert row["name"] == "成果發表"
    assert row["location"] == "體育館"
    # 公開頁回答的是「這個社團在辦什麼」,不是「這張單裡寫了什麼」
    for field in ("content", "school_approved", "admin_note", "fund_source", "status"):
        assert field not in row


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
