"""器材主檔維護(/admin/equipment,僅 super;2026-07-17)。"""

import sqlalchemy as sa

from app.models import Equipment
from tests.conftest import csrf_headers, login, make_user

URL = "/api/v1/admin/equipment"


async def seed(client, db):
    await make_user(db, username="root", role="admin", is_super=True)
    await make_user(db, username="normal", role="admin", permissions=["aroom"])
    db.add_all(
        [
            Equipment(name="帳篷", total_qty=6, needs_serial=True, sort=1),
            Equipment(name="摺疊桌", total_qty=25, sort=2),
        ]
    )
    await db.commit()
    await login(client, "root")


async def test_super_only(client, db):
    await seed(client, db)
    await login(client, "normal")
    assert (await client.get(URL)).status_code == 403
    assert (await client.post(URL, json={}, headers=csrf_headers(client))).status_code == 403


async def test_list_and_update_quantity(client, db):
    await seed(client, db)
    rows = (await client.get(URL)).json()["data"]
    assert [r["name"] for r in rows] == ["帳篷", "摺疊桌"]
    tent = rows[0]

    # 調整數量與點交方式(一般↔依序點交=needs_serial)
    resp = await client.patch(
        f"{URL}/{tent['id']}",
        json={"total_qty": 8, "needs_serial": False},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["total_qty"] == 8
    assert resp.json()["data"]["needs_serial"] is False
    stored = await db.get(Equipment, tent["id"])
    assert stored.total_qty == 8 and stored.needs_serial is False


async def test_create_and_dedup_name(client, db):
    await seed(client, db)
    resp = await client.post(
        URL,
        json={"name": "椅子", "total_qty": 80, "needs_serial": False},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["data"]["name"] == "椅子"

    # 同名 → 409
    resp = await client.post(
        URL, json={"name": "椅子", "total_qty": 5}, headers=csrf_headers(client)
    )
    assert resp.status_code == 409

    # 空白名稱 → 422
    resp = await client.post(
        URL, json={"name": "  ", "total_qty": 5}, headers=csrf_headers(client)
    )
    assert resp.status_code == 422


async def test_deactivate(client, db):
    await seed(client, db)
    eid = (await client.get(URL)).json()["data"][0]["id"]
    resp = await client.patch(
        f"{URL}/{eid}", json={"is_active": False}, headers=csrf_headers(client)
    )
    assert resp.status_code == 200
    assert resp.json()["data"]["is_active"] is False
    # 停用不刪列(既有借用外鍵保留)
    assert await db.scalar(sa.select(sa.func.count()).select_from(Equipment)) == 2
