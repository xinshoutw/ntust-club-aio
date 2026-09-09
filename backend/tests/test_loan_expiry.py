"""核准後區間過了沒去領的器材借用:系統自動撤銷(decisions.md D-40)。"""

import asyncio
from datetime import timedelta

import sqlalchemy as sa

from app.models import ApprovalRecord, AuditLog, EquipmentLoan
from app.models.enums import ApprovalDecision, ApprovalSubject
from app.services import loan_expiry, notify
from app.services.booking_service import today_taipei
from tests.conftest import csrf_headers, login, make_user
from tests.test_staff import _mute_club_event, make_loan, seed


async def test_checkout_list_revokes_loans_whose_window_has_passed(client, db, monkeypatch):
    _, club = await seed(client, db)
    calls = _mute_club_event(monkeypatch)
    today = today_taipei()
    expired, _ = await make_loan(
        db, club.id, eq_name="帳篷", start=today - timedelta(days=5), end=today - timedelta(days=1)
    )
    # 結束日當天還算得到領;借出中的單過了結束日是逾期,不是這條路;待審單不歸這條規則(GAP-12)
    last_day, _ = await make_loan(
        db, club.id, eq_name="音響", start=today - timedelta(days=2), end=today
    )
    out, _ = await make_loan(
        db, club.id, eq_name="麥克風", status="checked_out",
        start=today - timedelta(days=5), end=today - timedelta(days=1),
    )
    pending, _ = await make_loan(
        db, club.id, eq_name="投影機", status="pending",
        start=today - timedelta(days=5), end=today - timedelta(days=1),
    )
    # 行政手動借用(club_id 空)是補登入口,區間在過去是常態,不掃
    manual, _ = await make_loan(
        db, None, eq_name="延長線", start=today - timedelta(days=30), end=today - timedelta(days=28)
    )

    listed = (
        await client.get("/api/v1/staff/equipment-loans", params={"status": "approved"})
    ).json()["data"]
    assert [r["id"] for r in listed] == [last_day.id]

    for row in (expired, last_day, out, pending, manual):
        await db.refresh(row)
    assert expired.status == "cancelled"
    assert last_day.status == "approved"
    assert out.status == "checked_out"
    assert pending.status == "pending"
    assert manual.status == "approved"

    # 簽核紀錄:REVOKE、沒有經手人、附原因;稽核記 system 並帶社團
    records = list(await db.scalars(
        sa.select(ApprovalRecord).where(
            ApprovalRecord.subject_type == ApprovalSubject.EQUIPMENT_LOAN
        )
    ))
    assert [(r.subject_id, r.decision, r.actor_id, r.reason) for r in records] == [
        (expired.id, ApprovalDecision.REVOKE, None, loan_expiry.REASON)
    ]
    audit_row = await db.scalar(
        sa.select(AuditLog).where(AuditLog.action == "equipment_loan_expired")
    )
    assert audit_row.role == "system"
    assert f"equipment_loan={expired.id};club={club.id}" in audit_row.detail

    # 推給該社;只推一次
    # 字面值:與承辦手動撤銷的「已被學務處撤銷」分開講,用符號比對等於沒釘住
    assert [(c[1], c[3]) for c in calls] == [("器材借用已自動撤銷", club.discord_webhook_url)]
    assert loan_expiry.REASON in calls[0][2]

    # 再載入一次不會重複撤銷(冪等)
    await client.get("/api/v1/staff/equipment-loans", params={"status": "approved"})
    assert len(calls) == 1


async def test_checkout_list_stays_correct_when_the_sweep_fails(client, db, monkeypatch):
    """掃描壞了不能把櫃台的清單一起打掛:清單自己帶日期界線,過期件照樣不列。"""
    _, club = await seed(client, db)
    today = today_taipei()
    expired, _ = await make_loan(
        db, club.id, eq_name="帳篷", start=today - timedelta(days=5), end=today - timedelta(days=1)
    )
    fresh, _ = await make_loan(
        db, club.id, eq_name="音響", start=today, end=today + timedelta(days=2)
    )

    async def boom(db, *, today=None):
        raise RuntimeError("lock timeout")

    monkeypatch.setattr(loan_expiry, "revoke_unclaimed", boom)
    resp = await client.get("/api/v1/staff/equipment-loans", params={"status": "approved"})
    assert resp.status_code == 200, resp.text
    assert [r["id"] for r in resp.json()["data"]] == [fresh.id]
    await db.refresh(expired)
    assert expired.status == "approved"  # 沒掃到,但也沒列出來


async def test_checkout_refuses_a_loan_whose_window_has_passed(client, db, monkeypatch):
    """昨天開著的點交頁今天按「確認借出」:區間已過的單不該還借得出去。"""
    _, club = await seed(client, db)
    _mute_club_event(monkeypatch)
    today = today_taipei()
    expired, _ = await make_loan(
        db, club.id, start=today - timedelta(days=5), end=today - timedelta(days=1)
    )
    resp = await client.post(
        f"/api/v1/staff/equipment-loans/{expired.id}/checkout",
        json={"borrower_name": "陳借用"},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 409, resp.text
    assert "區間已過" in resp.json()["error"]


async def test_ongoing_lists_do_not_wait_for_the_sweep(client, db):
    """社團「正在借用」與行政「借用中」自己帶日期界線:沒人開點交頁的週末也不會列出過期的已核准。"""
    _, club = await seed(client, db)
    today = today_taipei()
    expired, _ = await make_loan(
        db, club.id, eq_name="帳篷", start=today - timedelta(days=5), end=today - timedelta(days=1)
    )
    fresh, _ = await make_loan(
        db, club.id, eq_name="音響", start=today, end=today + timedelta(days=2)
    )

    await make_user(db, username="club01", role="club", club_id=club.id)
    await login(client, "club01")
    active = (await client.get("/api/v1/club/equipment-loans?active=true")).json()["data"]
    assert [r["id"] for r in active] == [fresh.id]
    ended = (await client.get("/api/v1/club/equipment-loans?active=false")).json()["data"]
    assert [r["id"] for r in ended] == [expired.id]

    await make_user(db, username="bookadmin", role="admin", permissions=["abooking"])
    await login(client, "bookadmin")
    resp = await client.get(f"/api/v1/admin/equipment-loans?club_id={club.id}&active=true")
    rows = resp.json()["data"]
    assert [r["id"] for r in rows] == [fresh.id]


async def test_revoked_loan_shows_the_reason_to_club_and_admin(client, db, monkeypatch):
    _, club = await seed(client, db)
    _mute_club_event(monkeypatch)
    today = today_taipei()
    expired, _ = await make_loan(
        db, club.id, start=today - timedelta(days=3), end=today - timedelta(days=1)
    )
    assert [e.loan_id for e in await loan_expiry.revoke_unclaimed(db)] == [expired.id]

    await make_user(db, username="bookadmin", role="admin", permissions=["abooking"])
    await login(client, "bookadmin")
    rows = (await client.get("/api/v1/admin/equipment-loans?status=cancelled")).json()["data"]
    assert [(r["decision_reason"], r["decided_by"]) for r in rows] == [(loan_expiry.REASON, None)]

    await make_user(db, username="club01", role="club", club_id=club.id)
    await login(client, "club01")
    rows = (await client.get("/api/v1/club/equipment-loans?status=cancelled")).json()["data"]
    assert [r["decision_reason"] for r in rows] == [loan_expiry.REASON]


async def test_two_concurrent_sweeps_revoke_once(client, db):
    """兩條 session 同時掃:後到的一方等鎖釋放後重算條件,拿到 0 列;全庫只有一筆 REVOKE。"""
    from app.core.db import async_session_factory

    _, club = await seed(client, db)
    today = today_taipei()
    loan, _ = await make_loan(
        db, club.id, start=today - timedelta(days=3), end=today - timedelta(days=1)
    )

    async with async_session_factory() as first, async_session_factory() as second:
        # first 先鎖住那一列,second 的 UPDATE 會卡在鎖上
        await first.execute(
            sa.select(EquipmentLoan).where(EquipmentLoan.id == loan.id).with_for_update()
        )
        blocked = asyncio.create_task(loan_expiry.revoke_unclaimed(second, today=today))
        await asyncio.sleep(0.3)
        assert not blocked.done()
        got_first = await loan_expiry.revoke_unclaimed(first, today=today)  # commit 即釋放鎖
        got_second = await asyncio.wait_for(blocked, 5)

    assert [e.loan_id for e in got_first] == [loan.id]
    assert got_second == []
    n = await db.scalar(
        sa.select(sa.func.count()).select_from(ApprovalRecord).where(
            ApprovalRecord.subject_type == ApprovalSubject.EQUIPMENT_LOAN,
            ApprovalRecord.subject_id == loan.id,
        )
    )
    assert n == 1


async def test_notify_expired_routes_by_whether_a_club_can_be_reached(monkeypatch):
    sent: list[tuple] = []

    async def fake_discord(kind, title, desc):
        sent.append(("system", kind, title))

    async def fake_club_event(kind, title, desc, webhook=None):
        sent.append(("club", kind, webhook))

    monkeypatch.setattr(notify, "discord", fake_discord)
    monkeypatch.setattr(notify, "club_event", fake_club_event)
    await loan_expiry.notify_expired([
        loan_expiry.Expired(1, None, False, None, "x"),  # 手動借用
        loan_expiry.Expired(2, 9, False, None, "y"),  # 社團列已不在(K4b 同一條)
        loan_expiry.Expired(3, 7, True, "https://hook", "z"),
    ])
    assert sent == [
        ("system", "alert", loan_expiry.TITLE),
        ("system", "alert", loan_expiry.TITLE),
        ("club", "alert", "https://hook"),  # 沒人審過的單不掛紅色
    ]
