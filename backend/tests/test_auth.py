from datetime import UTC, datetime, timedelta

import sqlalchemy as sa

from app.core.db import async_session_factory
from app.core.errors import AppError
from app.models import AuditLog, Session, User
from app.services import auth as auth_service
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


async def test_unknown_account_input_not_stored_in_audit(client, db):
    """打錯欄位把密碼輸進帳號欄很常見:查無此帳號時不得把原文留在稽核裡。"""
    await make_user(db, username="club01", is_active=False)
    secret = "MyPassw0rd!"
    await login(client, secret, secret)
    await login(client, "club01")  # 停用帳號:帳號名對得上真實帳號,可以留

    query = sa.select(AuditLog.detail).where(AuditLog.action == "login_failed")
    details = list(await db.scalars(query))
    assert secret not in " ".join(details)
    assert "username=club01" in details


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


async def test_password_reset_beats_a_login_already_in_flight(db, monkeypatch):
    """重設密碼撤銷所有 session 後,不得留下一個用舊密碼建立的 session。"""
    import asyncio

    from app.core.db import async_session_factory
    from app.core.security import hash_password
    from app.services import auth as auth_service

    user = await make_user(db, username="club01")

    real_verify = auth_service.verify_password_async

    async def slow_verify(password_hash, password):
        await asyncio.sleep(0.3)  # 撐開驗證期間,讓重設剛好落在中間
        return await real_verify(password_hash, password)

    monkeypatch.setattr(auth_service, "verify_password_async", slow_verify)

    async def sign_in():
        async with async_session_factory() as session:
            await auth_service.login(
                session, username="club01", password=PASSWORD, ip=None, user_agent=None
            )

    async def reset_password():  # 與兩支 reset-password 端點同樣的寫法
        await asyncio.sleep(0.1)
        async with async_session_factory() as session:
            target = await session.get(User, user.id)
            target.password_hash = hash_password("BrandNew!2345")
            await session.execute(sa.delete(Session).where(Session.user_id == user.id))
            await session.commit()

    outcomes = await asyncio.gather(sign_in(), reset_password(), return_exceptions=True)

    # 驗證期間密碼被換掉:這次登入不算數,也不得留下 session
    assert isinstance(outcomes[0], AppError)
    assert await db.scalar(sa.select(sa.func.count()).select_from(Session)) == 0


async def test_login_locks_users_before_touching_sessions(db):
    """重設密碼與停權都是先改 users 再刪 sessions;登入反序取鎖就會與它們死鎖(登入方噴 500)。"""
    from app.core.db import engine

    await make_user(db, username="club01")
    statements: list[str] = []

    def record(conn, cursor, statement, *args):
        statements.append(" ".join(statement.split()))

    sa.event.listen(engine.sync_engine, "before_cursor_execute", record)
    try:
        async with async_session_factory() as session:
            await auth_service.login(
                session, username="club01", password=PASSWORD, ip=None, user_agent=None
            )
    finally:
        sa.event.remove(engine.sync_engine, "before_cursor_execute", record)

    locked_users = next(i for i, s in enumerate(statements) if "FOR UPDATE" in s)
    cleared = next(i for i, s in enumerate(statements) if s.startswith("DELETE FROM sessions"))
    assert locked_users < cleared


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

    # 未達續期門檻的請求不重送 cookie(避免每請求 Set-Cookie)
    resp = await client.get("/api/v1/auth/me")
    assert "set-cookie" not in resp.headers

    # 模擬只剩 1 小時效期
    await db.execute(
        sa.update(Session).values(expires_at=datetime.now(UTC) + timedelta(hours=1))
    )
    await db.commit()

    resp = await client.get("/api/v1/auth/me")
    assert resp.status_code == 200
    remaining = await db.scalar(sa.select(Session.expires_at))
    assert remaining - datetime.now(UTC) > timedelta(days=6)

    # DB 續期須同步重送 session/CSRF cookies,瀏覽器端 Max-Age 才會跟著滑動
    cookies = resp.headers.get_list("set-cookie")
    assert any(c.startswith("session_id=") and "Max-Age=604800" in c for c in cookies)
    assert any(c.startswith("csrf_token=") and "Max-Age=604800" in c for c in cookies)


async def test_upload_precheck_gate(client, db):
    """nginx auth_request 用的 pre-body 驗證:未登入 401、CSRF 錯 403、通過 204。"""
    await make_user(db, username="club01")
    assert (await client.get("/api/v1/auth/precheck")).status_code == 401

    await login(client, "club01")
    assert (await client.get("/api/v1/auth/precheck")).status_code == 403  # 缺 CSRF
    resp = await client.get("/api/v1/auth/precheck", headers={"X-CSRF-Token": "bogus"})
    assert resp.status_code == 403
    resp = await client.get("/api/v1/auth/precheck", headers=csrf_headers(client))
    assert resp.status_code == 204


async def test_upload_precheck_blocks_unfinished_password_change(client, db):
    await make_user(db, username="fresh", must_change_password=True)
    await login(client, "fresh")
    resp = await client.get("/api/v1/auth/precheck", headers=csrf_headers(client))
    assert resp.status_code == 403
    assert resp.json()["meta"]["code"] == "PASSWORD_CHANGE_REQUIRED"


async def test_validation_error_does_not_echo_input(client, db):
    """422 detail 不回傳 input/url:巨型或敏感輸入不得在錯誤回應中二次外洩。"""
    resp = await client.post(
        "/api/v1/auth/login", json={"username": "x" * 500, "password": 12345}
    )
    assert resp.status_code == 422
    body = resp.text
    assert "x" * 500 not in body
    for err in resp.json()["meta"]["detail"]:
        assert "input" not in err and "url" not in err


async def test_expired_session_rejected(client, db):
    await make_user(db, username="club01")
    await login(client, "club01")
    await db.execute(
        sa.update(Session).values(expires_at=datetime.now(UTC) - timedelta(seconds=1))
    )
    await db.commit()
    assert (await client.get("/api/v1/auth/me")).status_code == 401


async def test_me_carries_the_period_catalogue(client, db):
    """節次目錄隨 /auth/me 下發:前端的節次軸與起訖時刻沒有第二份(ISS-86)。"""
    from app.services import booking_service

    club = await make_club(db)
    await make_user(db, username="club01", club_id=club.id)
    await login(client, "club01")

    periods = (await client.get("/api/v1/auth/me")).json()["data"]["periods"]
    assert [p["key"] for p in periods] == list(booking_service.PERIODS)
    assert periods[0] == {"key": "1", "start": "08:10", "end": "09:00"}
    assert periods[-1] == {"key": "D", "start": "21:10", "end": "22:00"}
