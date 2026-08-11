"""場地主檔維護(/admin/venues,僅 super;形狀比照器材主檔)。"""

import sqlalchemy as sa

from app.models import Venue
from app.models.enums import VenueCategory
from tests.conftest import csrf_headers, login, make_user

URL = "/api/v1/admin/venues"


async def seed(client, db):
    await make_user(db, username="root", role="admin", is_super=True)
    await make_user(db, username="normal", role="admin", permissions=["aroom"])
    db.add_all(
        [
            Venue(name="S304 音樂教室", capacity=40, category=VenueCategory.CLASSROOM,
                  allow_fixed=True, sort=1),
            Venue(name="第一活動中心廣場", capacity=300, category=VenueCategory.OUTDOOR,
                  allow_temp=True, sort=2),
        ]
    )
    await db.commit()
    await login(client, "root")


async def test_writes_are_super_only(client, db):
    """列表另供場況圖取列首,權限維持 abooking;新增/修改主檔限 super。"""
    await seed(client, db)
    await make_user(db, username="booking", role="admin", permissions=["abooking"])
    await login(client, "booking")
    assert (await client.get(URL)).status_code == 200
    assert (await client.post(URL, json={}, headers=csrf_headers(client))).status_code == 403

    await login(client, "normal")  # 只有 aroom
    assert (await client.get(URL)).status_code == 403


async def test_update_is_super_only_and_rejects_explicit_nulls(client, db):
    """PATCH 的門檻與 POST 一樣是 super;必填欄位帶顯式 null 是無效輸入,不是 500。"""
    await seed(client, db)
    vid = (await client.get(URL)).json()["data"][0]["id"]

    await make_user(db, username="booking", role="admin", permissions=["abooking"])
    await login(client, "booking")
    resp = await client.patch(f"{URL}/{vid}", json={"capacity": 1}, headers=csrf_headers(client))
    assert resp.status_code == 403
    # 已停用的場地只有主檔維護視角需要,那頁限 super
    assert (await client.get(URL, params={"include_inactive": "true"})).status_code == 403

    await login(client, "root")
    for field in ("name", "category", "allow_fixed", "is_active"):
        resp = await client.patch(
            f"{URL}/{vid}", json={field: None}, headers=csrf_headers(client)
        )
        assert resp.status_code == 422, f"{field}: {resp.status_code}"
    # 容納人數是唯一可清空的欄位
    resp = await client.patch(f"{URL}/{vid}", json={"capacity": None}, headers=csrf_headers(client))
    assert resp.status_code == 200
    assert resp.json()["data"]["capacity"] is None


async def test_create_requires_a_booking_mode(client, db):
    """兩種借用型態都不開放的場地兩邊下拉都不出現,只會在場況圖上多一列死列。"""
    await seed(client, db)
    resp = await client.post(
        URL, json={"name": "無型態場地", "category": "教室"}, headers=csrf_headers(client)
    )
    assert resp.status_code == 422


async def test_list_and_update(client, db):
    await seed(client, db)
    rows = (await client.get(URL)).json()["data"]
    assert [r["name"] for r in rows] == ["S304 音樂教室", "第一活動中心廣場"]
    room = rows[0]
    assert room["allow_fixed"] is True and room["is_active"] is True

    resp = await client.patch(
        f"{URL}/{room['id']}",
        json={"capacity": 45, "allow_temp": True},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["capacity"] == 45
    stored = await db.get(Venue, room["id"])
    assert stored.capacity == 45 and stored.allow_temp is True


async def test_create_and_dedup_name(client, db):
    await seed(client, db)
    body = {"name": "研討室 A", "capacity": 20, "category": "教室", "allow_fixed": True}
    resp = await client.post(URL, json=body, headers=csrf_headers(client))
    assert resp.status_code == 201, resp.text
    assert resp.json()["data"]["name"] == "研討室 A"

    assert (await client.post(URL, json=body, headers=csrf_headers(client))).status_code == 409
    resp = await client.post(
        URL, json={**body, "name": "  "}, headers=csrf_headers(client)
    )
    assert resp.status_code == 422
    # 未知類別 → 422(類別是列舉,不是自由文字)
    resp = await client.post(
        URL, json={**body, "name": "研討室 B", "category": "不存在"}, headers=csrf_headers(client)
    )
    assert resp.status_code == 422


async def test_deactivate_keeps_the_row(client, db):
    """停用不刪列:既有借用單與不開放規則的外鍵要留著,但預設清單不再列出。"""
    await seed(client, db)
    vid = (await client.get(URL)).json()["data"][0]["id"]
    resp = await client.patch(
        f"{URL}/{vid}", json={"is_active": False}, headers=csrf_headers(client)
    )
    assert resp.status_code == 200
    assert resp.json()["data"]["is_active"] is False
    assert await db.scalar(sa.select(sa.func.count()).select_from(Venue)) == 2

    # 主檔維護視角看得到停用的,預設清單(場況圖用)看不到
    assert len((await client.get(URL, params={"include_inactive": "true"})).json()["data"]) == 2
    assert [v["name"] for v in (await client.get(URL)).json()["data"]] == ["第一活動中心廣場"]