"""政府行事曆假日的後台維護(/admin/holidays,權限鍵 asetting)。

假日只有一個用途:器材逾期的「結束日之隔天上班日」判定,所以測到那條推導為止。
"""

from datetime import date

import sqlalchemy as sa

from app.models import AuditLog, Holiday
from app.services.booking_service import next_workday
from tests.conftest import csrf_headers, login, make_user

URL = "/api/v1/admin/holidays"


async def seed(client, db):
    await make_user(db, username="root", role="admin", is_super=True)
    await make_user(db, username="normal", role="admin", permissions=["aviol"])
    await login(client, "root")


async def test_requires_setting_permission(client, db):
    await seed(client, db)
    await login(client, "normal")
    assert (await client.get(URL)).status_code == 403
    resp = await client.post(
        URL, json={"date": "2026-03-09", "name": "補假"}, headers=csrf_headers(client)
    )
    assert resp.status_code == 403
    resp = await client.delete(f"{URL}/2026-03-09", headers=csrf_headers(client))
    assert resp.status_code == 403


async def test_add_shifts_the_overdue_deadline(client, db):
    """新增的假日必須立刻改變逾期判定 —— 這張表只為了這件事存在。"""
    await seed(client, db)
    # 2026-03-06 週五 → 原本隔天上班日是週一 03-09
    assert await next_workday(db, date(2026, 3, 6)) == date(2026, 3, 9)

    resp = await client.post(
        URL, json={"date": "2026-03-09", "name": "颱風假"}, headers=csrf_headers(client)
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["data"] == {"date": "2026-03-09", "name": "颱風假"}

    db.expire_all()  # 端點在另一條 session commit,本測試的 session 要重讀
    assert await next_workday(db, date(2026, 3, 6)) == date(2026, 3, 10)

    listing = (await client.get(URL)).json()["data"]
    assert listing == [{"date": "2026-03-09", "name": "颱風假"}]

    audit_row = await db.scalar(sa.select(AuditLog).where(AuditLog.action == "holiday_created"))
    assert audit_row is not None and "2026-03-09" in audit_row.detail


async def test_same_day_again_renames_instead_of_conflicting(client, db):
    await seed(client, db)
    for name in ("暫定", "和平紀念日"):
        resp = await client.post(
            URL, json={"date": "2026-02-27", "name": name}, headers=csrf_headers(client)
        )
        assert resp.status_code == 201, resp.text
    rows = (await client.get(URL)).json()["data"]
    assert rows == [{"date": "2026-02-27", "name": "和平紀念日"}]

    # 改名記的是改前改後:只記新名字的話,事後查「誰把那天改掉的」還是得靠人記憶
    audit_row = await db.scalar(sa.select(AuditLog).where(AuditLog.action == "holiday_updated"))
    assert audit_row is not None
    assert "暫定→和平紀念日" in audit_row.detail


async def test_weekend_is_rejected(client, db):
    """週末已被 add_workdays 排除,登記進來只會把表撐大。"""
    await seed(client, db)
    resp = await client.post(
        URL, json={"date": "2026-03-07", "name": "週六"}, headers=csrf_headers(client)
    )
    assert resp.status_code == 422


async def test_name_must_not_be_blank(client, db):
    """前端 trim 過,但後端 fail-open 的話一枚只剩 X 的空白 Tag 就進表了。"""
    await seed(client, db)
    resp = await client.post(
        URL, json={"date": "2026-03-09", "name": "   "}, headers=csrf_headers(client)
    )
    assert resp.status_code == 422


async def test_weekend_rows_already_in_the_table_still_read_and_delete(client, db):
    """輸出不沿用輸入的限制:腳本或手改 DB 塞進來的週末列,不能一讀就 500、也要刪得掉。"""
    await seed(client, db)
    db.add(Holiday(date=date(2026, 3, 7), name="舊資料"))  # 週六:POST 進不來,但表裡可能有
    await db.commit()

    listing = await client.get(URL)
    assert listing.status_code == 200, listing.text
    assert {"date": "2026-03-07", "name": "舊資料"} in listing.json()["data"]

    resp = await client.delete(f"{URL}/2026-03-07", headers=csrf_headers(client))
    assert resp.status_code == 200, resp.text


async def test_delete_and_missing_day(client, db):
    await seed(client, db)
    db.add(Holiday(date=date(2026, 4, 6), name="兒童節補假"))
    await db.commit()

    resp = await client.delete(f"{URL}/2026-04-06", headers=csrf_headers(client))
    assert resp.status_code == 200, resp.text
    assert (await client.get(URL)).json()["data"] == []
    assert await db.scalar(sa.select(sa.func.count()).select_from(Holiday)) == 0

    resp = await client.delete(f"{URL}/2026-04-06", headers=csrf_headers(client))
    assert resp.status_code == 404
