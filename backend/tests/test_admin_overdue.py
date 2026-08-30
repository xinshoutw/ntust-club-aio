"""逾期提醒與停權管理(僅最高權限):remind / suspend / 解除停權。"""

from datetime import date, timedelta

import sqlalchemy as sa

from app.models import Activity, AuditLog, Equipment, EquipmentLoan, User
from app.models.enums import ActivityStatus
from app.services import notify
from tests.conftest import csrf_headers, login, make_club, make_user


async def seed(client, db):
    await make_user(db, username="root", role="admin", is_super=True)
    # abooking 只夠看列表,remind/suspend 仍須最高權限
    await make_user(db, username="bookadmin", role="admin", permissions=["abooking"])
    club = await make_club(
        db, contact_emails=["leader@ntust.edu.tw"],
        discord_webhook_url="https://discord.com/api/webhooks/1/x",
    )
    await login(client, "root")
    return club


async def make_checked_out_loan(db, club, *, status="checked_out", eq_name="帳篷"):
    creator = await db.scalar(sa.select(User.id).order_by(User.id).limit(1))
    activity = Activity(
        club_id=club.id, name="迎新宿營", location="活動中心", type="活動",
        date=date(2026, 3, 10), end_date=date(2026, 3, 10),
        status=ActivityStatus.APPROVED, created_by=creator,
    )
    eq = Equipment(name=eq_name, total_qty=5)
    db.add_all([activity, eq])
    await db.flush()
    today = date.today()
    loan = EquipmentLoan(
        club_id=club.id, equipment_id=eq.id, activity_id=activity.id, qty=2,
        start_date=today - timedelta(days=12), end_date=today - timedelta(days=10),
        purpose="營隊", status=status,
    )
    db.add(loan)
    await db.commit()
    await db.refresh(loan)
    return loan


async def test_super_only(client, db):
    club = await seed(client, db)
    loan = await make_checked_out_loan(db, club)
    await login(client, "bookadmin")

    resp = await client.post(
        f"/api/v1/admin/equipment-loans/{loan.id}/remind", headers=csrf_headers(client)
    )
    assert resp.status_code == 403
    resp = await client.post(
        f"/api/v1/admin/clubs/{club.id}/suspend",
        json={"until": "2099-01-01", "reason": "x"},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 403
    resp = await client.delete(
        f"/api/v1/admin/clubs/{club.id}/suspend", headers=csrf_headers(client)
    )
    assert resp.status_code == 403


async def test_remind_notifies_and_audits(client, db, monkeypatch):
    club = await seed(client, db)
    loan = await make_checked_out_loan(db, club)

    discord_calls: list[tuple] = []
    email_calls: list[tuple] = []

    async def fake_club_event(kind, title, desc, webhook=None):
        discord_calls.append((kind, title, desc, webhook))

    async def fake_send_email(to_addr, subject, body, template="generic", html=None):
        email_calls.append((to_addr, subject, template))

    monkeypatch.setattr(notify, "club_event", fake_club_event)
    monkeypatch.setattr(notify, "send_email", fake_send_email)

    resp = await client.post(
        f"/api/v1/admin/equipment-loans/{loan.id}/remind", headers=csrf_headers(client)
    )
    assert resp.status_code == 200, resp.text

    kind, title, desc, webhook = discord_calls[0]
    assert (kind, title) == ("alert", "器材歸還提醒")
    assert "帳篷 ×2" in desc
    assert "歸還期限" in desc
    assert webhook == "https://discord.com/api/webhooks/1/x"
    to_addr, subject, template = email_calls[0]
    assert to_addr == "leader@ntust.edu.tw"
    assert "器材歸還提醒" in subject
    assert template == "loan_reminder"

    audit_row = await db.scalar(
        sa.select(AuditLog).where(AuditLog.action == "equipment_loan_reminded")
    )
    assert f"equipment_loan={loan.id}" in audit_row.detail

    # 非借出中狀態 → 409;不存在 → 404
    returned = await make_checked_out_loan(db, club, status="returned", eq_name="音響")
    resp = await client.post(
        f"/api/v1/admin/equipment-loans/{returned.id}/remind", headers=csrf_headers(client)
    )
    assert resp.status_code == 409
    assert (
        await client.post("/api/v1/admin/equipment-loans/99999/remind",
                          headers=csrf_headers(client))
    ).status_code == 404


async def test_suspend_and_lift(client, db):
    club = await seed(client, db)
    until = (date.today() + timedelta(days=30)).isoformat()

    # 原因必填;截止日不可早於今天
    resp = await client.post(
        f"/api/v1/admin/clubs/{club.id}/suspend",
        json={"until": until, "reason": "  "},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 422
    resp = await client.post(
        f"/api/v1/admin/clubs/{club.id}/suspend",
        json={"until": "2020-01-01", "reason": "器材逾期未歸還"},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 422

    resp = await client.post(
        f"/api/v1/admin/clubs/{club.id}/suspend",
        json={"until": until, "reason": "器材逾期未歸還"},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["suspended_until"] == until
    await db.refresh(club)
    assert club.suspended_until.isoformat() == until
    assert club.suspend_reason == "器材逾期未歸還"

    # 停權中的社團申請借用會被擋(社團端 CLUB_SUSPENDED 執行點)
    await make_user(db, username="club01", club_id=club.id)
    await login(client, "club01")
    resp = await client.post(
        "/api/v1/club/equipment-loans",
        json={"equipment_id": 1, "activity_id": 1, "qty": 1, "purpose": "x",
              "phone": "0912000111", "start_date": until, "end_date": until},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 403
    assert resp.json()["meta"]["code"] == "CLUB_SUSPENDED"

    # 解除停權:清空欄位;未停權再解除 → 409
    await login(client, "root")
    resp = await client.delete(
        f"/api/v1/admin/clubs/{club.id}/suspend", headers=csrf_headers(client)
    )
    assert resp.status_code == 200
    assert resp.json()["data"]["suspended_until"] is None
    await db.refresh(club)
    assert club.suspended_until is None
    assert club.suspend_reason is None
    resp = await client.delete(
        f"/api/v1/admin/clubs/{club.id}/suspend", headers=csrf_headers(client)
    )
    assert resp.status_code == 409
    assert (
        await client.delete("/api/v1/admin/clubs/99999/suspend", headers=csrf_headers(client))
    ).status_code == 404

    actions = set(await db.scalars(sa.select(AuditLog.action)))
    assert {"club_suspended", "club_suspension_lifted"} <= actions
