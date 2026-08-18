"""行政端頁面權限:一頁一鍵,沒有 super 專屬頁(decisions.md D-01)。

改成鍵控之前這五頁只有 super 進得去,而既有測試全用 super 帳號跑 —— super 一律全通,
所以拿掉閘門也不會紅。這支測試一律用「只持一把鍵」的帳號,才擋得住漏接。
"""

import pytest

from app.core import permissions
from tests.conftest import csrf_headers, login, make_user

# 原本僅 super 可達的頁面:各自的讀取端點 → 現在的權限鍵
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


async def test_non_super_may_revoke_a_permission_it_lacks(client, db):
    await make_user(db, username="granter2", role="admin", permissions=["aaccount"])
    target = await make_user(db, username="target2", role="admin", permissions=["asetting"])
    await login(client, "granter2")

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
