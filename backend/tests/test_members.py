import sqlalchemy as sa

from app.models import ClubMember
from app.models.enums import MemberKind
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
        json={
            "name": "陳大文",
            "student_id": "B11109001",
            "kind": "幹部",
            "title": "總務",
            "semester": "114-2",
        },
        headers=csrf_headers(client),
    )
    assert resp.status_code == 201
    member_id = resp.json()["data"]["id"]

    # 幹部缺職稱 → 422;同學期重複學號 → 409;跨學期同學號 → 允許(名單按學期快照)
    resp = await client.post(
        "/api/v1/club/members",
        json={"name": "李小明", "student_id": "B11109002", "kind": "幹部", "semester": "114-2"},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 422
    resp = await client.post(
        "/api/v1/club/members",
        json={"name": "陳大文", "student_id": "B11109001", "kind": "社員", "semester": "114-2"},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 409
    resp = await client.post(
        "/api/v1/club/members",
        json={"name": "陳大文", "student_id": "B11109001", "kind": "社員", "semester": "114-1"},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 201

    # 行內編輯:改身份為社員 → 職稱保留(2026-07-21 放寬:非幹部亦可有職稱)
    resp = await client.patch(
        f"/api/v1/club/members/{member_id}",
        json={"kind": "社員"},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 200
    assert resp.json()["data"]["title"] == "總務"

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
            json={
                "name": f"社員{i}",
                "student_id": f"B111090{i:02d}",
                "kind": "社員",
                "semester": "114-2",
            },
            headers=csrf_headers(client),
        )
    await client.post(
        "/api/v1/club/members",
        json={"name": "負責人", "student_id": "B11109099", "kind": "負責人", "semester": "114-1"},
        headers=csrf_headers(client),
    )

    resp = await client.get("/api/v1/club/members", params={"page_size": 2, "sort": "-student_id"})
    body = resp.json()
    assert body["meta"]["total"] == 4
    assert len(body["data"]) == 2
    assert body["data"][0]["student_id"] == "B11109099"

    resp = await client.get("/api/v1/club/members", params={"kind": "負責人"})
    assert [m["name"] for m in resp.json()["data"]] == ["負責人"]

    # 學期快照:各學期獨立名單
    resp = await client.get("/api/v1/club/members", params={"semester": "114-1"})
    assert [m["name"] for m in resp.json()["data"]] == ["負責人"]

    resp = await client.get("/api/v1/club/members", params={"sort": "nope"})
    assert resp.status_code == 422


async def test_member_default_order_by_role_weight(client, db):
    """預設排序=身份權重(負責人→副負責人→幹部→社員)、同權重依學號;kind 排序鍵用權重。"""
    club = await setup_club_session(client, db)
    db.add_all(  # 刻意打亂插入序與學號序,驗證非 id 插入序
        [
            ClubMember(club_id=club.id, name="乙社員", student_id="B11109003",
                       kind=MemberKind.MEMBER, semester="114-2"),
            ClubMember(club_id=club.id, name="總務", student_id="B11109002",
                       kind=MemberKind.OFFICER, title="總務", semester="114-2"),
            ClubMember(club_id=club.id, name="副手", student_id="B11109004",
                       kind=MemberKind.VICE_PRESIDENT, semester="114-2"),
            ClubMember(club_id=club.id, name="頭頭", student_id="B11109005",
                       kind=MemberKind.PRESIDENT, semester="114-2"),
            ClubMember(club_id=club.id, name="甲社員", student_id="B11109001",
                       kind=MemberKind.MEMBER, semester="114-2"),
        ]
    )
    await db.commit()

    default = (await client.get("/api/v1/club/members")).json()["data"]
    assert [m["student_id"] for m in default] == [
        "B11109005", "B11109004", "B11109002", "B11109001", "B11109003",
    ]

    # kind 排序=身份權重(非「副負責人/幹部/社員/負責人」字面序):-kind → 社員在前
    resp = await client.get("/api/v1/club/members", params={"sort": "-kind"})
    kinds = [m["kind"] for m in resp.json()["data"]]
    assert kinds == ["社員", "社員", "幹部", "副負責人", "負責人"]

    # 多鍵 kind,student_id 等同預設鏈
    resp = await client.get("/api/v1/club/members", params={"sort": "kind,student_id"})
    assert [m["student_id"] for m in resp.json()["data"]] == [
        m["student_id"] for m in default
    ]


async def test_noop_reimport_keeps_updated_at(client, db):
    """重匯同一份 CSV 不得改動 updated_at(列表顯示的「更新時間」)。"""
    await setup_club_session(client, db)
    csv_text = "陳大文,B11109001,社長\n李小明,B11109002,社員"
    await client.post(
        "/api/v1/club/members/import",
        json={"csv_text": csv_text, "semester": "114-2"},
        headers=csrf_headers(client),
    )
    before = {
        m.student_id: m.updated_at
        for m in await db.scalars(sa.select(ClubMember))
    }

    resp = await client.post(
        "/api/v1/club/members/import",
        json={"csv_text": csv_text, "semester": "114-2"},
        headers=csrf_headers(client),
    )
    result = resp.json()["data"]
    assert (result["created"], result["updated"]) == (0, 0)

    db.expire_all()
    after = {m.student_id: m.updated_at for m in await db.scalars(sa.select(ClubMember))}
    assert after == before

    # 行內編輯送未變值亦不動 updated_at(社長 → 標準身份 負責人)
    member_id = (await client.get("/api/v1/club/members")).json()["data"][0]["id"]
    await client.patch(
        f"/api/v1/club/members/{member_id}",
        json={"kind": "負責人"},
        headers=csrf_headers(client),
    )
    db.expire_all()
    after2 = {m.student_id: m.updated_at for m in await db.scalars(sa.select(ClubMember))}
    assert after2 == before


async def test_csv_import_rejects_oversized_fields(client, db):
    await setup_club_session(client, db)
    resp = await client.post(
        "/api/v1/club/members/import",
        json={"csv_text": f"{'超' * 51},B11109001,社員", "semester": "114-2"},
        headers=csrf_headers(client),
    )
    result = resp.json()["data"]
    assert result["created"] == 0
    assert "長度" in result["errors"][0]


async def test_csv_import_upsert_and_errors(client, db):
    await setup_club_session(client, db)
    await client.post(
        "/api/v1/club/members",
        json={"name": "舊名", "student_id": "B11109001", "kind": "社員", "semester": "114-2"},
        headers=csrf_headers(client),
    )

    csv_text = "\n".join(
        [
            "陳大文,B11109001,社長",  # 既有 → 更新為負責人(顯示詞映射標準身份)
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
        json={"csv_text": csv_text, "semester": "114-2"},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 200
    result = resp.json()["data"]
    assert result["created"] == 2
    assert result["updated"] == 1
    assert len(result["errors"]) == 4

    rows = (await client.get("/api/v1/club/members")).json()["data"]
    by_sid = {m["student_id"]: m for m in rows}
    assert by_sid["B11109001"]["kind"] == "負責人"
    assert by_sid["B11109001"]["title"] is None
    assert by_sid["B11109003"]["title"] == "美宣"


async def test_list_semesters_distinct_desc(client, db):
    """學期下拉:去重、新到舊(曾因 ORDER BY DISTINCT 語法錯誤 500)。"""
    club = await setup_club_session(client, db)
    db.add_all(
        [
            ClubMember(
                club_id=club.id, name=f"社員{i}", student_id=f"B1110900{i}", kind="社員", semester=s
            )
            for i, s in enumerate(["114-1", "114-2", "114-1", "113-2"])
        ]
    )
    await db.commit()

    resp = await client.get("/api/v1/club/members/semesters")
    assert resp.status_code == 200
    assert resp.json()["data"] == ["114-2", "114-1", "113-2"]


async def test_csv_import_strips_bom(client, db):
    """匯出檔前置 UTF-8 BOM(Excel 相容),原樣匯入時首列姓名不得被 BOM 污染。"""
    await setup_club_session(client, db)
    resp = await client.post(
        "/api/v1/club/members/import",
        json={"csv_text": "﻿陳大文,B11109001,社員", "semester": "114-2"},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["created"] == 1

    listing = (await client.get("/api/v1/club/members", params={"semester": "114-2"})).json()
    assert listing["data"][0]["name"] == "陳大文"


async def test_member_phone_and_optional_titles(client, db):
    """2026-07-21:phone 欄位 CRUD + CSV 第 5 欄;非幹部職稱選填可保留。"""
    await setup_club_session(client, db)
    resp = await client.post(
        "/api/v1/club/members",
        json={"name": "陳大文", "student_id": "B11109001", "kind": "社員",
              "title": "顧問", "phone": "0912345678", "semester": "114-2"},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 201
    data = resp.json()["data"]
    assert (data["title"], data["phone"]) == ("顧問", "0912345678")  # 社員可有職稱

    member_id = data["id"]
    resp = await client.patch(
        f"/api/v1/club/members/{member_id}",
        json={"phone": "0987654321"},
        headers=csrf_headers(client),
    )
    assert resp.json()["data"]["phone"] == "0987654321"

    # CSV 第 5 欄=電話;重匯同內容為 no-op(含 phone 比對)
    csv_text = "李小明,B11109002,幹部,總務,0911222333"
    resp = await client.post(
        "/api/v1/club/members/import",
        json={"csv_text": csv_text, "semester": "114-2"},
        headers=csrf_headers(client),
    )
    assert resp.json()["data"]["created"] == 1
    resp = await client.get("/api/v1/club/members", params={"kind": "幹部"})
    assert resp.json()["data"][0]["phone"] == "0911222333"
    resp = await client.post(
        "/api/v1/club/members/import",
        json={"csv_text": csv_text, "semester": "114-2"},
        headers=csrf_headers(client),
    )
    result = resp.json()["data"]
    assert (result["created"], result["updated"]) == (0, 0)
