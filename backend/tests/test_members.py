from datetime import UTC, datetime

import sqlalchemy as sa

from app.models import AuditLog, ClubMember
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
            "intro": "  我們是熱舞社  ",  # 前後空白存進去前修掉
            "website_url": " https://dance.example.com ",
            "discord_webhook_url": "https://discord.com/api/webhooks/123456/abc-DEF_ghi",
            "advisor_name": "王老師",
        },
        headers=csrf_headers(client),
    )
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["intro"] == "我們是熱舞社"
    assert data["website_url"] == "https://dance.example.com"
    assert data["advisor_name"] == "王老師"


async def test_profile_rejects_invalid_or_cleared_fields(client, db):
    await setup_club_session(client, db)
    for payload in (
        {"discord_webhook_url": "https://evil.example.com/webhook"},
        {"website_url": "javascript:alert(1)"},
        # 畫面上必填的欄位,直呼 API 不得清空
        {"intro": ""},
        {"intro": "   "},
        {"website_url": ""},
        {"website_url": None},
        {"advisor_name": ""},
        {"advisor_name": "  "},
        # 承辦人拿這欄寄信,格式要驗
        {"advisor_email": "not-an-email"},
        {"advisor_out_email": "also bad"},
    ):
        resp = await client.patch(
            "/api/v1/club/profile", json=payload, headers=csrf_headers(client)
        )
        assert resp.status_code == 422


async def test_profile_ignores_en_name(client, db):
    """英文名稱由學務處維護:社團端直呼 API 帶這一欄也不會寫進去。"""
    await setup_club_session(client, db)
    resp = await client.patch(
        "/api/v1/club/profile",
        json={
            "intro": "我們是熱舞社",
            "website_url": "https://dance.example.com",
            "en_name": "Dance Club",
        },
        headers=csrf_headers(client),
    )
    assert resp.status_code == 200
    assert resp.json()["data"]["en_name"] is None


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

    # 行內編輯整列送回時學號原封不動:重複學號檢查不得把自己算成重複
    resp = await client.patch(
        f"/api/v1/club/members/{member_id}",
        json={"name": "陳大文", "student_id": "B11109001", "title": "副社長"},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 200
    assert resp.json()["data"]["title"] == "副社長"

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


async def test_member_changes_are_audited(client, db):
    """名單被清空要查得出是誰動的、動到誰。"""
    await setup_club_session(client, db)
    member = {
        "name": "陳大文", "student_id": "B11109001", "kind": "社員", "semester": "114-2",
    }
    created = await client.post("/api/v1/club/members", json=member, headers=csrf_headers(client))
    member_id = created.json()["data"]["id"]

    # 行內編輯 blur 會把整列原封送回,那不是一次異動,不該留下稽核
    await client.patch(
        f"/api/v1/club/members/{member_id}", json=member, headers=csrf_headers(client)
    )
    await client.patch(
        f"/api/v1/club/members/{member_id}", json={"name": "陳大明"}, headers=csrf_headers(client)
    )
    await client.post(
        "/api/v1/club/members/import",
        json={"semester": "114-2", "csv_text": "王小明,B11109002,社員"},
        headers=csrf_headers(client),
    )
    await client.delete(f"/api/v1/club/members/{member_id}", headers=csrf_headers(client))

    imported = await db.scalar(
        sa.select(AuditLog.detail).where(AuditLog.action == "members_imported")
    )
    assert "B11109002" in imported  # 匯入是 upsert,只記數量查不出改了誰

    rows = list(await db.scalars(sa.select(AuditLog).order_by(AuditLog.id)))
    assert [r.action for r in rows if r.action.startswith("member")] == [
        "member_created", "member_updated", "members_imported", "member_deleted",
    ]
    deleted = next(r for r in rows if r.action == "member_deleted")
    assert "B11109001" in deleted.detail and "陳大明" in deleted.detail


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
    """重匯同一份 CSV 回報 0 筆更新,且不動 updated_at(列表顯示的「更新時間」)。"""
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


async def test_csv_import_undoes_formula_neutralizing_quote(client, db):
    """匯出→匯入往返:匯出端補的單引號要脫掉,不然每來回一次多一個。"""
    await setup_club_session(client, db)
    resp = await client.post(
        "/api/v1/club/members/import",
        json={"semester": "114-2", "csv_text": "陳大文,B11109001,幹部,'-總務"},
        headers=csrf_headers(client),
    )
    assert resp.json()["data"]["created"] == 1
    title = await db.scalar(sa.select(ClubMember.title))
    assert title == "-總務"

    # 本來就以 ' 開頭的值沒被中和過,不能跟著被吃掉一個字元
    resp = await client.post(
        "/api/v1/club/members/import",
        json={"semester": "114-2", "csv_text": "'小明,B11109002,社員"},
        headers=csrf_headers(client),
    )
    assert resp.json()["data"]["created"] == 1
    names = list(await db.scalars(sa.select(ClubMember.name)))
    assert "'小明" in names


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


async def test_optional_titles_and_csv_reimport(client, db):
    """非幹部職稱選填可保留;重匯同一份 CSV 是 no-op。

    2026-08-27:名單不再記錄電話,`phone` 連同 CSV 第 5 欄一併移除(D-21)。
    """
    await setup_club_session(client, db)
    resp = await client.post(
        "/api/v1/club/members",
        json={"name": "陳大文", "student_id": "B11109001", "kind": "社員",
              "title": "顧問", "semester": "114-2"},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 201
    data = resp.json()["data"]
    assert data["title"] == "顧問"  # 社員可有職稱
    assert "phone" not in data  # 名單不再帶電話

    # 帶第 5 欄的舊格式仍收得下(多的欄位忽略),但不會存下任何電話
    csv_text = "李小明,B11109002,幹部,總務,0911222333"
    resp = await client.post(
        "/api/v1/club/members/import",
        json={"csv_text": csv_text, "semester": "114-2"},
        headers=csrf_headers(client),
    )
    assert resp.json()["data"]["created"] == 1
    resp = await client.get("/api/v1/club/members", params={"kind": "幹部"})
    assert resp.json()["data"][0]["title"] == "總務"
    resp = await client.post(
        "/api/v1/club/members/import",
        json={"csv_text": csv_text, "semester": "114-2"},
        headers=csrf_headers(client),
    )
    result = resp.json()["data"]
    assert (result["created"], result["updated"]) == (0, 0)


async def test_president_kinds_carry_no_title(client, db):
    """負責人與副負責人不寫職稱(D-27):身份本身就是職稱。

    填了是**捨棄不是退件** —— 承辦貼進來的舊名單有「第十三屆會長」這種寫法,
    不該讓整列進不來。遷移端 `cms_import.member_kind` 同一條規則。
    """
    await setup_club_session(client, db)
    resp = await client.post(
        "/api/v1/club/members",
        json={"name": "陳大文", "student_id": "B11109001", "kind": "負責人",
              "title": "第十三屆會長", "semester": "114-2"},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 201, resp.text
    member_id = resp.json()["data"]["id"]
    assert resp.json()["data"]["title"] is None

    # 事後改成負責人也一樣:原本的職稱要跟著清掉
    resp = await client.post(
        "/api/v1/club/members",
        json={"name": "李小明", "student_id": "B11109002", "kind": "幹部",
              "title": "文書", "semester": "114-2"},
        headers=csrf_headers(client),
    )
    officer_id = resp.json()["data"]["id"]
    resp = await client.patch(
        f"/api/v1/club/members/{officer_id}",
        json={"kind": "副負責人"},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["title"] is None

    # 舊名單的長職稱也不該把整列退掉 —— 那一欄反正不留
    resp = await client.post(
        "/api/v1/club/members/import",
        json={"csv_text": f"長職,B11109009,會長,{'長' * 40}", "semester": "114-2"},
        headers=csrf_headers(client),
    )
    assert resp.json()["data"]["created"] == 1, resp.text

    # CSV 帶職稱的那一列照樣進得來,只是職稱不留
    resp = await client.post(
        "/api/v1/club/members/import",
        json={"csv_text": "王大同,B11109003,社長,副社長&文書", "semester": "114-2"},
        headers=csrf_headers(client),
    )
    assert resp.json()["data"] == {"created": 1, "updated": 0, "errors": []}
    rows = (await client.get("/api/v1/club/members", params={"kind": "負責人"})).json()["data"]
    assert sorted(r["student_id"] for r in rows) == ["B11109001", "B11109003", "B11109009"]
    assert [r["title"] for r in rows] == [None, None, None]
    assert member_id in [r["id"] for r in rows]


async def test_member_list_exposes_join_time_and_sorts_by_it(client, db):
    """入社時間(created_at)是遷移寫進來的入社日期唯一的可見副本(ISS-19):
    行內編輯只動 updated_at,這一欄必須出得來、也排得動。"""
    club = await setup_club_session(client, db)
    old = ClubMember(
        club_id=club.id,
        name="老社員",
        student_id="B10709001",
        kind=MemberKind.MEMBER,
        semester="114-2",
        created_at=datetime(2018, 9, 1, tzinfo=UTC),
    )
    db.add(old)
    await db.commit()
    await client.post(
        "/api/v1/club/members",
        json={"name": "新社員", "student_id": "B11409001", "kind": "社員", "semester": "114-2"},
        headers=csrf_headers(client),
    )

    rows = (await client.get("/api/v1/club/members", params={"sort": "created_at"})).json()["data"]
    assert [r["student_id"] for r in rows] == ["B10709001", "B11409001"]
    assert rows[0]["created_at"].startswith("2018-09-01")

    # 改了值會蓋掉 updated_at,入社時間不受影響
    await client.patch(
        f"/api/v1/club/members/{rows[0]['id']}",
        json={"title": "顧問"},
        headers=csrf_headers(client),
    )
    after = (await client.get("/api/v1/club/members", params={"sort": "created_at"})).json()["data"]
    assert after[0]["created_at"] == rows[0]["created_at"]
    assert after[0]["updated_at"] > rows[0]["updated_at"]
