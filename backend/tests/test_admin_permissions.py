"""行政端頁面權限:一頁一鍵,沒有 super 專屬頁(decisions.md D-01)。

改成鍵控之前這五頁只有 super 進得去,而既有測試全用 super 帳號跑 —— super 一律全通,
所以拿掉閘門也不會紅。這支測試一律用「只持一把鍵」的帳號,才擋得住漏接。
"""

import pytest

from app.core import permissions
from tests.conftest import csrf_headers, login, make_user

# 每頁「持該頁的鍵就必須讀得到」的端點,取自各頁 spec 的「資料來源」表。
#
# 只驗頁面本身的入口是不夠的:第一版就只列了五支剛好有 GET 的端點,結果
# amanual / arule / aoverdue / asetting 四頁「門開得了、門後一片空白」全部測不到 ——
# 那幾頁真正的資料來源(/admin/venues、/admin/equipment-loans、/admin/clubs)
# 還綁在 abooking 或 is_super 上。新增行政頁時請把該頁 spec 列的每一支 GET 都加進來。
PAGE_READS: list[tuple[str, str]] = [
    ("areview", "/api/v1/admin/activities?status=pending_advisor"),
    ("aclose", "/api/v1/admin/activities?status=closing_pending_advisor"),
    ("aactivity", "/api/v1/admin/activities"),
    ("aactivity", "/api/v1/admin/activities/semesters"),
    ("aclubact", "/api/v1/admin/activities"),
    ("aclubact", "/api/v1/admin/activities/semesters"),
    ("aclubact", "/api/v1/admin/clubs/options"),
    ("asignup", "/api/v1/admin/signup-items"),
    ("aannounce", "/api/v1/admin/announcements"),
    ("aannounce", "/api/v1/admin/clubs/options"),
    ("abooking", "/api/v1/admin/venue-bookings"),
    ("abooking", "/api/v1/admin/equipment-loans"),
    ("abooking", "/api/v1/admin/venues"),
    ("aroom", "/api/v1/admin/room-bookings"),
    ("amanual", "/api/v1/admin/venues"),
    ("amanual", "/api/v1/admin/equipment"),
    ("arule", "/api/v1/admin/venues"),
    ("arule", "/api/v1/admin/venue-rules"),
    ("aclub", "/api/v1/admin/clubs/options"),
    ("amember", "/api/v1/admin/clubs/options"),
    ("aoverdue", "/api/v1/admin/equipment-loans?status=overdue"),
    ("aoverdue", "/api/v1/admin/clubs"),
    ("aeval", "/api/v1/admin/eval/clubs"),
    ("aaccount", "/api/v1/admin/accounts"),
    ("aaccount", "/api/v1/admin/clubs"),
    ("acert", "/api/v1/admin/officer-certificates"),
    ("apostal", "/api/v1/admin/postal-changes"),
    ("amaint", "/api/v1/admin/maintenance"),
    ("aviol", "/api/v1/admin/violations"),
    ("afiles", "/api/v1/admin/files"),
    ("asetting", "/api/v1/admin/settings"),
    ("asetting", "/api/v1/admin/venues?include_inactive=true"),
    ("asetting", "/api/v1/admin/equipment"),
    ("aaudit", "/api/v1/admin/audit"),
]


@pytest.mark.parametrize(("key", "url"), PAGE_READS)
async def test_page_key_reads_everything_that_page_needs(client, db, key, url):
    """持一把鍵就要讀得到該頁的全部資料;開得了門卻拿不到資料等於那把鍵沒用。"""
    await make_user(db, username="holder", role="admin", permissions=[key])
    await login(client, "holder")
    assert (await client.get(url)).status_code == 200, f"{key} → {url}"


# 原本僅 super 可達的頁面:換成鍵控之後,別頁的鍵一律進不來
FORMERLY_SUPER = [
    ("/api/v1/admin/accounts", "aaccount"),
    ("/api/v1/admin/audit", "aaudit"),
    ("/api/v1/admin/equipment", "asetting"),
    ("/api/v1/admin/venue-rules", "arule"),
    ("/api/v1/admin/settings", "asetting"),
]


@pytest.mark.parametrize(("url", "key"), FORMERLY_SUPER)
async def test_page_key_opens_only_its_own_page(client, db, url, key):
    await make_user(db, username="holder", role="admin", permissions=[key])
    await make_user(db, username="stranger", role="admin", permissions=["aviol"])

    await login(client, "holder")
    assert (await client.get(url)).status_code == 200, url

    # 持別頁的鍵進不來 —— 若閘門被拿掉,這行才會紅
    await login(client, "stranger")
    assert (await client.get(url)).status_code == 403, url


async def test_catalogue_covers_every_key_the_whitelist_accepts():
    """權限白名單只由目錄表 + 簽核關卡鍵組成,不得有第三來源。"""
    from app.schemas.accounts import PERMISSION_KEYS

    assert PERMISSION_KEYS == permissions.PAGE_KEYS | permissions.STAGE_KEYS
    # 目錄表的鍵與路徑都不重複
    keys = [p.key for p in permissions.ADMIN_PAGES]
    paths = [q for p in permissions.ADMIN_PAGES for q in p.paths]
    assert len(set(keys)) == len(keys)
    assert len(set(paths)) == len(paths)


async def test_me_carries_the_catalogue_for_admins_only(client, db):
    await make_user(db, username="anadmin", role="admin", permissions=["aviol"])
    await make_user(db, username="apt", role="staff")

    await login(client, "anadmin")
    data = (await client.get("/api/v1/auth/me")).json()["data"]
    assert [p["key"] for p in data["admin_pages"]] == [p.key for p in permissions.ADMIN_PAGES]

    await login(client, "apt")
    assert (await client.get("/api/v1/auth/me")).json()["data"]["admin_pages"] is None


# ---- 授權委派:帳號管理本身也是一把可授的鍵,少了這條就等於發放最高權限 ----


async def test_non_super_cannot_grant_a_permission_it_lacks(client, db):
    granter = await make_user(
        db, username="granter", role="admin", permissions=["aaccount", "aviol"]
    )
    target = await make_user(db, username="target", role="admin", permissions=[])
    await login(client, "granter")

    # 自己沒有 asetting,就不能給出去
    resp = await client.put(
        f"/api/v1/admin/accounts/{target.id}/permissions",
        json={"permissions": ["asetting"]},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 403, resp.text
    assert resp.json()["meta"]["code"] == "PERMISSION_NOT_GRANTABLE"

    # 自己有的就給得出去
    resp = await client.put(
        f"/api/v1/admin/accounts/{target.id}/permissions",
        json={"permissions": ["aviol"]},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["permissions"] == ["aviol"]

    # 建立帳號那條路也擋
    resp = await client.post(
        "/api/v1/admin/accounts",
        json={
            "role": "admin",
            "username": "newbie",
            "name": "新人",
            "permissions": ["asetting"],
        },
        headers=csrf_headers(client),
    )
    assert resp.status_code == 403, resp.text

    assert granter.is_super is False


async def test_non_super_cannot_strip_an_account_that_outranks_it(client, db):
    """收回不需要自己持有,但「清空同儕權限」正是接管的第一步。

    清完之後對方就不再持有 actor 沒有的鍵,`_guard_target` 對重設密碼變成恆真 ——
    拿一次性密碼登入即取得對方身分。設定權限因此與刪除/停用/重設密碼同一條位階檢查。
    """
    await make_user(db, username="granter2", role="admin", permissions=["aaccount"])
    target = await make_user(db, username="target2", role="admin", permissions=["asetting"])
    await login(client, "granter2")

    resp = await client.put(
        f"/api/v1/admin/accounts/{target.id}/permissions",
        json={"permissions": []},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 403, resp.text
    assert resp.json()["meta"]["code"] == "TARGET_OUTRANKS_ACTOR"


async def test_non_super_may_revoke_a_permission_it_also_holds(client, db):
    """位階相當就管得動:對方持有的鍵 actor 全都有,收回不必額外授權。"""
    await make_user(db, username="granter3", role="admin", permissions=["aaccount", "asetting"])
    target = await make_user(db, username="target3", role="admin", permissions=["asetting"])
    await login(client, "granter3")

    resp = await client.put(
        f"/api/v1/admin/accounts/{target.id}/permissions",
        json={"permissions": []},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["permissions"] == []


async def test_cannot_take_over_an_account_that_outranks_you(client, db):
    """重設密碼是繞過授權檢查最短的路:拿到一次性密碼登入,就取得對方全部權限。"""
    from app.models.enums import UserRole

    await make_user(db, username="granter3", role="admin", permissions=["aaccount"])
    boss = await make_user(db, username="boss", role="admin", is_super=True)
    peer = await make_user(db, username="peer", role="admin", permissions=["asetting"])
    plain = await make_user(db, username="plain", role="admin", permissions=[])
    await login(client, "granter3")

    for target, why in ((boss, "super"), (peer, "持有我沒有的鍵")):
        for path, method in (
            (f"/api/v1/admin/accounts/{target.id}/reset-password", "post"),
            (f"/api/v1/admin/accounts/{target.id}", "delete"),
        ):
            resp = await getattr(client, method)(path, headers=csrf_headers(client))
            assert resp.status_code in (403, 409), f"{why} {path}: {resp.text}"

    # 停用同樣擋掉:能停掉制衡自己的人也是一種提權
    resp = await client.put(
        f"/api/v1/admin/accounts/{peer.id}/active",
        json={"is_active": False},
        headers=csrf_headers(client),
    )
    assert resp.status_code in (403, 409), resp.text

    # 權限沒有超過自己的帳號照常管得動
    resp = await client.post(
        f"/api/v1/admin/accounts/{plain.id}/reset-password", headers=csrf_headers(client)
    )
    assert resp.status_code == 200, resp.text
    assert plain.role is UserRole.ADMIN


# ---- 檔案下載:看得到那一頁 = 下載得了那一頁的檔案(decisions.md D-02)----


@pytest.mark.parametrize(
    ("subject", "allowed", "denied"),
    [
        ("postal_change", "apostal", "acert"),
        ("eval_upload", "aeval", "afiles"),
        ("maintenance", "amaint", "apostal"),
        ("activity", "aclose", "amaint"),
    ],
)
def test_file_download_follows_the_page_that_shows_it(subject, allowed, denied):
    assert permissions.can_download(subject, [allowed]) is True
    assert permissions.can_download(subject, [denied]) is False


def test_file_management_alone_downloads_nothing():
    """檔案管理頁是「看磁碟怎麼被吃掉」,不是取得內容 —— 正是 ISS-23 的原始抱怨。"""
    for subject in permissions.FILE_SUBJECT_KEYS:
        assert permissions.can_download(subject, ["afiles"]) is False


def test_unclassified_files_are_fail_closed():
    """`subject_type` 認不得的檔案只有 super 下載得到,不落到「開放給所有管理員」。"""
    assert permissions.can_download(None, ["afiles", "aeval", "apostal"]) is False
    assert permissions.can_download("something_new", ["aeval"]) is False


async def test_the_full_takeover_path_is_closed(client, db):
    """清權限 → 重設密碼 → 登入:三步各自看起來合理,串起來就是接管。"""
    await make_user(db, username="actor9", role="admin", permissions=["aaccount"])
    peer = await make_user(
        db, username="peer9", role="admin", permissions=["asetting", "approve_dean"]
    )
    await login(client, "actor9")

    # 第一步就要擋下來 —— 少了它,後面兩步都會變成合法操作
    strip = await client.put(
        f"/api/v1/admin/accounts/{peer.id}/permissions",
        json={"permissions": []},
        headers=csrf_headers(client),
    )
    assert strip.status_code == 403

    reset = await client.post(
        f"/api/v1/admin/accounts/{peer.id}/reset-password", headers=csrf_headers(client)
    )
    assert reset.status_code == 403
    await db.refresh(peer)
    assert peer.permissions == ["asetting", "approve_dean"]


async def test_every_grantable_key_fits_in_one_request(client, db):
    """彈窗會把目錄整個列出來,全勾就是使用者做得到的操作 —— 上限不能比目錄小。"""
    from app.core.permissions import PERMISSION_KEYS

    await make_user(db, username="root9", role="admin", is_super=True)
    target = await make_user(db, username="tgt9", role="admin")
    await db.commit()
    await login(client, "root9")

    resp = await client.put(
        f"/api/v1/admin/accounts/{target.id}/permissions",
        json={"permissions": sorted(PERMISSION_KEYS)},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 200, resp.text
    assert len(resp.json()["data"]["permissions"]) == len(PERMISSION_KEYS)
