"""維修管理(列表排序 + 狀態流轉)與稽核軌跡列表(篩選)。"""

from datetime import UTC, datetime, timedelta

import sqlalchemy as sa

from app.core.semesters import TAIPEI
from app.models import AuditLog, MaintenanceRequest
from tests.conftest import csrf_headers, login, make_club, make_user

# ---- 維修管理 ----


async def seed_maintenance(client, db):
    club = await make_club(db)
    other = await make_club(db, name="美術社")
    await make_user(db, username="maintadmin", role="admin", permissions=["amaint"])
    await login(client, "maintadmin")

    rows = [
        MaintenanceRequest(club_id=club.id, location="S304 音樂教室", items="天花板漏水",
                           status="in_progress"),
        MaintenanceRequest(club_id=other.id, location="社辦 S207", items="窗戶卡死"),
        MaintenanceRequest(club_id=club.id, location="社辦 S312", items="門鎖損壞", status="done"),
        MaintenanceRequest(club_id=club.id, location="練團室", items="隔音棉脫落"),
    ]
    db.add_all(rows)
    await db.commit()
    # 錯開申請日:讓「組內申請日升冪」可驗證(練團室早於 S207)
    base = datetime.now(UTC)
    await db.execute(
        sa.update(MaintenanceRequest)
        .where(MaintenanceRequest.location == "練團室")
        .values(created_at=base - timedelta(days=5))
    )
    await db.execute(
        sa.update(MaintenanceRequest)
        .where(MaintenanceRequest.location == "社辦 S207")
        .values(created_at=base - timedelta(days=1))
    )
    await db.commit()
    return rows


async def test_maintenance_default_order_and_sort(client, db):
    await seed_maintenance(client, db)

    data = (await client.get("/api/v1/admin/maintenance")).json()["data"]
    # 預設:待處理 → 處理中 → 已完成;組內申請日升冪
    assert [d["status"] for d in data] == ["pending", "pending", "in_progress", "done"]
    assert [d["location"] for d in data[:2]] == ["練團室", "社辦 S207"]
    assert data[0]["club_name"] == "熱舞社"

    resp = await client.get("/api/v1/admin/maintenance", params={"sort": "location"})
    locations = [d["location"] for d in resp.json()["data"]]
    assert locations == sorted(locations)
    resp = await client.get("/api/v1/admin/maintenance", params={"sort": "-created_at"})
    assert resp.status_code == 200
    assert (
        await client.get("/api/v1/admin/maintenance", params={"sort": "items"})
    ).status_code == 422

    resp = await client.get("/api/v1/admin/maintenance", params={"status": "done"})
    assert [d["location"] for d in resp.json()["data"]] == ["社辦 S312"]


async def test_maintenance_status_transitions(client, db):
    """狀態機:待處理 → 處理中 → 已完成(僅單步前進);audit + notify。"""
    rows = await seed_maintenance(client, db)
    in_progress, pending, done, _ = rows

    # 待處理 → 處理中(可附處理備註)
    resp = await client.post(
        f"/api/v1/admin/maintenance/{pending.id}/status",
        json={"status": "in_progress", "handle_note": "已通知廠商報價"},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()["data"]
    assert data["status"] == "in_progress"
    assert data["handle_note"] == "已通知廠商報價"
    assert data["club_name"] == "美術社"

    # 處理中 → 已完成
    resp = await client.post(
        f"/api/v1/admin/maintenance/{in_progress.id}/status",
        json={"status": "done"},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 200
    assert resp.json()["data"]["status"] == "done"

    audit_count = await db.scalar(
        sa.select(sa.func.count()).where(AuditLog.action == "maintenance_status_updated")
    )
    assert audit_count == 2


async def test_maintenance_status_rejects_illegal_transitions(client, db):
    rows = await seed_maintenance(client, db)
    in_progress, pending, done, _ = rows

    # 跳關(待處理 → 已完成)/回退/原地不動 → 409;未知狀態值 → 422
    for target, row in (("done", pending), ("pending", in_progress),
                        ("in_progress", done), ("pending", pending)):
        resp = await client.post(
            f"/api/v1/admin/maintenance/{row.id}/status",
            json={"status": target},
            headers=csrf_headers(client),
        )
        assert resp.status_code == 409, (target, row.id)
        assert resp.json()["meta"]["code"] == "INVALID_STATUS_TRANSITION"

    resp = await client.post(
        f"/api/v1/admin/maintenance/{pending.id}/status",
        json={"status": "fixed"},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 422
    assert (
        await client.post("/api/v1/admin/maintenance/99999/status",
                          json={"status": "in_progress"}, headers=csrf_headers(client))
    ).status_code == 404

    # 權限:無 amaint 的管理員 → 403
    await make_user(db, username="other-admin", role="admin", permissions=["aviol"])
    await login(client, "other-admin")
    resp = await client.post(
        f"/api/v1/admin/maintenance/{pending.id}/status",
        json={"status": "in_progress"},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 403


# ---- 稽核軌跡 ----


async def test_audit_list_filters_and_super_only(client, db):
    super_admin = await make_user(db, username="root", role="admin", is_super=True)
    await make_user(db, username="normal", role="admin", permissions=["aact"])
    staff = await make_user(db, username="staff01", role="staff", name="李工讀")

    db.add_all(
        [
            AuditLog(user_id=super_admin.id, role="admin", action="activity_approved", detail="a"),
            AuditLog(user_id=staff.id, role="staff", action="equipment_checked_out", detail="b"),
            AuditLog(user_id=staff.id, role="staff", action="violation_filed", detail="c"),
        ]
    )
    await db.commit()

    # 僅最高權限可看
    await login(client, "normal")
    assert (await client.get("/api/v1/admin/audit")).status_code == 403

    await login(client, "root")
    body = (await client.get("/api/v1/admin/audit")).json()
    assert body["meta"]["page_size"] == 20  # 每頁 20 筆
    # 登入事件也會寫 audit,至少包含 seed 的 3 筆且新到舊排序
    actions = [d["action"] for d in body["data"]]
    assert {"activity_approved", "equipment_checked_out", "violation_filed"} <= set(actions)

    # operator / role / action 篩選
    data = (
        await client.get("/api/v1/admin/audit", params={"user_id": staff.id})
    ).json()["data"]
    assert {d["action"] for d in data} == {"equipment_checked_out", "violation_filed"}
    assert all(d["user_name"] == "李工讀" for d in data)

    data = (await client.get("/api/v1/admin/audit", params={"role": "staff"})).json()["data"]
    assert all(d["role"] == "staff" for d in data)

    data = (
        await client.get("/api/v1/admin/audit", params={"action": "violation_filed"})
    ).json()["data"]
    assert [d["detail"] for d in data] == ["c"]


async def test_audit_date_range_uses_taipei_day_bounds(client, db):
    """畫面顯示台北時間,選某一天就該拿到那天整天(含頭含尾)。"""
    await make_user(db, username="root", role="admin", is_super=True)
    taipei_day = datetime(2026, 8, 11, tzinfo=TAIPEI)
    db.add_all(
        [
            AuditLog(role="admin", action="settings_updated", detail="早", created_at=taipei_day),
            AuditLog(
                role="admin",
                action="settings_updated",
                detail="晚",
                created_at=taipei_day + timedelta(hours=23, minutes=59),
            ),
            AuditLog(
                role="admin",
                action="settings_updated",
                detail="隔天",
                created_at=taipei_day + timedelta(days=1),
            ),
        ]
    )
    await db.commit()

    await login(client, "root")
    params = {"date_from": "2026-08-11", "date_to": "2026-08-11", "action": "settings_updated"}
    data = (await client.get("/api/v1/admin/audit", params=params)).json()["data"]
    assert sorted(d["detail"] for d in data) == ["早", "晚"]


async def test_audit_options_cover_every_record(client, db):
    """選項來自整張表:操作者不必先翻到那一頁,動作也不會漏掉新加的。"""
    super_admin = await make_user(db, username="root", role="admin", is_super=True)
    staff = await make_user(db, username="staff01", role="staff", name="李工讀")
    db.add_all(
        [AuditLog(user_id=staff.id, role="staff", action="violation_filed", detail=str(i))
         for i in range(25)]  # 超過一頁,確保不是靠翻頁累積
    )
    await db.commit()

    await login(client, "root")
    data = (await client.get("/api/v1/admin/audit/options")).json()["data"]
    assert {o["id"] for o in data["operators"]} == {super_admin.id, staff.id}
    assert "violation_filed" in data["actions"]
    assert len(data["actions"]) == len(set(data["actions"]))
