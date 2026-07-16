"""帳號管理 API(/admin/accounts,僅 super;2026-07-16 第八輪)。"""

import sqlalchemy as sa

from app.core.security import validate_password_strength
from app.models import AuditLog, Session, User, Violation
from tests.conftest import csrf_headers, login, make_club, make_user

URL = "/api/v1/admin/accounts"


async def seed(client, db):
    root = await make_user(db, username="root", role="admin", is_super=True)
    await make_user(db, username="normal", role="admin", permissions=["aviol"])
    await login(client, "root")
    return root


async def create_account(client, **overrides) -> dict:
    body = {"role": "staff", "name": "李工讀", "username": "staff_lee", **overrides}
    resp = await client.post(URL, json=body, headers=csrf_headers(client))
    assert resp.status_code == 201, resp.text
    return resp.json()["data"]


async def test_super_only(client, db):
    await seed(client, db)
    await login(client, "normal")
    assert (await client.get(URL)).status_code == 403
    resp = await client.post(
        URL, json={"role": "staff", "name": "x", "username": "sx"}, headers=csrf_headers(client)
    )
    assert resp.status_code == 403


async def test_create_returns_one_time_password(client, db):
    await seed(client, db)
    data = await create_account(client)
    password = data["password"]
    validate_password_strength(password)  # 一次性密碼須符合密碼政策
    assert data["must_change_password"] is True
    assert data["role"] == "staff"

    # 重複帳號 → 409
    resp = await client.post(
        URL,
        json={"role": "staff", "name": "重複", "username": "staff_lee"},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 409

    # 以一次性密碼登入 → 首登強制改密
    resp = await login(client, "staff_lee", password)
    assert resp.status_code == 200
    assert resp.json()["data"]["must_change_password"] is True
    resp = await client.get("/api/v1/club/announcements")
    assert resp.status_code == 403  # 未改密前僅放行改密/登出/me
    assert resp.json()["meta"]["code"] == "PASSWORD_CHANGE_REQUIRED"


async def test_create_admin_with_permissions_and_viewer(client, db):
    await seed(client, db)
    data = await create_account(
        client, role="admin", name="李承辦", username="admin_lee",
        permissions=["areview", "aclose", "asignup"],
    )
    assert data["permissions"] == ["areview", "aclose", "asignup"]
    assert data["is_super"] is False

    # 未知權限鍵 → 422
    resp = await client.post(
        URL,
        json={"role": "admin", "name": "x", "username": "adm_x", "permissions": ["hack"]},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 422

    # 非管理員帶權限鍵 → 422
    resp = await client.post(
        URL,
        json={"role": "staff", "name": "x", "username": "staff_x", "permissions": ["aviol"]},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 422

    # 評審帳號預設可看評鑑資料
    data = await create_account(client, role="viewer", name="張老師", username="viewer01")
    assert data["can_view_eval"] is True


async def test_list_filters_by_role(client, db):
    await seed(client, db)
    await create_account(client)
    await create_account(client, role="viewer", name="張老師", username="viewer01")

    rows = (await client.get(f"{URL}?role=staff")).json()["data"]
    assert [r["username"] for r in rows] == ["staff_lee"]
    rows = (await client.get(URL)).json()["data"]
    assert {r["username"] for r in rows} >= {"root", "normal", "staff_lee", "viewer01"}


async def test_set_active_revokes_sessions(client, db):
    await seed(client, db)
    data = await create_account(client)
    password = data["password"]
    await login(client, "staff_lee", password)  # 建立 session
    await login(client, "root")

    resp = await client.put(
        f"{URL}/{data['id']}/active", json={"is_active": False}, headers=csrf_headers(client)
    )
    assert resp.status_code == 200
    assert resp.json()["data"]["is_active"] is False
    assert (
        await db.scalar(
            sa.select(sa.func.count()).where(Session.user_id == data["id"])
        )
    ) == 0
    # 停權後無法登入
    resp = await login(client, "staff_lee", password)
    assert resp.status_code == 401

    # 恢復
    await login(client, "root")
    resp = await client.put(
        f"{URL}/{data['id']}/active", json={"is_active": True}, headers=csrf_headers(client)
    )
    assert resp.json()["data"]["is_active"] is True


async def test_reset_password(client, db):
    await seed(client, db)
    data = await create_account(client)
    old_password = data["password"]

    resp = await client.post(
        f"{URL}/{data['id']}/reset-password", headers=csrf_headers(client)
    )
    assert resp.status_code == 200
    new_password = resp.json()["data"]["password"]
    validate_password_strength(new_password)
    assert new_password != old_password

    resp = await login(client, "staff_lee", old_password)
    assert resp.status_code == 401  # 舊密碼失效
    resp = await login(client, "staff_lee", new_password)
    assert resp.status_code == 200
    assert resp.json()["data"]["must_change_password"] is True


async def test_delete_keeps_audit_rows(client, db):
    await seed(client, db)
    data = await create_account(client)
    await login(client, "staff_lee", data["password"])  # 產生 login 稽核紀錄
    await login(client, "root")

    resp = await client.delete(f"{URL}/{data['id']}", headers=csrf_headers(client))
    assert resp.status_code == 200
    assert await db.scalar(sa.select(User.id).where(User.id == data["id"])) is None
    # 稽核紀錄保留(user_id 置 NULL,列不刪)
    login_row = await db.scalar(
        sa.select(AuditLog).where(AuditLog.action == "login", AuditLog.user_id.is_(None))
    )
    assert login_row is not None
    deleted_row = await db.scalar(
        sa.select(AuditLog).where(AuditLog.action == "account_deleted")
    )
    assert "staff_lee" in deleted_row.detail


async def test_delete_blocked_when_history_exists(client, db):
    """有業務歷史紀錄(FK 引用)的帳號不可刪,改用停權。"""
    await seed(client, db)
    data = await create_account(client)
    club = await make_club(db)
    db.add(
        Violation(
            club_id=club.id,
            occurred_on=sa.func.now(),
            location="活動中心",
            items=["噪音影響他人"],
            filler_id=data["id"],
        )
    )
    await db.commit()

    resp = await client.delete(f"{URL}/{data['id']}", headers=csrf_headers(client))
    assert resp.status_code == 409
    assert await db.scalar(sa.select(User.id).where(User.id == data["id"])) is not None


async def test_guards_self_super_and_club(client, db):
    root = await seed(client, db)

    # 不可刪除/停權自己
    resp = await client.delete(f"{URL}/{root.id}", headers=csrf_headers(client))
    assert resp.status_code == 409
    resp = await client.put(
        f"{URL}/{root.id}/active", json={"is_active": False}, headers=csrf_headers(client)
    )
    assert resp.status_code == 409

    # 不可刪除最高權限帳號
    other_super = await make_user(db, username="root2", role="admin", is_super=True)
    resp = await client.delete(f"{URL}/{other_super.id}", headers=csrf_headers(client))
    assert resp.status_code == 409

    # 社團帳號不在此管理(視同不存在)
    club = await make_club(db)
    club_user = await make_user(db, username="club01", club_id=club.id)
    resp = await client.delete(f"{URL}/{club_user.id}", headers=csrf_headers(client))
    assert resp.status_code == 404


async def test_set_permissions(client, db):
    await seed(client, db)
    data = await create_account(
        client, role="admin", name="李承辦", username="admin_lee", permissions=["areview"]
    )

    resp = await client.put(
        f"{URL}/{data['id']}/permissions",
        json={"permissions": ["areview", "aclose", "approve_advisor"]},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 200
    assert resp.json()["data"]["permissions"] == ["areview", "aclose", "approve_advisor"]
    audit_row = await db.scalar(
        sa.select(AuditLog).where(AuditLog.action == "account_permissions_updated")
    )
    assert audit_row is not None

    # 未知鍵 → 422;非管理員 → 422
    resp = await client.put(
        f"{URL}/{data['id']}/permissions",
        json={"permissions": ["hack"]},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 422

    staff = await create_account(client)
    resp = await client.put(
        f"{URL}/{staff['id']}/permissions",
        json={"permissions": ["areview"]},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 422
