"""社團主檔管理(/admin/clubs,權限鍵 amember):列表/詳情/修改/重設密碼/成員名單。"""

import sqlalchemy as sa

from app.core.security import validate_password_strength
from app.models import AuditLog, Club, ClubMember, Session
from app.models.enums import MemberKind
from tests.conftest import csrf_headers, login, make_club, make_user

URL = "/api/v1/admin/clubs"


async def seed(client, db):
    club = await make_club(db)  # 熱舞社(藝術性)
    account = await make_user(db, username="club01", club_id=club.id)
    no_account = await make_club(db, name="吉他社")
    await make_user(db, username="clubadmin", role="admin", permissions=["amember"])
    await make_user(db, username="other", role="admin", permissions=["aviol"])
    await login(client, "clubadmin")
    return club, account, no_account


async def test_permission_gate(client, db):
    club, _, _ = await seed(client, db)
    await login(client, "other")
    assert (await client.get(URL)).status_code == 403
    assert (await client.get(f"{URL}/{club.id}")).status_code == 403
    assert (await client.get(f"{URL}/{club.id}/members")).status_code == 403
    resp = await client.patch(
        f"{URL}/{club.id}", json={"name": "熱舞研究社"}, headers=csrf_headers(client)
    )
    assert resp.status_code == 403
    resp = await client.post(f"{URL}/{club.id}/reset-password", headers=csrf_headers(client))
    assert resp.status_code == 403


async def test_club_options_open_to_any_admin(client, db):
    """最小選項端點:非 amember 的管理員也可讀,但只回 id/name/attribute。"""
    club, _, _ = await seed(client, db)

    await login(client, "other")  # 僅 aviol
    resp = await client.get(f"{URL}/options")
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert {c["name"] for c in data} == {"熱舞社", "吉他社"}
    row = next(c for c in data if c["id"] == club.id)
    assert set(row) == {"id", "name", "attribute"}  # 不含帳號/停權等敏感欄位

    # 非 admin 不可讀
    await login(client, "club01")
    assert (await client.get(f"{URL}/options")).status_code == 403


async def test_list_and_detail(client, db):
    club, _, no_account = await seed(client, db)
    await db.execute(
        sa.update(Club)
        .where(Club.id == club.id)
        .values(
            discord_webhook_url="https://discord.com/api/webhooks/1/secret-token",
            contact_emails=["a@ntust.edu.tw"],
            advisor_name="王老師",
        )
    )
    await db.commit()

    rows = (await client.get(URL)).json()["data"]
    by_name = {r["name"]: r for r in rows}
    assert by_name["熱舞社"]["username"] == "club01"
    assert by_name["熱舞社"]["attribute"] == "藝術性"
    assert by_name["熱舞社"]["is_active"] is True
    assert by_name["吉他社"]["username"] is None  # 尚未建立帳號

    resp = await client.get(f"{URL}/{club.id}")
    detail = resp.json()["data"]
    assert detail["username"] == "club01"
    assert detail["advisor_name"] == "王老師"
    assert detail["contact_emails"] == ["a@ntust.edu.tw"]
    # webhook 只回是否已設定,不得洩漏實值
    assert detail["discord_webhook_set"] is True
    assert "secret-token" not in resp.text
    detail2 = (await client.get(f"{URL}/{no_account.id}")).json()["data"]
    assert detail2["discord_webhook_set"] is False

    assert (await client.get(f"{URL}/99999")).status_code == 404


async def test_patch_name_username_active(client, db):
    club, account, no_account = await seed(client, db)

    # 名稱不再強制社/會結尾(2026-07-21):推導不到 kind 時沿用原值
    resp = await client.patch(
        f"{URL}/{club.id}", json={"name": "熱舞team"}, headers=csrf_headers(client)
    )
    assert resp.status_code == 200
    assert resp.json()["data"]["kind"] == "社團"

    # 改名結尾「會」→ kind 自動推導為學會;改回「社」→ 社團
    resp = await client.patch(
        f"{URL}/{club.id}", json={"name": "熱舞研究會"}, headers=csrf_headers(client)
    )
    assert resp.json()["data"]["kind"] == "學會"
    resp = await client.patch(
        f"{URL}/{club.id}", json={"name": "熱舞社"}, headers=csrf_headers(client)
    )
    assert resp.json()["data"]["kind"] == "社團"

    # 名稱重複 → 409
    resp = await client.patch(
        f"{URL}/{club.id}", json={"name": "吉他社"}, headers=csrf_headers(client)
    )
    assert resp.status_code == 409

    resp = await client.patch(
        f"{URL}/{club.id}",
        json={"name": "熱舞研究會", "username": "hotdance"},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["name"] == "熱舞研究會"
    assert resp.json()["data"]["username"] == "hotdance"

    # username 唯一性 → 409;格式錯誤 → 422
    await make_user(db, username="taken", role="staff")
    resp = await client.patch(
        f"{URL}/{club.id}", json={"username": "taken"}, headers=csrf_headers(client)
    )
    assert resp.status_code == 409
    resp = await client.patch(
        f"{URL}/{club.id}", json={"username": "x"}, headers=csrf_headers(client)
    )
    assert resp.status_code == 422

    # 無帳號的社團改 username → 409
    resp = await client.patch(
        f"{URL}/{no_account.id}", json={"username": "guitar"}, headers=csrf_headers(client)
    )
    assert resp.status_code == 409

    # 停用:社團與帳號同步,session 全撤,無法登入
    await login(client, "hotdance")  # 建立社團帳號 session
    await login(client, "clubadmin")
    resp = await client.patch(
        f"{URL}/{club.id}", json={"is_active": False}, headers=csrf_headers(client)
    )
    assert resp.status_code == 200
    assert resp.json()["data"]["is_active"] is False
    await db.refresh(account)
    assert account.is_active is False
    assert await db.scalar(sa.select(sa.func.count()).where(Session.user_id == account.id)) == 0
    assert (await login(client, "hotdance")).status_code == 401

    await login(client, "clubadmin")
    resp = await client.patch(
        f"{URL}/{club.id}", json={"is_active": True}, headers=csrf_headers(client)
    )
    assert resp.json()["data"]["is_active"] is True

    actions = list(await db.scalars(sa.select(AuditLog.action)))
    assert actions.count("club_updated") >= 3


async def test_reset_password(client, db):
    club, account, no_account = await seed(client, db)

    resp = await client.post(f"{URL}/{club.id}/reset-password", headers=csrf_headers(client))
    assert resp.status_code == 200, resp.text
    password = resp.json()["data"]["password"]
    validate_password_strength(password)  # 一次性密碼須符合密碼政策

    # 舊密碼失效、新密碼可登入且首登強制改密
    from tests.conftest import PASSWORD

    assert (await login(client, "club01", PASSWORD)).status_code == 401
    resp = await login(client, "club01", password)
    assert resp.status_code == 200
    assert resp.json()["data"]["must_change_password"] is True
    await db.refresh(account)
    assert account.must_change_password is True

    await login(client, "clubadmin")
    # 無帳號的社團 → 409
    resp = await client.post(
        f"{URL}/{no_account.id}/reset-password", headers=csrf_headers(client)
    )
    assert resp.status_code == 409
    assert (await client.post(f"{URL}/99999/reset-password", headers=csrf_headers(client))
            ).status_code == 404

    audit_row = await db.scalar(
        sa.select(AuditLog).where(AuditLog.action == "club_password_reset")
    )
    assert audit_row is not None
    assert password not in audit_row.detail  # 明碼絕不落稽核


async def test_members_readonly_list(client, db):
    club, _, other = await seed(client, db)
    db.add_all(
        [
            ClubMember(club_id=club.id, name="陳予恩", student_id="B11130001",
                       kind=MemberKind.OFFICER, title="公關", semester="114-2"),
            ClubMember(club_id=club.id, name="林小明", student_id="B11130002",
                       kind=MemberKind.MEMBER, semester="114-1"),
            ClubMember(club_id=other.id, name="他社員", student_id="B11130003",
                       kind=MemberKind.MEMBER, semester="114-2"),
        ]
    )
    await db.commit()

    body = (await client.get(f"{URL}/{club.id}/members")).json()
    assert body["meta"]["total"] == 2  # 只含該社
    names = {m["name"] for m in body["data"]}
    assert names == {"陳予恩", "林小明"}

    # 學期/身份篩選比照社團端
    rows = (
        await client.get(f"{URL}/{club.id}/members", params={"semester": "114-2"})
    ).json()["data"]
    assert [m["student_id"] for m in rows] == ["B11130001"]
    rows = (
        await client.get(f"{URL}/{club.id}/members", params={"kind": "社員"})
    ).json()["data"]
    assert [m["name"] for m in rows] == ["林小明"]

    # 排序白名單
    resp = await client.get(f"{URL}/{club.id}/members", params={"sort": "-name"})
    assert resp.status_code == 200
    assert (
        await client.get(f"{URL}/{club.id}/members", params={"sort": "hack"})
    ).status_code == 422
    assert (
        await client.get(f"{URL}/{club.id}/members", params={"semester": "bad"})
    ).status_code == 422
    assert (await client.get(f"{URL}/99999/members")).status_code == 404
