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
    # 各申請性質的加總上限(2026-07-17 改依性質給總量)
    assert data["activity_attachment_total_mb"] == 15
    assert data["maintenance_total_mb"] == 100
    assert data["close_photo_total_mb"] == 10
    # 系統總量改用實際磁碟空間;設定僅留單一社團配額(移除 capacity/reserve)
    assert data["storage_limits"] == {"per_club_gib": 2}
    assert data["eval_window"]["year"] == 116
    assert "其他" in data["violation_items"]
    # 經費科目改為 [{name, hint}]
    names = [c["name"] for c in data["budget_categories"]]
    assert "膳食費" in names
    assert any(c["name"] == "保險費" and c["hint"] for c in data["budget_categories"])
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

    # 清成空清單(每項名稱皆空)
    resp = await client.put(
        URL, json={"budget_categories": [{"name": "  ", "hint": ""}]}, headers=csrf_headers(client)
    )
    assert resp.status_code == 422

    # 儲存配額:單一社團配額須為正整數(不再有 capacity/reserve)
    resp = await client.put(
        URL,
        json={"storage_limits": {"per_club_gib": 0}},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 422


async def test_storage_limits_update_and_audit(client, db):
    await seed(client, db)
    resp = await client.put(
        URL,
        json={"storage_limits": {"per_club_gib": 3}},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()["data"]
    assert data["storage_limits"] == {"per_club_gib": 3}

    stored = await db.get(SystemSetting, "storage_limits")
    assert stored.value["per_club_gib"] == 3
    audit_row = await db.scalar(sa.select(AuditLog).where(AuditLog.action == "settings_updated"))
    assert audit_row is not None
    assert "storage_limits" in audit_row.detail


async def test_audit_records_before_and_after_values(client, db):
    """只記鍵名的話,事後查「誰把上限改小的」還是得靠人記憶。"""
    await seed(client, db)

    async def put(payload):
        return await client.put(URL, json=payload, headers=csrf_headers(client))

    await put({"close_lock_months": 2})
    logged = sa.select(AuditLog.detail).where(AuditLog.action == "settings_updated")
    assert list(await db.scalars(logged)) == ["close_lock_months=1→2"]

    # 送出但值沒變:沒有變更就不該留下稽核紀錄
    await put({"close_lock_months": 2})
    assert len(list(await db.scalars(logged))) == 1


async def test_budget_categories_with_hints(client, db):
    """經費科目為 [{name, hint}];依名稱去重保序,寫入後可讀回。"""
    await seed(client, db)
    resp = await client.put(
        URL,
        json={
            "budget_categories": [
                {"name": "膳食費", "hint": "含茶點"},
                {"name": "膳食費", "hint": "重複名稱去除"},
                {"name": "交通費", "hint": ""},
            ]
        },
        headers=csrf_headers(client),
    )
    assert resp.status_code == 200, resp.text
    cats = resp.json()["data"]["budget_categories"]
    assert cats == [{"name": "膳食費", "hint": "含茶點"}, {"name": "交通費", "hint": ""}]


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

async def test_budget_categories_legacy_string_rows_normalized(client, db):
    """殘留的舊 list[str] 格式(2026-07-17 前)讀取端正規化為 [{name, hint}],不 500。"""
    await seed(client, db)
    db.add(SystemSetting(key="budget_categories", value=["膳食費", "交通費"]))
    await db.commit()

    data = (await client.get(URL)).json()["data"]
    assert data["budget_categories"] == [
        {"name": "膳食費", "hint": ""},
        {"name": "交通費", "hint": ""},
    ]
