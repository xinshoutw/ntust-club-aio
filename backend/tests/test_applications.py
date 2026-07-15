from datetime import date

from app.models import Announcement, Violation
from tests.conftest import csrf_headers, login, make_club, make_user


async def setup_session(client, db, username="club01", name="熱舞社"):
    club = await make_club(db, name=name)
    await make_user(db, username=username, club_id=club.id)
    await login(client, username)
    return club


async def add_member(client, name, sid, kind, title=None):
    body = {"name": name, "student_id": sid, "kind": kind}
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

    await add_member(client, "王小明", "B11101001", "幹部", "社長")
    resp = await client.post(
        "/api/v1/club/officer-certificates",
        json={"term": "114-2", "position": "社長或會長"},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 201
    assert resp.json()["data"]["applicant_name"] == "王小明"

    # 多位同職位 → 擋
    await add_member(client, "李大華", "B11101002", "幹部", "會長")
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


async def test_postal_change_exclusive_reasons_and_masking(client, db):
    await setup_session(client, db)

    # 互斥組合 → 422
    resp = await client.post(
        "/api/v1/club/postal-changes",
        json={
            "reasons": ["更換代理人", "新開戶"],
            "account_name": "熱舞社",
            "account_number": "0001234567890",
        },
        headers=csrf_headers(client),
    )
    assert resp.status_code == 422

    # 更換代理人缺新代理人資料 → 422
    resp = await client.post(
        "/api/v1/club/postal-changes",
        json={
            "reasons": ["更換代理人"],
            "account_name": "熱舞社",
            "account_number": "0001234567890",
        },
        headers=csrf_headers(client),
    )
    assert resp.status_code == 422

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
                target_value="藝術性",
                created_by=admin.id,
            ),
            Announcement(
                title="給熱舞社",
                content="x",
                target_type="club",
                target_value=str(club.id),
                created_by=admin.id,
            ),
            Announcement(
                title="給吉他社",
                content="x",
                target_type="club",
                target_value=str(other.id),
                created_by=admin.id,
            ),
        ]
    )
    await db.commit()

    titles = [a["title"] for a in (await client.get("/api/v1/club/announcements")).json()["data"]]
    assert titles == ["給熱舞社", "藝術性公告", "全體公告"]
