"""報名活動管理(2026-07-16 第八輪):建立、列表統計、名單、審核制確認。"""

from datetime import UTC, datetime, timedelta

import sqlalchemy as sa

from app.models import AuditLog, Award, Signup, SignupEntry
from app.models.enums import AwardKind
from tests.conftest import csrf_headers, login, make_club, make_user

URL = "/api/v1/admin/signup-items"


async def seed(client, db):
    club = await make_club(db)
    await make_user(db, username="club01", club_id=club.id)
    await make_user(db, username="regadmin", role="admin", permissions=["areg"])
    await login(client, "regadmin")
    return club


def body(**overrides) -> dict:
    now = datetime.now(UTC)
    base = {
        "name": "社團幹訓",
        "kind": "cadre_training",
        "place": "國際大樓 IB-101",
        "description": "各社團幹部參加",
        "event_at": (now + timedelta(days=30)).isoformat(),
        "signup_end": (now + timedelta(days=14)).isoformat(),
        "max_participants": 5,
        "requires_confirmation": True,
        "fields": [
            {"label": "聯絡電話", "type": "text", "required": True},
            {"label": "膳食需求", "type": "select", "required": True, "options": ["葷", "素"]},
        ],
    }
    return {**base, **overrides}


async def test_create_item_defaults_and_field_keys(client, db):
    await seed(client, db)
    resp = await client.post(URL, json=body(), headers=csrf_headers(client))
    assert resp.status_code == 201, resp.text
    data = resp.json()["data"]

    # 報名開始未帶=今天(現在);欄位順序保留、自動補 key
    assert data["signup_start"] is not None
    assert data["accepting"] is True
    assert [f["label"] for f in data["fields"]] == ["聯絡電話", "膳食需求"]
    assert [f["key"] for f in data["fields"]] == ["f1", "f2"]
    assert data["max_participants"] == 5
    assert data["requires_confirmation"] is True
    assert data["session_based"] is False  # 僅負責人會議為場次制
    assert data["is_eval"] is False

    leader = await client.post(
        URL, json=body(name="負責人會議", kind="leader_meeting"), headers=csrf_headers(client)
    )
    assert leader.json()["data"]["session_based"] is True

    # 競賽報名由建立頁的勾選框決定,沒有它社團端就送不出獎項
    evaluation = await client.post(
        URL, json=body(name="社團競賽報名", is_eval=True), headers=csrf_headers(client)
    )
    assert evaluation.json()["data"]["is_eval"] is True

    assert await db.scalar(
        sa.select(AuditLog.id).where(AuditLog.action == "signup_item_created")
    ) is not None


async def test_registrations_expose_awards_for_eval_items(client, db):
    """學務處要看得出哪個社團報了哪個獎項,否則競賽報名收了資料也用不到。"""
    club = await seed(client, db)
    db.add(Award(id="club", name="最佳社團獎", kind=AwardKind.GROUP))
    await db.commit()
    item_id = (
        await client.post(
            URL, json=body(name="社團競賽報名", is_eval=True), headers=csrf_headers(client)
        )
    ).json()["data"]["id"]

    await login(client, "club01")
    resp = await client.post(
        f"/api/v1/club/signup-items/{item_id}/signup",
        json={
            "participants": [{"answers": {"f1": "0912", "f2": "葷"}}],
            "awards": ["club"],
        },
        headers=csrf_headers(client),
    )
    assert resp.status_code == 201, resp.text

    await login(client, "regadmin")
    regs = (await client.get(f"{URL}/{item_id}/registrations")).json()["data"]
    assert regs[0]["club_id"] == club.id
    assert regs[0]["awards"] == ["最佳社團獎"]


async def test_create_item_validations(client, db):
    await seed(client, db)
    now = datetime.now(UTC)

    # 名額上限必填 ≥1
    resp = await client.post(URL, json=body(max_participants=0), headers=csrf_headers(client))
    assert resp.status_code == 422

    # 報名截止須晚於報名開始
    resp = await client.post(
        URL,
        json=body(
            signup_start=(now + timedelta(days=10)).isoformat(),
            signup_end=(now + timedelta(days=3)).isoformat(),
        ),
        headers=csrf_headers(client),
    )
    assert resp.status_code == 422

    # 選項型欄位須有選項
    resp = await client.post(
        URL,
        json=body(fields=[{"label": "單選", "type": "radio", "options": []}]),
        headers=csrf_headers(client),
    )
    assert resp.status_code == 422

    # 過去時間全面禁止(2026-07-21):活動時間/報名截止不得早於現在
    resp = await client.post(
        URL,
        json=body(event_at=(now - timedelta(days=1)).isoformat()),
        headers=csrf_headers(client),
    )
    assert resp.status_code == 422
    resp = await client.post(
        URL,
        json=body(
            signup_start=(now - timedelta(days=10)).isoformat(),
            signup_end=(now - timedelta(days=3)).isoformat(),
        ),
        headers=csrf_headers(client),
    )
    assert resp.status_code == 422

    # 權限:無 areg 的管理員 → 403
    await make_user(db, username="other", role="admin", permissions=["aact"])
    await login(client, "other")
    resp = await client.post(URL, json=body(), headers=csrf_headers(client))
    assert resp.status_code == 403


async def test_list_with_registration_stats(client, db):
    club = await seed(client, db)
    other = await make_club(db, name="吉他社")
    resp = await client.post(URL, json=body(), headers=csrf_headers(client))
    item_id = resp.json()["data"]["id"]

    s1 = Signup(item_id=item_id, club_id=club.id, confirmed=False)
    s1.entries = [SignupEntry(answers={"f1": "0912"}), SignupEntry(answers={"f1": "0987"})]
    s2 = Signup(item_id=item_id, club_id=other.id, confirmed=True)
    s2.entries = [SignupEntry(answers={"f1": "02-1234"})]
    db.add_all([s1, s2])
    await db.commit()

    rows = (await client.get(URL)).json()["data"]
    row = next(r for r in rows if r["id"] == item_id)
    assert row["clubs_count"] == 2
    assert row["people_count"] == 3
    assert row["pending_count"] == 1

    regs = (await client.get(f"{URL}/{item_id}/registrations")).json()["data"]
    by_club = {r["club_name"]: r for r in regs}
    assert by_club[club.name]["count"] == 2
    assert by_club[club.name]["confirmed"] is False
    assert by_club["吉他社"]["confirmed"] is True
    assert by_club[club.name]["entries"][0]["answers"] == {"f1": "0912"}


async def test_confirm_flow_for_review_based_item(client, db):
    """審核制:社團報名後待確認 → 管理員確認 → 報名成功;重複確認 409。"""
    club = await seed(client, db)
    resp = await client.post(URL, json=body(), headers=csrf_headers(client))
    item = resp.json()["data"]

    # 社團報名(審核制 → 待確認)
    await login(client, "club01")
    resp = await client.post(
        f"/api/v1/club/signup-items/{item['id']}/signup",
        json={"participants": [{"answers": {"f1": "0912", "f2": "素"}}]},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 201, resp.text
    detail = (await client.get(f"/api/v1/club/signup-items/{item['id']}")).json()["data"]
    assert detail["my_status"] == "pending"

    # 確認前不可登錄簽到
    await login(client, "regadmin")
    resp = await client.put(
        f"{URL}/{item['id']}/attendance",
        json={"club_id": club.id, "attended": True},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 409

    # 管理員確認
    confirm_url = f"{URL}/{item['id']}/registrations/{club.id}/confirm"
    resp = await client.put(confirm_url, headers=csrf_headers(client))
    assert resp.status_code == 200
    assert await db.scalar(
        sa.select(AuditLog.id).where(AuditLog.action == "signup_confirmed")
    ) is not None

    # 重複確認 → 409;未報名社團 → 404
    assert (await client.put(confirm_url, headers=csrf_headers(client))).status_code == 409
    ghost = await make_club(db, name="幽靈社")
    resp = await client.put(
        f"{URL}/{item['id']}/registrations/{ghost.id}/confirm", headers=csrf_headers(client)
    )
    assert resp.status_code == 404

    # 社團端狀態變為已報名
    await login(client, "club01")
    detail = (await client.get(f"/api/v1/club/signup-items/{item['id']}")).json()["data"]
    assert detail["my_status"] == "signed"
    assert detail["my_signup"]["confirmed"] is True


async def test_frontend_permission_key_alias(client, db):
    """前端權限彈窗鍵 asignup 與既有 areg 皆可用(鍵名尚未統一)。"""
    await seed(client, db)
    await make_user(db, username="fe_admin", role="admin", permissions=["asignup"])
    await login(client, "fe_admin")
    resp = await client.post(URL, json=body(name="別名鍵活動"), headers=csrf_headers(client))
    assert resp.status_code == 201
    assert (await client.get(URL)).status_code == 200
