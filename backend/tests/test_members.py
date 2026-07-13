import sqlalchemy as sa

from app.models import ClubMember
from tests.conftest import csrf_headers, login, make_club, make_user


async def setup_club_session(client, db, name="熱舞社", username="club01"):
    club = await make_club(db, name=name)
    await make_user(db, username=username, club_id=club.id)
    await login(client, username)
    return club


async def test_profile_get_and_update(client, db):
    await setup_club_session(client, db)
    resp = await client.get("/api/v1/club/profile")
    assert resp.status_code == 200
    assert resp.json()["data"]["name"] == "熱舞社"

    resp = await client.patch(
        "/api/v1/club/profile",
        json={
            "intro": "我們是熱舞社",
            "website_url": "https://dance.example.com",
            "discord_webhook_url": "https://discord.com/api/webhooks/123456/abc-DEF_ghi",
            "advisor_name": "王老師",
        },
        headers=csrf_headers(client),
    )
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["intro"] == "我們是熱舞社"
    assert data["advisor_name"] == "王老師"


async def test_profile_rejects_bad_webhook_and_url(client, db):
    await setup_club_session(client, db)
    for payload in (
        {"discord_webhook_url": "https://evil.example.com/webhook"},
        {"website_url": "javascript:alert(1)"},
    ):
        resp = await client.patch(
            "/api/v1/club/profile", json=payload, headers=csrf_headers(client)
        )
        assert resp.status_code == 422


async def test_member_crud_and_scoping(client, db):
    await setup_club_session(client, db)

    resp = await client.post(
        "/api/v1/club/members",
        json={"name": "陳大文", "student_id": "B11109001", "kind": "幹部", "title": "總務"},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 201
    member_id = resp.json()["data"]["id"]

    # 幹部缺職稱 → 422;重複學號 → 409
    resp = await client.post(
        "/api/v1/club/members",
        json={"name": "李小明", "student_id": "B11109002", "kind": "幹部"},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 422
    resp = await client.post(
        "/api/v1/club/members",
        json={"name": "陳大文", "student_id": "B11109001", "kind": "社員"},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 409

    # 行內編輯:改身份為社員 → 職稱自動清空
    resp = await client.patch(
        f"/api/v1/club/members/{member_id}",
        json={"kind": "社員"},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 200
    assert resp.json()["data"]["title"] is None

    # 他社帳號看不到、也改不到
    other = await make_club(db, name="吉他社")
    await make_user(db, username="club02", club_id=other.id)
    await login(client, "club02")
    assert (await client.get("/api/v1/club/members")).json()["data"] == []
    resp = await client.patch(
        f"/api/v1/club/members/{member_id}",
        json={"name": "駭"},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 404
    assert await db.scalar(sa.select(ClubMember.name).where(ClubMember.id == member_id)) == "陳大文"


async def test_member_list_pagination_filter_sort(client, db):
    await setup_club_session(client, db)
    for i in range(3):
        await client.post(
            "/api/v1/club/members",
            json={"name": f"社員{i}", "student_id": f"B111090{i:02d}", "kind": "社員"},
            headers=csrf_headers(client),
        )
    await client.post(
        "/api/v1/club/members",
        json={"name": "社長", "student_id": "B11109099", "kind": "幹部", "title": "社長"},
        headers=csrf_headers(client),
    )

    resp = await client.get("/api/v1/club/members", params={"page_size": 2, "sort": "-student_id"})
    body = resp.json()
    assert body["meta"]["total"] == 4
    assert len(body["data"]) == 2
    assert body["data"][0]["student_id"] == "B11109099"

    resp = await client.get("/api/v1/club/members", params={"kind": "幹部"})
    assert [m["name"] for m in resp.json()["data"]] == ["社長"]

    resp = await client.get("/api/v1/club/members", params={"sort": "nope"})
    assert resp.status_code == 422


async def test_csv_import_upsert_and_errors(client, db):
    await setup_club_session(client, db)
    await client.post(
        "/api/v1/club/members",
        json={"name": "舊名", "student_id": "B11109001", "kind": "社員"},
        headers=csrf_headers(client),
    )

    csv_text = "\n".join(
        [
            "陳大文,B11109001,社長",  # 既有 → 更新為幹部/社長
            "李小明,B11109002,社員",
            "張美麗,B11109003,幹部,美宣",
            "王強,B11109004,幹部",  # 幹部缺職稱 → error
            "趙六,B11109005,不明身份",  # error
            ",B11109006,社員",  # 姓名空 → error
            "重複,B11109002,社員",  # 檔內重複 → error
        ]
    )
    resp = await client.post(
        "/api/v1/club/members/import",
        json={"csv_text": csv_text},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 200
    result = resp.json()["data"]
    assert result["created"] == 2
    assert result["updated"] == 1
    assert len(result["errors"]) == 4

    rows = (await client.get("/api/v1/club/members")).json()["data"]
    by_sid = {m["student_id"]: m for m in rows}
    assert by_sid["B11109001"]["kind"] == "幹部"
    assert by_sid["B11109001"]["title"] == "社長"
    assert by_sid["B11109003"]["title"] == "美宣"
