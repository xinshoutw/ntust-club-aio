"""系統設定 API(/admin/settings,僅 super;2026-07-16 第八輪)。"""

import sqlalchemy as sa

from app.models import AuditLog, SystemSetting
from tests.conftest import csrf_headers, login, make_user

URL = "/api/v1/admin/settings"


async def seed(client, db):
    await make_user(db, username="root", role="admin", is_super=True)
    await make_user(db, username="normal", role="admin", permissions=["aviol"])
    await login(client, "root")


async def test_super_only(client, db):
    await seed(client, db)
    await login(client, "normal")
    assert (await client.get(URL)).status_code == 403
    resp = await client.put(URL, json={}, headers=csrf_headers(client))
    assert resp.status_code == 403


async def test_get_defaults(client, db):
    await seed(client, db)
    data = (await client.get(URL)).json()["data"]
    # 舊鍵(開放月份+手動加開)已移除,固定借用改日期區間
    assert data["fixed_booking_window"] == {"open_from": None, "open_until": None}
    assert data["equipment_workday_buffer"] == {"before": 2, "after": 1}
    assert data["close_lock_months"] == 1
    assert data["upload_limits"] == {"doc": 50, "img": 10, "zip": 100, "video": 200}
    assert data["activity_attachment_total_mb"] == 50
    assert data["storage_limits"] == {"capacity_gib": 40, "per_club_gib": 2, "reserve_gib": 10}
    assert data["eval_window"]["year"] == 116
    assert "其他" in data["violation_items"]
    assert "膳食費" in data["budget_categories"]
    # 不再提供「線上報名時間窗」鍵(報名窗由各報名活動起訖決定)
    assert "signup_window" not in data and "reg_window" not in data


async def test_put_partial_update_and_audit(client, db):
    await seed(client, db)
    resp = await client.put(
        URL,
        json={
            "fixed_booking_window": {"open_from": "2026-06-01", "open_until": "2026-06-30"},
            "close_lock_months": 2,
            "upload_limits": {"doc": 30, "img": 10, "zip": 100, "video": 200},
            "violation_items": [" 未經申請使用場地 ", "其他", "其他"],  # 去空白、去重
        },
        headers=csrf_headers(client),
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()["data"]
    assert data["fixed_booking_window"] == {"open_from": "2026-06-01", "open_until": "2026-06-30"}
    assert data["close_lock_months"] == 2
    assert data["upload_limits"]["doc"] == 30
    assert data["violation_items"] == ["未經申請使用場地", "其他"]
    # 未帶的鍵不動
    assert data["equipment_workday_buffer"] == {"before": 2, "after": 1}

    stored = await db.get(SystemSetting, "close_lock_months")
    assert stored.value == 2
    audit_row = await db.scalar(
        sa.select(AuditLog).where(AuditLog.action == "settings_updated")
    )
    assert audit_row is not None
    assert "close_lock_months" in audit_row.detail

    # 再讀一次仍是新值
    data = (await client.get(URL)).json()["data"]
    assert data["close_lock_months"] == 2


async def test_put_validations(client, db):
    await seed(client, db)

    # 區間順序錯誤
    resp = await client.put(
        URL,
        json={"fixed_booking_window": {"open_from": "2026-07-01", "open_until": "2026-06-01"}},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 422

    # 只填一端
    resp = await client.put(
        URL,
        json={"fixed_booking_window": {"open_from": "2026-07-01", "open_until": None}},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 422

    # 超出範圍
    resp = await client.put(URL, json={"close_lock_months": 0}, headers=csrf_headers(client))
    assert resp.status_code == 422
    resp = await client.put(
        URL,
        json={"equipment_workday_buffer": {"before": 99, "after": 1}},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 422

    # 清成空清單
    resp = await client.put(
        URL, json={"budget_categories": ["  "]}, headers=csrf_headers(client)
    )
    assert resp.status_code == 422

    # 儲存配額:單一社團配額不得超過總容量;數值須為正
    resp = await client.put(
        URL,
        json={"storage_limits": {"capacity_gib": 10, "per_club_gib": 20, "reserve_gib": 5}},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 422
    resp = await client.put(
        URL,
        json={"storage_limits": {"capacity_gib": 0, "per_club_gib": 1, "reserve_gib": 1}},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 422


async def test_storage_limits_update_and_audit(client, db):
    await seed(client, db)
    resp = await client.put(
        URL,
        json={"storage_limits": {"capacity_gib": 60, "per_club_gib": 3, "reserve_gib": 12}},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()["data"]
    assert data["storage_limits"] == {"capacity_gib": 60, "per_club_gib": 3, "reserve_gib": 12}

    stored = await db.get(SystemSetting, "storage_limits")
    assert stored.value["capacity_gib"] == 60
    audit_row = await db.scalar(sa.select(AuditLog).where(AuditLog.action == "settings_updated"))
    assert audit_row is not None
    assert "storage_limits" in audit_row.detail


async def test_fixed_window_setting_drives_club_endpoint(client, db):
    """設定寫入後,社團端固定借用開放窗立即反映。"""
    from datetime import date, timedelta

    await seed(client, db)
    club_user = await make_user(db, username="club01")
    from tests.conftest import make_club

    club = await make_club(db)
    club_user.club_id = club.id
    await db.commit()

    today = date.today()
    await client.put(
        URL,
        json={
            "fixed_booking_window": {
                "open_from": today.isoformat(),
                "open_until": (today + timedelta(days=3)).isoformat(),
            }
        },
        headers=csrf_headers(client),
    )

    await login(client, "club01")
    window = (await client.get("/api/v1/club/room-bookings/window")).json()["data"]
    assert window["open"] is True
    assert window["open_from"] == today.isoformat()
