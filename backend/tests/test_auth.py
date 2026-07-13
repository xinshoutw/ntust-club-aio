from datetime import UTC, datetime, timedelta

import sqlalchemy as sa

from app.models import Session, User
from tests.conftest import PASSWORD, csrf_headers, login, make_club, make_user


async def test_login_success_sets_cookies_and_me(client, db):
    club = await make_club(db)
    await make_user(db, username="club01", club_id=club.id)

    resp = await login(client, "club01")
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["data"]["username"] == "club01"
    assert client.cookies.get("session_id")
    assert client.cookies.get("csrf_token")

    me = await client.get("/api/v1/auth/me")
    assert me.status_code == 200
    assert me.json()["data"]["club_id"] == club.id


async def test_login_wrong_password_is_generic(client, db):
    await make_user(db, username="club01")
    resp = await login(client, "club01", "WrongPass!123")
    assert resp.status_code == 401
    assert resp.json()["error"] == "帳號或密碼錯誤"
    # 不存在的帳號回同樣訊息(防帳號探測)
    resp2 = await login(client, "no-such-user", "WrongPass!123")
    assert resp2.status_code == 401
    assert resp2.json()["error"] == resp.json()["error"]


async def test_lockout_after_five_failures(client, db):
    user = await make_user(db, username="club01")
    for _ in range(5):
        resp = await login(client, "club01", "WrongPass!123")
        assert resp.status_code == 401
    resp = await login(client, "club01")  # 正確密碼也被鎖
    assert resp.status_code == 403
    assert resp.json()["meta"]["code"] == "ACCOUNT_LOCKED"

    # 鎖定期滿後可再登入
    await db.execute(
        sa.update(User)
        .where(User.id == user.id)
        .values(locked_until=datetime.now(UTC) - timedelta(seconds=1))
    )
    await db.commit()
    resp = await login(client, "club01")
    assert resp.status_code == 200


async def test_inactive_user_cannot_login(client, db):
    await make_user(db, username="club01", is_active=False)
    resp = await login(client, "club01")
    assert resp.status_code == 401


async def test_login_rate_limited_per_ip(client, db):
    for _ in range(10):
        resp = await login(client, "ghost", "WrongPass!123")
        assert resp.status_code == 401
    resp = await login(client, "ghost", "WrongPass!123")
    assert resp.status_code == 429
    assert resp.json()["meta"]["code"] == "RATE_LIMITED"


async def test_successful_logins_do_not_consume_rate_limit(client, db):
    # 校園 NAT 共用出口 IP:只有失敗嘗試計入限流
    await make_user(db, username="club01")
    for _ in range(12):
        assert (await login(client, "club01")).status_code == 200


async def test_csrf_required_on_state_changing_requests(client, db):
    await make_user(db, username="club01")
    await login(client, "club01")

    resp = await client.post("/api/v1/auth/logout")  # 無 X-CSRF-Token
    assert resp.status_code == 403
    assert resp.json()["meta"]["code"] == "CSRF_FAILED"

    resp = await client.post("/api/v1/auth/logout", headers={"X-CSRF-Token": "wrong"})
    assert resp.status_code == 403

    resp = await client.post("/api/v1/auth/logout", headers=csrf_headers(client))
    assert resp.status_code == 200


async def test_logout_revokes_session(client, db):
    await make_user(db, username="club01")
    await login(client, "club01")
    await client.post("/api/v1/auth/logout", headers=csrf_headers(client))
    resp = await client.get("/api/v1/auth/me")
    assert resp.status_code == 401


async def test_first_login_forces_password_change(client, db):
    await make_user(db, username="club01", must_change_password=True)
    await login(client, "club01")

    weak = await client.post(
        "/api/v1/auth/change-password",
        json={"old_password": PASSWORD, "new_password": "short"},
        headers=csrf_headers(client),
    )
    assert weak.status_code == 422
    assert weak.json()["meta"]["code"] == "PASSWORD_POLICY"

    wrong_old = await client.post(
        "/api/v1/auth/change-password",
        json={"old_password": "Nope!12345X", "new_password": "NewSecret!234"},
        headers=csrf_headers(client),
    )
    assert wrong_old.status_code == 422

    ok = await client.post(
        "/api/v1/auth/change-password",
        json={"old_password": PASSWORD, "new_password": "NewSecret!234"},
        headers=csrf_headers(client),
    )
    assert ok.status_code == 200
    me = await client.get("/api/v1/auth/me")
    assert me.json()["data"]["must_change_password"] is False


async def test_password_not_reusable_within_three_generations(client, db):
    await make_user(db, username="club01")
    await login(client, "club01")

    async def change(old: str, new: str):
        return await client.post(
            "/api/v1/auth/change-password",
            json={"old_password": old, "new_password": new},
            headers=csrf_headers(client),
        )

    a, b, c = "GenA!234567", "GenB!234567", "GenC!234567"
    assert (await change(PASSWORD, a)).status_code == 200
    assert (await change(a, b)).status_code == 200
    assert (await change(b, c)).status_code == 200

    # 最近 3 代(a/b/c)都不可重用
    for reused in (a, b, c):
        resp = await change(c, reused)
        assert resp.status_code == 422
        assert resp.json()["meta"]["code"] == "PASSWORD_REUSED"

    # 已超過 3 代的最初密碼可以再用
    assert (await change(c, PASSWORD)).status_code == 200


async def test_change_password_revokes_other_sessions(client, db):
    import httpx

    from app.main import app

    await make_user(db, username="club01")
    await login(client, "club01")

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as other:
        await login(other, "club01")
        assert (await other.get("/api/v1/auth/me")).status_code == 200

        await client.post(
            "/api/v1/auth/change-password",
            json={"old_password": PASSWORD, "new_password": "NewSecret!234"},
            headers=csrf_headers(client),
        )
        assert (await client.get("/api/v1/auth/me")).status_code == 200  # 當前保留
        assert (await other.get("/api/v1/auth/me")).status_code == 401  # 其他撤銷


async def test_session_sliding_renewal(client, db):
    await make_user(db, username="club01")
    await login(client, "club01")

    # 模擬只剩 1 小時效期
    await db.execute(
        sa.update(Session).values(expires_at=datetime.now(UTC) + timedelta(hours=1))
    )
    await db.commit()

    assert (await client.get("/api/v1/auth/me")).status_code == 200
    remaining = await db.scalar(sa.select(Session.expires_at))
    assert remaining - datetime.now(UTC) > timedelta(days=6)


async def test_expired_session_rejected(client, db):
    await make_user(db, username="club01")
    await login(client, "club01")
    await db.execute(
        sa.update(Session).values(expires_at=datetime.now(UTC) - timedelta(seconds=1))
    )
    await db.commit()
    assert (await client.get("/api/v1/auth/me")).status_code == 401
