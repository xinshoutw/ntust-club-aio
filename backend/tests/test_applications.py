from datetime import date

from app.models import Announcement, MaintenanceRequest, OfficerCertificate, Violation
from app.models.enums import CertPosition
from tests.conftest import csrf_headers, login, make_club, make_user


async def setup_session(client, db, username="club01", name="熱舞社"):
    club = await make_club(db, name=name)
    await make_user(db, username=username, club_id=club.id)
    await login(client, username)
    return club


async def add_member(client, name, sid, kind, title=None, semester="114-2"):
    body = {"name": name, "student_id": sid, "kind": kind, "semester": semester}
    if title:
        body["title"] = title
    resp = await client.post("/api/v1/club/members", json=body, headers=csrf_headers(client))
    assert resp.status_code == 201


async def test_officer_cert_autofills_from_roster(client, db):
    await setup_session(client, db)

    # 名單沒有社長 → 擋
    resp = await client.post(
        "/api/v1/club/officer-certificates",
        json={"term": "114-2", "position": "社長或會長"},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 422

    await add_member(client, "王小明", "B11101001", "負責人")
    resp = await client.post(
        "/api/v1/club/officer-certificates",
        json={"term": "114-2", "position": "社長或會長"},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 201
    assert resp.json()["data"]["applicant_name"] == "王小明"

    # 他學期的負責人不影響本學期比對
    await add_member(client, "張三", "B11101003", "負責人", semester="114-1")
    resp = await client.post(
        "/api/v1/club/officer-certificates",
        json={"term": "114-2", "position": "社長或會長"},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 201

    # 多位同職位 → 擋
    await add_member(client, "李大華", "B11101002", "負責人")
    resp = await client.post(
        "/api/v1/club/officer-certificates",
        json={"term": "114-2", "position": "社長或會長"},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 422

    # 學年期格式
    resp = await client.post(
        "/api/v1/club/officer-certificates",
        json={"term": "114-3", "position": "社長或會長"},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 422


async def test_postal_change_reasons_and_masking(client, db):
    await setup_session(client, db)

    # 不設互斥組合:一次辦好幾件是常態(decisions.md D-07)
    resp = await client.post(
        "/api/v1/club/postal-changes",
        json={
            "reasons": ["更換代理人", "新開戶"],
            "account_name": "熱舞社",
            "account_number": "0001234567890",
        },
        headers=csrf_headers(client),
    )
    assert resp.status_code == 201, resp.text

    # 事由以外全部選填:新開戶當下還沒有帳號可填
    resp = await client.post(
        "/api/v1/club/postal-changes",
        json={"reasons": ["新開戶"]},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["data"]["account_number"] is None

    # 事由本身仍必填,且不得重複
    for bad in ({"reasons": []}, {"reasons": ["新開戶", "新開戶"]}):
        resp = await client.post(
            "/api/v1/club/postal-changes", json=bad, headers=csrf_headers(client)
        )
        assert resp.status_code == 422, bad

    resp = await client.post(
        "/api/v1/club/postal-changes",
        json={
            "reasons": ["更換代理人", "印鑑變更"],
            "account_name": "熱舞社",
            "account_number": "0001234567890",
            "new_agent_name": "陳新人",
            "new_agent_phone": "0912345678",
        },
        headers=csrf_headers(client),
    )
    assert resp.status_code == 201
    data = resp.json()["data"]
    # 2026-07-15 需求方:社團端申請紀錄顯示完整局號帳號(不遮罩);電話仍遮罩末 3 碼
    assert data["account_number"] == "0001234567890"
    assert data["new_agent_phone"].endswith("678")
    assert "*" in data["new_agent_phone"]

    listing = (await client.get("/api/v1/club/postal-changes")).json()["data"]
    assert listing[0]["account_number"] == "0001234567890"


async def test_maintenance_flow(client, db):
    await setup_session(client, db)
    resp = await client.post(
        "/api/v1/club/maintenance",
        json={"location": "社辦 B1", "items": "冷氣不冷、門鎖損壞"},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 201
    assert resp.json()["data"]["status"] == "pending"

    listing = (await client.get("/api/v1/club/maintenance")).json()
    assert listing["meta"]["total"] == 1


async def test_club_application_lists_filter_by_status(client, db):
    """畫面分「正在申請」與「最近完成」兩區:狀態要能在後端篩,不是抓回全部再切。"""
    club = await setup_session(client, db)
    db.add_all(
        [
            MaintenanceRequest(club_id=club.id, location="社辦 B1", items="冷氣", status="pending"),
            MaintenanceRequest(club_id=club.id, location="社辦 B2", items="門鎖", status="done"),
            OfficerCertificate(
                club_id=club.id, term="114-2", position=CertPosition.LEADER,
                applicant_name="王小明", status="pending",
            ),
            OfficerCertificate(
                club_id=club.id, term="114-1", position=CertPosition.LEADER,
                applicant_name="王小明", status="completed",
            ),
        ]
    )
    await db.commit()

    resp = await client.get(
        "/api/v1/club/maintenance", params=[("status", "pending"), ("status", "in_progress")]
    )
    assert [r["location"] for r in resp.json()["data"]] == ["社辦 B1"]
    assert resp.json()["meta"]["total"] == 1

    resp = await client.get(
        "/api/v1/club/officer-certificates", params={"status": "completed", "page_size": 5}
    )
    assert [r["term"] for r in resp.json()["data"]] == ["114-1"]


async def test_violations_scoped_to_club(client, db):
    club = await setup_session(client, db)
    staff = await make_user(db, username="staff01", role="staff")
    other = await make_club(db, name="吉他社")
    db.add(
        Violation(
            club_id=club.id,
            occurred_on=date(2026, 3, 1),
            location="操場",
            items=["未經申請使用場地"],
            filler_id=staff.id,
        )
    )
    db.add(
        Violation(
            club_id=other.id,
            occurred_on=date(2026, 3, 2),
            location="活動中心",
            items=["噪音影響他人"],
            filler_id=staff.id,
        )
    )
    await db.commit()

    listing = (await client.get("/api/v1/club/violations")).json()
    assert listing["meta"]["total"] == 1
    assert listing["data"][0]["location"] == "操場"
    assert listing["data"][0]["status"] == "open"
    # 銷案期限=開立日 +1 個月(推導不儲存);2026-03-01 早已逾期截止
    assert listing["data"][0]["resolve_deadline"] == "2026-04-01"
    assert listing["data"][0]["resolve_expired"] is True


async def test_violations_default_order_open_first_chronological(client, db):
    """預設排序:未銷案在前、組內發生日升冪(與行政端一致;原為 id 降冪)。"""
    club = await setup_session(client, db)
    staff = await make_user(db, username="staff02", role="staff")
    db.add_all(
        [
            Violation(club_id=club.id, occurred_on=date(2026, 3, 1), location="已銷案",
                      items=["噪音影響他人"], filler_id=staff.id,
                      status="resolved", resolve_note="已改善"),
            Violation(club_id=club.id, occurred_on=date(2026, 3, 10), location="晚發生",
                      items=["噪音影響他人"], filler_id=staff.id),
            Violation(club_id=club.id, occurred_on=date(2026, 3, 5), location="早發生",
                      items=["噪音影響他人"], filler_id=staff.id),
        ]
    )
    await db.commit()

    data = (await client.get("/api/v1/club/violations")).json()["data"]
    assert [d["location"] for d in data] == ["早發生", "晚發生", "已銷案"]


async def test_announcements_targeting(client, db):
    club = await setup_session(client, db)  # 熱舞社,attribute=藝術性
    admin = await make_user(db, username="admin01", role="admin")
    other = await make_club(db, name="吉他社")

    db.add_all(
        [
            Announcement(title="全體公告", content="x", target_type="all", created_by=admin.id),
            Announcement(
                title="藝術性公告",
                content="x",
                target_type="attr",
                attrs=["藝術性", "體育性"],  # 性質可多選(2026-07-16 第八輪)
                created_by=admin.id,
            ),
            Announcement(
                title="給熱舞社",
                content="x",
                target_type="club",
                club_id=club.id,
                takeover_until=date(2026, 12, 31),  # 蓋板公告
                created_by=admin.id,
            ),
            Announcement(
                title="給吉他社",
                content="x",
                target_type="club",
                club_id=other.id,
                created_by=admin.id,
            ),
        ]
    )
    await db.commit()

    rows = (await client.get("/api/v1/club/announcements")).json()["data"]
    titles = [a["title"] for a in rows]
    assert titles == ["給熱舞社", "藝術性公告", "全體公告"]
    # 蓋板截止一併給前端(蓋板顯示邏輯在 client)
    assert rows[0]["takeover_until"] == "2026-12-31"
    assert rows[2]["takeover_until"] is None
    assert all(a["dismissed"] is False for a in rows)


async def test_announcement_dismiss(client, db):
    """蓋板「不再顯示」:登記後 dismissed=True(冪等);他社公告 404。"""
    club = await setup_session(client, db)
    admin = await make_user(db, username="admin01", role="admin")
    other = await make_club(db, name="吉他社")

    mine = Announcement(
        title="給熱舞社",
        content="x",
        target_type="club",
        club_id=club.id,
        takeover_until=date(2026, 12, 31),
        created_by=admin.id,
    )
    others = Announcement(
        title="給吉他社", content="x", target_type="club", club_id=other.id, created_by=admin.id
    )
    db.add_all([mine, others])
    await db.commit()

    url = f"/api/v1/club/announcements/{mine.id}/dismiss"
    assert (await client.post(url, headers=csrf_headers(client))).status_code == 200
    # 冪等:重複登記不報錯
    assert (await client.post(url, headers=csrf_headers(client))).status_code == 200

    rows = (await client.get("/api/v1/club/announcements")).json()["data"]
    assert {a["title"]: a["dismissed"] for a in rows} == {"給熱舞社": True}

    # 不可見的公告(指定他社)不得登記
    resp = await client.post(
        f"/api/v1/club/announcements/{others.id}/dismiss", headers=csrf_headers(client)
    )
    assert resp.status_code == 404


async def test_announcement_read_watermark(client, db):
    """鈴鐺已讀:初始全未讀;標記後已讀;之後的新公告再度未讀。"""
    club = await setup_session(client, db)
    admin = await make_user(db, username="admin01", role="admin")
    db.add(Announcement(title="舊公告", content="x", target_type="all", created_by=admin.id))
    await db.commit()

    rows = (await client.get("/api/v1/club/announcements")).json()["data"]
    assert rows[0]["unread"] is True

    resp = await client.post("/api/v1/club/announcements/read", headers=csrf_headers(client))
    assert resp.status_code == 200
    rows = (await client.get("/api/v1/club/announcements")).json()["data"]
    assert rows[0]["unread"] is False

    # 已讀之後的新公告 → 未讀;舊公告維持已讀
    db.add(
        Announcement(
            title="新公告", content="x", target_type="club", club_id=club.id, created_by=admin.id
        )
    )
    await db.commit()
    rows = (await client.get("/api/v1/club/announcements")).json()["data"]
    assert {a["title"]: a["unread"] for a in rows} == {"新公告": True, "舊公告": False}


async def test_maintenance_evidence_capped(client, db, monkeypatch):
    """每筆報修佐證檔上限:超過即 422(防大檔灌爆磁碟)。"""
    from app.api.v1 import applications as app_mod

    await setup_session(client, db)
    resp = await client.post(
        "/api/v1/club/maintenance",
        json={"location": "社辦 B1", "items": "冷氣不冷"},
        headers=csrf_headers(client),
    )
    request_id = resp.json()["data"]["id"]

    monkeypatch.setattr(app_mod, "MAX_EVIDENCE_PER_REQUEST", 1)
    png = b"\x89PNG\r\n\x1a\n" + b"0" * 64
    url = f"/api/v1/club/maintenance/{request_id}/evidence"
    first = await client.post(
        url, files={"file": ("a.png", png, "image/png")}, headers=csrf_headers(client)
    )
    assert first.status_code == 201
    second = await client.post(
        url, files={"file": ("b.png", png + b"1", "image/png")}, headers=csrf_headers(client)
    )
    assert second.status_code == 422


async def test_club_config(client, db):
    """社團端執行組態:上傳上限(依申請性質)+ 經費科目({name, hint})。"""
    await setup_session(client, db)
    data = (await client.get("/api/v1/club/config")).json()["data"]
    ul = data["upload_limits"]
    assert ul["activity_attachment_mb"] == 15
    assert ul["maintenance_mb"] == 100
    assert ul["close_photo_mb"] == 10
    assert ul["img_mb"] == 10 and ul["video_mb"] == 200
    cats = data["budget_categories"]
    assert {"name", "hint"} <= set(cats[0])
    assert any(c["name"] == "保險費" and c["hint"] for c in cats)


async def test_passbook_upload_accepts_pdf_and_image(client, db):
    """存簿佐證收 PDF+影像(2026-07-17 需求方拍板);其他型別仍 415,且一張申請只收一份。"""
    import io

    await setup_session(client, db)

    async def new_change() -> int:
        resp = await client.post(
            "/api/v1/club/postal-changes",
            json={
                "reasons": ["印鑑變更"],
                "account_name": "熱舞社",
                "account_number": "0001234567890",
            },
            headers=csrf_headers(client),
        )
        assert resp.status_code == 201, resp.text
        return resp.json()["data"]["id"]

    async def upload(change_id: int, name: str, body: bytes, mime: str):
        return await client.post(
            f"/api/v1/club/postal-changes/{change_id}/passbook",
            files={"file": (name, io.BytesIO(body), mime)},
            headers=csrf_headers(client),
        )

    jpg = b"\xff\xd8\xff\xe0" + b"\x00" * 64
    first = await new_change()
    pdf = await upload(first, "存簿.pdf", b"%PDF-1.4 minimal", "application/pdf")
    assert pdf.status_code == 201, pdf.text
    assert (await upload(await new_change(), "存簿.jpg", jpg, "image/jpeg")).status_code == 201
    zipped = await upload(await new_change(), "存簿.zip", b"PK\x03\x04zip", "application/zip")
    assert zipped.status_code == 415

    # 一張申請一份:沒有上限的話,任何舊單都能被無限追加 50MB 個資檔
    assert (await upload(first, "又一張.jpg", jpg, "image/jpeg")).status_code == 422


async def test_takeover_announcements_are_not_limited_to_the_first_page(client, db):
    """蓋板不能靠「最新 N 筆」撈:被後續公告擠出第一頁的蓋板照樣要回。"""
    await setup_session(client, db)
    admin = await make_user(db, username="admin01", role="admin")
    db.add(
        Announcement(
            title="蓋板",
            content="x",
            target_type="all",
            takeover_until=date(2026, 12, 31),
            created_by=admin.id,
        )
    )
    db.add_all(
        Announcement(title=f"後續{i}", content="x", target_type="all", created_by=admin.id)
        for i in range(25)
    )
    await db.commit()

    first_page = (await client.get("/api/v1/club/announcements")).json()["data"]
    assert "蓋板" not in [a["title"] for a in first_page]

    rows = (await client.get("/api/v1/club/announcements?takeover=true")).json()["data"]
    assert [a["title"] for a in rows] == ["蓋板"]


async def test_expired_takeover_is_excluded(client, db):
    await setup_session(client, db)
    admin = await make_user(db, username="admin01", role="admin")
    db.add_all(
        [
            Announcement(
                title="已過期",
                content="x",
                target_type="all",
                takeover_until=date(2020, 1, 1),
                created_by=admin.id,
            ),
            Announcement(title="非蓋板", content="x", target_type="all", created_by=admin.id),
        ]
    )
    await db.commit()

    rows = (await client.get("/api/v1/club/announcements?takeover=true")).json()["data"]
    assert rows == []
