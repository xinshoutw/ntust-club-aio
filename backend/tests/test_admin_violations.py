"""違規勸導管理:銷案期限(開立日 +1 個月)推導、逾期截止、列表排序/過濾。"""

from datetime import date, timedelta

import sqlalchemy as sa

from app.models import AuditLog, Violation
from app.services.violation_service import resolve_deadline, resolve_expired
from tests.conftest import csrf_headers, login, make_club, make_user


async def seed(client, db):
    club = await make_club(db)
    other = await make_club(db, name="吉他社")
    staff = await make_user(db, username="staff01", role="staff", name="李工讀")
    staff2 = await make_user(db, username="staff02", role="staff", name="陳工讀")
    await make_user(db, username="violadmin", role="admin", permissions=["aviol"])
    await login(client, "violadmin")

    rows = [
        # 未銷案、已逾期(3 月開立)
        Violation(
            club_id=club.id, occurred_on=date(2026, 3, 1), location="操場",
            items=["未經申請使用場地"], filler_id=staff.id,
        ),
        # 未銷案、未逾期(近 10 天)
        Violation(
            club_id=other.id, occurred_on=date.today() - timedelta(days=10), location="社辦 S312",
            items=["噪音影響他人"], filler_id=staff2.id,
        ),
        # 已銷案
        Violation(
            club_id=club.id, occurred_on=date(2026, 2, 1), location="活動中心",
            items=["張貼未核可文宣"], filler_id=staff.id, status="resolved", resolve_note="已改善",
        ),
    ]
    db.add_all(rows)
    await db.commit()
    for row in rows:
        await db.refresh(row)
    return club, other, staff, rows


def test_deadline_boundary_unit():
    """期限=開立日+1 個月;期限當天仍可銷案,隔日起截止。"""
    v = Violation(occurred_on=date(2026, 6, 16), status="open")
    assert resolve_deadline(v) == date(2026, 7, 16)
    assert resolve_expired(v, today=date(2026, 7, 16)) is False  # 期限當天可銷案
    assert resolve_expired(v, today=date(2026, 7, 17)) is True
    # 月底收斂:1/31 開立 → 期限 2/28
    v2 = Violation(occurred_on=date(2026, 1, 31), status="open")
    assert resolve_deadline(v2) == date(2026, 2, 28)


async def test_list_default_order_sort_and_filters(client, db):
    club, other, staff, rows = await seed(client, db)

    data = (await client.get("/api/v1/admin/violations")).json()["data"]
    # 預設:未銷案在前(時間升冪),已銷案在後
    assert [d["status"] for d in data] == ["open", "open", "resolved"]
    assert data[0]["occurred_on"] == "2026-03-01"
    assert data[0]["resolve_deadline"] == "2026-04-01"
    assert data[0]["resolve_expired"] is True
    assert data[1]["resolve_expired"] is False
    assert data[0]["club_name"] == "熱舞社"
    assert data[0]["filler_name"] == "李工讀"

    # 排序白名單
    resp = await client.get("/api/v1/admin/violations", params={"sort": "-date"})
    dates = [d["occurred_on"] for d in resp.json()["data"]]
    assert dates == sorted(dates, reverse=True)
    assert (
        await client.get("/api/v1/admin/violations", params={"sort": "hack"})
    ).status_code == 422
    for key in ("location", "items", "filler", "deadline", "status"):
        assert (
            await client.get("/api/v1/admin/violations", params={"sort": key})
        ).status_code == 200

    # 過濾:狀態/項目/填寫人/期限/社團
    resp = await client.get("/api/v1/admin/violations", params={"status": "resolved"})
    assert [d["location"] for d in resp.json()["data"]] == ["活動中心"]
    resp = await client.get("/api/v1/admin/violations", params={"item": "噪音影響他人"})
    assert [d["club_name"] for d in resp.json()["data"]] == ["吉他社"]
    resp = await client.get("/api/v1/admin/violations", params={"filler_id": staff.id})
    assert all(d["filler_name"] == "李工讀" for d in resp.json()["data"])
    resp = await client.get("/api/v1/admin/violations", params={"expired": "true"})
    assert [d["occurred_on"] for d in resp.json()["data"]] == ["2026-03-01"]
    resp = await client.get("/api/v1/admin/violations", params={"expired": "false"})
    assert [d["status"] for d in resp.json()["data"]] == ["open"]
    assert resp.json()["data"][0]["resolve_expired"] is False


async def test_resolve_within_deadline_and_reject_expired(client, db):
    club, other, staff, rows = await seed(client, db)
    expired_row, active_row, resolved_row = rows

    # 未逾期 → 銷案成功 + 稽核
    resp = await client.post(
        f"/api/v1/admin/violations/{active_row.id}/resolve",
        json={"note": "已完成愛校服務 2 小時"},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["status"] == "resolved"
    assert resp.json()["data"]["resolve_note"] == "已完成愛校服務 2 小時"
    audit_count = await db.scalar(
        sa.select(sa.func.count()).where(AuditLog.action == "violation_resolved")
    )
    assert audit_count == 1

    # 已逾期 → 拒絕(截止,−1 扣分成立)
    resp = await client.post(
        f"/api/v1/admin/violations/{expired_row.id}/resolve",
        json={"note": "x"},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 409
    assert resp.json()["meta"]["code"] == "RESOLVE_EXPIRED"

    # 已銷案 → 409
    resp = await client.post(
        f"/api/v1/admin/violations/{resolved_row.id}/resolve",
        json={"note": "x"},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 409

    # 權限:無 aviol 的管理員 → 403
    await make_user(db, username="other-admin", role="admin", permissions=["aact"])
    await login(client, "other-admin")
    assert (await client.get("/api/v1/admin/violations")).status_code == 403
