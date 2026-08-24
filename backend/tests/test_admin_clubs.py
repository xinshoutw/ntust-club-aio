"""社團主檔管理(/admin/clubs,權限鍵 amember):列表/詳情/修改/建帳號/重設密碼/成員名單。"""

import sqlalchemy as sa

from app.core.security import validate_password_strength
from app.models import AuditLog, Club, ClubMember, Session, User
from app.models.enums import MemberKind, UserRole
from tests.conftest import csrf_headers, login, make_club, make_user

URL = "/api/v1/admin/clubs"


async def seed(client, db):
    club = await make_club(db)  # 熱舞社(藝術性)
    account = await make_user(db, username="club01", club_id=club.id)
    no_account = await make_club(db, name="吉他社")
    await make_user(
        db,
        username="clubadmin",
        role="admin",
        # 這支測試檔涵蓋整個 /admin/clubs router,含只有帳號管理頁會呼叫的清單端點
        permissions=["aclub", "amember", "aclubset", "aaccount"],
    )
    # 只讀得到名單、改不了設定的帳號(社團三頁各自一把鍵)
    await make_user(db, username="memberonly", role="admin", permissions=["amember"])
    # 帳號管理頁本身:社團分頁看得到,但 /admin/clubs 的寫入一律歸 aclubset
    await make_user(db, username="accountonly", role="admin", permissions=["aaccount"])
    await make_user(db, username="other", role="admin", permissions=["aviol"])
    await login(client, "clubadmin")
    return club, account, no_account


async def test_club_pages_have_separate_keys(client, db):
    """成員列表的權限讀得到社團資料,但改不動管理項目 —— 三頁各自一把鍵。"""
    club, _, _ = await seed(client, db)
    await login(client, "memberonly")

    # 成員列表頁要的就是名單本身
    assert (await client.get(f"{URL}/{club.id}/members")).status_code == 200
    assert (await client.get(f"{URL}/{club.id}/members/semesters")).status_code == 200
    # 社團詳情(指導老師、聯絡信箱、停權原因)是總覽與管理項目的資料,名單頁讀不到;
    # 全校社團清單(含帳號名與停權日)也只有帳號管理與逾期追蹤需要
    assert (await client.get(f"{URL}/{club.id}")).status_code == 403
    assert (await client.get(URL)).status_code == 403

    for resp in (
        await client.patch(
            f"{URL}/{club.id}", json={"name": "改名"}, headers=csrf_headers(client)
        ),
        await client.post(
            f"{URL}/{club.id}/reset-password", headers=csrf_headers(client)
        ),
        await client.post(
            f"{URL}/{club.id}/account", json={"username": "x1"}, headers=csrf_headers(client)
        ),
        await client.post(
            URL, json={"name": "新社", "attribute": "藝術性"}, headers=csrf_headers(client)
        ),
    ):
        assert resp.status_code == 403, resp.text


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
    resp = await client.post(
        f"{URL}/{club.id}/account", json={"username": "newclub"}, headers=csrf_headers(client)
    )
    assert resp.status_code == 403
    resp = await client.post(
        URL, json={"name": "新社", "attribute": "藝術性"}, headers=csrf_headers(client)
    )
    assert resp.status_code == 403


async def test_create_club(client, db):
    """新增社團:kind 由名稱結尾推導,性質必填,名稱不得重複。"""
    club, _, _ = await seed(client, db)

    resp = await client.post(
        URL, json={"name": "攝影研究會", "attribute": "學藝性"}, headers=csrf_headers(client)
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()["data"]
    assert (body["name"], body["kind"], body["attribute"]) == ("攝影研究會", "學會", "學藝性")
    assert body["is_active"] is True
    # 帳號另走 /{id}/account:剛建好的社團還登不進來。查 GET 不查建立回應 ——
    # 後者的 username 是 _detail_out(club, None) 寫死的參數,庫裡有沒有帳號都是 None
    fetched = await client.get(f"{URL}/{body['id']}")
    assert fetched.json()["data"]["username"] is None

    # 結尾推不出社/會的先當社團(管理項目改得動),不是擋下來
    resp = await client.post(
        URL, json={"name": "臺科大電競", "attribute": "體育性"}, headers=csrf_headers(client)
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["data"]["kind"] == "社團"

    # 名稱前後空白要 trim:不 trim 的話 derive_kind 的 endswith 對不上(kind 落到
    # fallback)、重名檢查也繞得過去,而全空白會建出一個沒有名字的社團
    resp = await client.post(
        URL, json={"name": "  書法社  ", "attribute": "藝術性"}, headers=csrf_headers(client)
    )
    assert resp.status_code == 201, resp.text
    assert (resp.json()["data"]["name"], resp.json()["data"]["kind"]) == ("書法社", "社團")
    resp = await client.post(
        URL, json={"name": "   ", "attribute": "藝術性"}, headers=csrf_headers(client)
    )
    assert resp.status_code == 422, resp.text

    # 名稱唯一;性質必填(沒有性質的社團不會出現在社團漏斗)
    resp = await client.post(
        URL, json={"name": club.name, "attribute": "藝術性"}, headers=csrf_headers(client)
    )
    assert resp.status_code == 409, resp.text
    resp = await client.post(URL, json={"name": "無性質社"}, headers=csrf_headers(client))
    assert resp.status_code == 422, resp.text

    audits = (
        await db.scalars(sa.select(AuditLog).where(AuditLog.action == "club_created"))
    ).all()
    assert len(audits) == 3


async def test_create_club_needs_the_club_settings_key(client, db):
    """建社團歸 aclubset(社團管理項目),不是 aaccount —— 入口雖然在帳號管理頁上。"""
    await seed(client, db)
    await login(client, "accountonly")

    # 帳號管理頁的社團分頁讀得到清單
    assert (await client.get(URL)).status_code == 200
    resp = await client.post(
        URL, json={"name": "攝影社", "attribute": "藝術性"}, headers=csrf_headers(client)
    )
    assert resp.status_code == 403, resp.text


async def test_patch_attribute(client, db):
    """性質改得動:建檔時必填,選錯了不必動 DB;既有的 null 不強迫補值。"""
    club, _, _ = await seed(client, db)

    resp = await client.patch(
        f"{URL}/{club.id}", json={"attribute": "體育性"}, headers=csrf_headers(client)
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["attribute"] == "體育性"

    # 不送 attribute 的 PATCH 不得把既有值清掉(exclude_unset)
    resp = await client.patch(
        f"{URL}/{club.id}", json={"name": club.name}, headers=csrf_headers(client)
    )
    assert resp.json()["data"]["attribute"] == "體育性"

    audits = (
        await db.scalars(
            sa.select(AuditLog).where(AuditLog.action == "club_updated")
        )
    ).all()
    assert any("attribute:" in (a.detail or "") for a in audits)


async def test_club_options_open_to_any_admin(client, db):
    """最小選項端點:非 amember 的管理員也可讀,但只回 id/name/attribute。"""
    club, _, _ = await seed(client, db)

    await login(client, "other")  # 僅 aviol
    resp = await client.get(f"{URL}/options")
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert {c["name"] for c in data} == {"熱舞社", "吉他社"}
    row = next(c for c in data if c["id"] == club.id)
    # is_active 是啟停用旗標(行政分下拉靠它濾掉會 404 的停用社團),不是敏感欄位;
    # 帳號名與停權日仍只在需要 aclub 的完整主檔
    assert set(row) == {"id", "name", "kind", "attribute", "is_active"}

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


async def test_create_club_account(client, db):
    club, _, no_account = await seed(client, db)

    resp = await client.post(
        f"{URL}/{no_account.id}/account", json={"username": "guitar"}, headers=csrf_headers(client)
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()["data"]
    assert data["username"] == "guitar"
    validate_password_strength(data["password"])  # 一次性密碼須符合密碼政策

    account = await db.scalar(sa.select(User).where(User.username == "guitar"))
    assert account.role == UserRole.CLUB
    assert account.club_id == no_account.id
    assert account.name == "吉他社"  # 顯示名=社團名
    assert account.is_active is True
    assert account.must_change_password is True
    rows = (await client.get(URL)).json()["data"]
    assert next(r for r in rows if r["name"] == "吉他社")["username"] == "guitar"

    # 新帳號可登入且首登強制改密
    resp = await login(client, "guitar", data["password"])
    assert resp.status_code == 200
    assert resp.json()["data"]["must_change_password"] is True

    await login(client, "clubadmin")
    audit_row = await db.scalar(
        sa.select(AuditLog).where(AuditLog.action == "club_account_created")
    )
    assert audit_row is not None
    assert data["password"] not in audit_row.detail  # 明碼絕不落稽核

    # 已有帳號的社團(含剛建立者)再建 → 409
    resp = await client.post(
        f"{URL}/{no_account.id}/account", json={"username": "guitar2"}, headers=csrf_headers(client)
    )
    assert resp.status_code == 409
    resp = await client.post(
        f"{URL}/{club.id}/account", json={"username": "dance"}, headers=csrf_headers(client)
    )
    assert resp.status_code == 409


async def test_second_account_for_one_club_is_rejected_by_the_database(client, db):
    """一社一帳號:繞過應用層(匯入腳本就是這樣寫)直接 INSERT 也要被 DB 擋下。"""
    import pytest
    from sqlalchemy.exc import IntegrityError

    club, _, _ = await seed(client, db)
    db.add(User(role=UserRole.CLUB, username="dance2", name="熱舞社", club_id=club.id))
    with pytest.raises(IntegrityError):
        await db.flush()
    await db.rollback()


async def test_create_club_account_username_rules(client, db):
    _, _, no_account = await seed(client, db)

    # username 與既有任何帳號(不限角色)衝突 → 409
    resp = await client.post(
        f"{URL}/{no_account.id}/account",
        json={"username": "clubadmin"},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 409
    # 格式不符(比照 /admin/accounts)→ 422
    resp = await client.post(
        f"{URL}/{no_account.id}/account", json={"username": "x"}, headers=csrf_headers(client)
    )
    assert resp.status_code == 422
    # 社團不存在 → 404
    resp = await client.post(
        f"{URL}/99999/account", json={"username": "ghost"}, headers=csrf_headers(client)
    )
    assert resp.status_code == 404


async def test_create_club_account_inactive_club(client, db):
    """停用中社團補建帳號:is_active 跟隨社團=停用,無法登入。"""
    await seed(client, db)
    inactive = await make_club(db, name="桌遊社", is_active=False)

    resp = await client.post(
        f"{URL}/{inactive.id}/account", json={"username": "boardgame"}, headers=csrf_headers(client)
    )
    assert resp.status_code == 201, resp.text
    password = resp.json()["data"]["password"]

    account = await db.scalar(sa.select(User).where(User.username == "boardgame"))
    assert account.is_active is False
    assert (await login(client, "boardgame", password)).status_code == 401


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
    # 預設排序=身份權重(幹部在社員前;與社團端同一實作)
    assert [m["name"] for m in body["data"]] == ["陳予恩", "林小明"]
    rows = (
        await client.get(f"{URL}/{club.id}/members", params={"sort": "-kind"})
    ).json()["data"]
    assert [m["name"] for m in rows] == ["林小明", "陳予恩"]  # kind 排序鍵=身份權重

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

    # 學期下拉的來源:該社名單實際有的學期(新到舊),不含他社的
    body = (await client.get(f"{URL}/{club.id}/members/semesters")).json()
    assert body["data"] == ["114-2", "114-1"]
    assert (await client.get(f"{URL}/99999/members/semesters")).status_code == 404


async def test_defunct_club_null_attribute(client, db):
    """停社社團 attribute=NULL(2026-07-21):列表/選項/詳情不得 500,回 null。"""
    await seed(client, db)
    await make_club(db, name="如來實證", attribute=None, is_active=False)

    rows = (await client.get(URL)).json()["data"]
    defunct = next(r for r in rows if r["name"] == "如來實證")
    assert defunct["attribute"] is None
    assert defunct["is_active"] is False
    assert defunct["kind"] == "社團"  # 結尾非社/會 → 預設社團

    options = (await client.get(f"{URL}/options")).json()["data"]
    assert any(c["name"] == "如來實證" and c["attribute"] is None for c in options)

    detail = (await client.get(f"{URL}/{defunct['id']}")).json()["data"]
    assert detail["attribute"] is None
