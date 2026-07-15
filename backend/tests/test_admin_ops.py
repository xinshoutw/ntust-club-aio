"""維修管理列表(排序)與稽核軌跡列表(篩選)。"""

from datetime import UTC, datetime, timedelta

import sqlalchemy as sa

from app.models import AuditLog, MaintenanceRequest
from tests.conftest import login, make_club, make_user

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
