"""公告系統(2026-07-16 第八輪):管理端 CRUD、驗證、通知收件解析與模板。"""

import sqlalchemy as sa

from app.models import Announcement, AuditLog, Club
from app.services import notify
from tests.conftest import csrf_headers, login, make_club, make_user

URL = "/api/v1/admin/announcements"


async def seed(client, db):
    club = await make_club(db)  # 藝術性
    await make_user(db, username="club01", club_id=club.id)
    await make_user(db, username="announcer", role="admin", permissions=["aannounce"])
    await make_user(db, username="other", role="admin", permissions=["aviol"])
    await login(client, "announcer")
    return club


def body(**overrides) -> dict:
    return {"title": "暑期系統維護公告", "content": "系統將於 **7/20** 維護。", **overrides}


async def test_permission_gate(client, db):
    await seed(client, db)
    await login(client, "other")
    assert (await client.get(URL)).status_code == 403
    resp = await client.post(URL, json=body(), headers=csrf_headers(client))
    assert resp.status_code == 403


async def test_create_validations(client, db):
    club = await seed(client, db)

    # target=attr 時 attrs 非空
    resp = await client.post(
        URL, json=body(target_type="attr", attrs=[]), headers=csrf_headers(client)
    )
    assert resp.status_code == 422

    # 未知性質
    resp = await client.post(
        URL, json=body(target_type="attr", attrs=["神祕性"]), headers=csrf_headers(client)
    )
    assert resp.status_code == 422

    # target=club 時 club 必填且必須存在
    resp = await client.post(URL, json=body(target_type="club"), headers=csrf_headers(client))
    assert resp.status_code == 422
    resp = await client.post(
        URL, json=body(target_type="club", club_id=club.id + 999), headers=csrf_headers(client)
    )
    assert resp.status_code == 422

    # 蓋板勾選時截止日必填
    resp = await client.post(URL, json=body(takeover=True), headers=csrf_headers(client))
    assert resp.status_code == 422


async def test_create_list_delete_with_audit(client, db):
    club = await seed(client, db)

    resp = await client.post(
        URL,
        json=body(target_type="club", club_id=club.id, takeover=True,
                  takeover_until="2026-07-31"),
        headers=csrf_headers(client),
    )
    assert resp.status_code == 201, resp.text
    created = resp.json()["data"]
    assert created["takeover_until"] == "2026-07-31"
    assert created["club_id"] == club.id

    rows = (await client.get(URL)).json()["data"]
    assert rows[0]["title"] == "暑期系統維護公告"
    assert rows[0]["club_name"] == club.name

    # 未勾蓋板時不存截止日
    resp = await client.post(
        URL, json=body(title="無蓋板", takeover_until="2026-08-31"), headers=csrf_headers(client)
    )
    assert resp.json()["data"]["takeover_until"] is None

    resp = await client.delete(f"{URL}/{created['id']}", headers=csrf_headers(client))
    assert resp.status_code == 200
    assert await db.scalar(sa.select(Announcement.id).where(Announcement.id == created["id"])) \
        is None

    actions = set(await db.scalars(sa.select(AuditLog.action)))
    assert {"announcement_created", "announcement_deleted"} <= actions

    # 社團端可見(scope=該社)
    await login(client, "club01")
    titles = [a["title"] for a in (await client.get("/api/v1/club/announcements")).json()["data"]]
    assert "無蓋板" in titles


async def test_notify_resolves_target_recipients(client, db, monkeypatch):
    club = await seed(client, db)
    # 目標社團的聯絡 Email(至多 3 組全寄)與自設 webhook
    await db.execute(
        sa.update(Club)
        .where(Club.id == club.id)
        .values(
            contact_emails=["a@ntust.edu.tw", "b@ntust.edu.tw"],
            discord_webhook_url="https://discord.com/api/webhooks/1/x",
        )
    )
    other = await make_club(db, name="吉他社")  # 無 Email、無 webhook
    await db.commit()

    calls: list[tuple] = []

    async def fake_broadcast(title, content, date, emails, webhooks):
        calls.append((title, emails, webhooks))

    monkeypatch.setattr(notify, "announcement_broadcast", fake_broadcast)

    # notify=false 不觸發
    resp = await client.post(URL, json=body(title="靜默公告"), headers=csrf_headers(client))
    assert resp.status_code == 201
    assert calls == []

    # 全校:兩社都是對象,只有設定了 Email/webhook 的入列
    resp = await client.post(URL, json=body(notify=True), headers=csrf_headers(client))
    assert resp.status_code == 201
    title, emails, webhooks = calls[-1]
    assert title == "暑期系統維護公告"
    assert emails == ["a@ntust.edu.tw", "b@ntust.edu.tw"]
    assert webhooks == ["https://discord.com/api/webhooks/1/x"]

    # 單一社團(無聯絡方式)→ 收件者皆空
    resp = await client.post(
        URL,
        json=body(title="給吉他社", target_type="club", club_id=other.id, notify=True),
        headers=csrf_headers(client),
    )
    _, emails, webhooks = calls[-1]
    assert emails == [] and webhooks == []

    # 依性質:藝術性含熱舞社
    resp = await client.post(
        URL,
        json=body(title="藝術性公告", target_type="attr", attrs=["藝術性"], notify=True),
        headers=csrf_headers(client),
    )
    _, emails, _ = calls[-1]
    assert emails == ["a@ntust.edu.tw", "b@ntust.edu.tw"]


def test_announcement_components_shape():
    """Discord Components V2:flags 1<<15、Container(17)內含 Text Display(10)。"""
    payload = notify.announcement_components("標題", "內容 **粗體**", "2026/07/16")
    assert payload["flags"] == 1 << 15
    container = payload["components"][0]
    assert container["type"] == 17
    text = container["components"][0]
    assert text["type"] == 10
    assert "**標題**" in text["content"]
    assert "內容 **粗體**" in text["content"]
    assert "2026/07/16" in text["content"]


def test_announcement_email_html_escapes_content():
    html = notify.announcement_email_html("維護<公告>", "內容 <b>不渲染</b>", "2026/07/16")
    assert notify.SYSTEM_NAME in html
    assert "維護&lt;公告&gt;" in html
    assert "&lt;b&gt;不渲染&lt;/b&gt;" in html  # markdown 原文以 <pre> 呈現,不當 HTML
    assert "clubs.ntust.edu.tw" in html
