"""工讀生端(/staff/*):違規開立/查詢、器材借出/歸還點交、逾期追蹤。"""

from datetime import date, timedelta

import sqlalchemy as sa

from app.models import AuditLog, Equipment, EquipmentLoan, Violation
from app.services import notify
from app.services.violation_service import add_months, today_taipei
from tests.conftest import csrf_headers, login, make_club, make_user


async def seed(client, db):
    staff = await make_user(db, username="pt01", role="staff", name="王工讀")
    club = await make_club(
        db,
        contact_emails=["leader@ntust.edu.tw"],
        discord_webhook_url="https://discord.com/api/webhooks/1/x",
    )
    await login(client, "pt01")
    return staff, club


async def make_loan(
    db,
    club_id,
    *,
    status="approved",
    eq_name="帳篷",
    needs_serial=False,
    qty=2,
    start=None,
    end=None,
    borrower=None,
):
    """借用單工廠:activity_id=None(模型允許;舊系統斷鏈/行政手動借用同形)。"""
    eq = Equipment(name=eq_name, total_qty=10, needs_serial=needs_serial)
    db.add(eq)
    await db.flush()
    today = date.today()
    loan = EquipmentLoan(
        club_id=club_id,
        equipment_id=eq.id,
        activity_id=None,
        qty=qty,
        start_date=start or today,
        end_date=end or (today + timedelta(days=2)),
        purpose="營隊",
        phone="0912-345678",
        status=status,
        borrower_name=borrower,
    )
    db.add(loan)
    await db.commit()
    await db.refresh(loan)
    return loan, eq


def _mute_club_event(monkeypatch):
    calls: list[tuple] = []

    async def fake_club_event(kind, title, desc, webhook=None):
        calls.append((kind, title, desc, webhook))

    monkeypatch.setattr(notify, "club_event", fake_club_event)
    return calls


# ---- 權限 ----


async def test_staff_endpoints_forbidden_for_other_roles(client, db):
    club = await make_club(db)
    await make_user(db, username="club01", role="club", club_id=club.id)
    await make_user(db, username="root", role="admin", is_super=True)
    await make_user(db, username="viewer01", role="viewer")

    for username in ("club01", "root", "viewer01"):
        await login(client, username)
        assert (await client.get("/api/v1/staff/clubs")).status_code == 403
        assert (await client.get("/api/v1/staff/violation-items")).status_code == 403
        assert (await client.get("/api/v1/staff/violations")).status_code == 403
        assert (
            await client.get("/api/v1/staff/equipment-loans", params={"status": "approved"})
        ).status_code == 403
        assert (
            await client.post(
                "/api/v1/staff/violations",
                json={
                    "club_id": club.id,
                    "occurred_on": "2026-01-01",
                    "location": "x",
                    "items": ["其他"],
                },
                headers=csrf_headers(client),
            )
        ).status_code == 403
        assert (
            await client.post(
                "/api/v1/staff/equipment-loans/1/checkout",
                json={"borrower_name": "x"},
                headers=csrf_headers(client),
            )
        ).status_code == 403
        assert (
            await client.post(
                "/api/v1/staff/equipment-loans/1/checkin",
                json={"returner_name": "x"},
                headers=csrf_headers(client),
            )
        ).status_code == 403
        assert (
            await client.post(
                "/api/v1/staff/equipment-loans/1/remind", headers=csrf_headers(client)
            )
        ).status_code == 403


# ---- 基礎資料 ----


async def test_clubs_and_violation_items(client, db):
    _, club = await seed(client, db)
    await make_club(db, name="吉他社")
    await make_club(db, name="攝影社", is_active=False)

    body = (await client.get("/api/v1/staff/clubs")).json()
    rows = body["data"]
    assert {r["name"] for r in rows} == {club.name, "吉他社", "攝影社"}
    by_name = {r["name"]: r for r in rows}
    assert by_name["攝影社"]["is_active"] is False  # 停用社團也列出
    assert by_name["吉他社"]["is_active"] is True

    items = (await client.get("/api/v1/staff/violation-items")).json()["data"]
    assert len(items) == 6  # settings_service DEFAULTS(行政可調)
    assert "其他" in items


# ---- 違規開立與查詢 ----


async def test_file_violation_and_list(client, db, monkeypatch):
    staff, club = await seed(client, db)
    calls = _mute_club_event(monkeypatch)
    occurred = today_taipei() - timedelta(days=3)

    resp = await client.post(
        "/api/v1/staff/violations",
        json={
            "club_id": club.id,
            "occurred_on": occurred.isoformat(),
            "location": "學生活動中心 B1",
            "items": ["噪音影響他人", "場地使用後未復原", "噪音影響他人"],  # 重複自動去重
            "other": "   ",  # 空白視為未填
        },
        headers=csrf_headers(client),
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()["data"]
    assert data["club_name"] == club.name
    assert data["filler_name"] == "王工讀"
    assert data["status"] == "open"
    assert data["items"] == ["噪音影響他人", "場地使用後未復原"]
    assert data["other"] is None
    assert data["resolve_deadline"] == add_months(occurred, 1).isoformat()
    assert data["resolve_expired"] is False

    row = await db.scalar(sa.select(Violation))
    assert row.filler_id == staff.id
    audit_row = await db.scalar(sa.select(AuditLog).where(AuditLog.action == "violation_filed"))
    assert f"violation={row.id}" in audit_row.detail

    kind, title, desc, webhook = calls[0]
    assert (kind, title) == ("alert", "違規勸導開立")
    assert club.name in desc
    assert webhook == "https://discord.com/api/webhooks/1/x"

    # 預設排序:未銷案在前、組內發生日升冪(與行政端一致)
    db.add_all(
        [
            Violation(
                club_id=club.id, occurred_on=occurred - timedelta(days=40), location="器材室",
                items=["其他"], filler_id=staff.id, status="resolved",
            ),
            Violation(
                club_id=club.id, occurred_on=occurred - timedelta(days=10), location="社辦",
                items=["其他"], filler_id=staff.id,
            ),
        ]
    )
    await db.commit()
    body = (await client.get("/api/v1/staff/violations")).json()
    assert body["meta"]["total"] == 3
    assert [(v["status"], v["location"]) for v in body["data"]] == [
        ("open", "社辦"),
        ("open", "學生活動中心 B1"),
        ("resolved", "器材室"),
    ]

    # 排序白名單沿用 admin_violations;未知欄位 422
    resp = await client.get("/api/v1/staff/violations", params={"sort": "-date"})
    assert [v["location"] for v in resp.json()["data"]][0] == "學生活動中心 B1"
    assert (
        await client.get("/api/v1/staff/violations", params={"sort": "nope"})
    ).status_code == 422


async def test_file_violation_validation(client, db):
    _, club = await seed(client, db)
    base = {
        "club_id": club.id,
        "occurred_on": today_taipei().isoformat(),
        "location": "學生活動中心",
        "items": ["其他"],
    }

    ok = await client.post("/api/v1/staff/violations", json=base, headers=csrf_headers(client))
    assert ok.status_code == 201  # 發生日=今天可開立

    future = base | {"occurred_on": (today_taipei() + timedelta(days=1)).isoformat()}
    resp = await client.post("/api/v1/staff/violations", json=future, headers=csrf_headers(client))
    assert resp.status_code == 422

    bad_item = base | {"items": ["不存在的項目"]}
    resp = await client.post(
        "/api/v1/staff/violations", json=bad_item, headers=csrf_headers(client)
    )
    assert resp.status_code == 422

    empty_items = base | {"items": []}
    resp = await client.post(
        "/api/v1/staff/violations", json=empty_items, headers=csrf_headers(client)
    )
    assert resp.status_code == 422

    blank_location = base | {"location": "   "}
    resp = await client.post(
        "/api/v1/staff/violations", json=blank_location, headers=csrf_headers(client)
    )
    assert resp.status_code == 422

    unknown_club = base | {"club_id": 99999}
    resp = await client.post(
        "/api/v1/staff/violations", json=unknown_club, headers=csrf_headers(client)
    )
    assert resp.status_code == 404


# ---- 借用清單與逾期篩選 ----


async def test_loan_lists_and_overdue_filter(client, db):
    _, club = await seed(client, db)
    today = date.today()
    approved, _ = await make_loan(
        db, club.id, eq_name="帳篷",
        start=today + timedelta(days=1), end=today + timedelta(days=3),
    )
    # 行政手動借用(club NULL):club_name 回 None,前端顯示「學務處」
    manual, _ = await make_loan(db, None, eq_name="推車")
    # 借出中未逾期:結束日=今天 → 歸還期限為下一個上班日 10:30(未到)
    checked, _ = await make_loan(
        db, club.id, status="checked_out", eq_name="無線麥克風",
        needs_serial=True, end=today, borrower="陳借用",
    )
    overdue, _ = await make_loan(
        db, club.id, status="checked_out", eq_name="摺疊桌",
        start=today - timedelta(days=12), end=today - timedelta(days=10), borrower="林山友",
    )

    body = (await client.get(
        "/api/v1/staff/equipment-loans", params={"status": "approved"}
    )).json()
    assert body["meta"]["total"] == 2
    by_id = {r["id"]: r for r in body["data"]}
    assert by_id[approved.id]["club_name"] == club.name
    assert by_id[approved.id]["needs_serial"] is False
    assert by_id[manual.id]["club_name"] is None
    assert all(r["overdue"] is False for r in body["data"])

    body = (await client.get(
        "/api/v1/staff/equipment-loans", params={"status": "checked_out"}
    )).json()
    assert body["meta"]["total"] == 2
    # 排序:結束日升冪(應歸還時限單調)→ 逾期單在前
    assert [r["id"] for r in body["data"]] == [overdue.id, checked.id]
    by_id = {r["id"]: r for r in body["data"]}
    assert by_id[checked.id]["needs_serial"] is True
    assert by_id[checked.id]["borrower_name"] == "陳借用"
    assert by_id[checked.id]["overdue"] is False
    assert by_id[overdue.id]["overdue"] is True

    body = (await client.get(
        "/api/v1/staff/equipment-loans", params={"status": "overdue"}
    )).json()
    assert body["meta"]["total"] == 1
    row = body["data"][0]
    assert row["id"] == overdue.id
    assert row["overdue"] is True
    assert row["overdue_deadline"] is not None
    assert row["borrower_name"] == "林山友"

    # status 必填且限白名單
    assert (await client.get("/api/v1/staff/equipment-loans")).status_code == 422
    assert (
        await client.get("/api/v1/staff/equipment-loans", params={"status": "pending"})
    ).status_code == 422


# ---- 借出點交 ----


async def test_checkout_state(client, db, monkeypatch):
    staff, club = await seed(client, db)
    _mute_club_event(monkeypatch)
    loan, _ = await make_loan(db, club.id, eq_name="無線麥克風", needs_serial=True, qty=2)
    url = f"/api/v1/staff/equipment-loans/{loan.id}/checkout"

    # 借用人空白 → 422
    resp = await client.post(
        url, json={"borrower_name": "  "}, headers=csrf_headers(client)
    )
    assert resp.status_code == 422

    # 序號不再由系統記錄:依序點交的器材照樣點交得掉,多送的欄位一律忽略
    resp = await client.post(
        url,
        json={"borrower_name": "陳借用"},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()["data"]
    assert data["status"] == "checked_out"
    assert data["borrower_name"] == "陳借用"
    assert data["club_name"] == club.name
    assert "serials" not in data
    # 借出點交要聯絡得到申請人
    assert data["phone"] == "0912-345678"
    await db.refresh(loan)
    assert loan.checkout_by == staff.id
    assert loan.checkout_at is not None
    audit_row = await db.scalar(
        sa.select(AuditLog).where(AuditLog.action == "equipment_checked_out")
    )
    assert f"equipment_loan={loan.id}" in audit_row.detail

    # 已借出再點交 → 409
    resp = await client.post(
        url,
        json={"borrower_name": "陳借用"},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 409

    # 一般點交
    plain, _ = await make_loan(db, club.id, eq_name="延長線")
    plain_url = f"/api/v1/staff/equipment-loans/{plain.id}/checkout"
    resp = await client.post(
        plain_url, json={"borrower_name": "林領用"}, headers=csrf_headers(client)
    )
    assert resp.status_code == 200

    # 待審單不可點交 → 409;不存在 → 404
    pending, _ = await make_loan(db, club.id, status="pending", eq_name="椅子")
    resp = await client.post(
        f"/api/v1/staff/equipment-loans/{pending.id}/checkout",
        json={"borrower_name": "x"},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 409
    assert (
        await client.post(
            "/api/v1/staff/equipment-loans/99999/checkout",
            json={"borrower_name": "x"},
            headers=csrf_headers(client),
        )
    ).status_code == 404


# ---- 歸還點交 ----


async def test_checkin_flow(client, db, monkeypatch):
    staff, club = await seed(client, db)
    _mute_club_event(monkeypatch)
    loan, _ = await make_loan(
        db, club.id, status="checked_out", eq_name="行動音響", borrower="陳借用"
    )
    url = f"/api/v1/staff/equipment-loans/{loan.id}/checkin"

    resp = await client.post(url, json={"returner_name": "   "}, headers=csrf_headers(client))
    assert resp.status_code == 422

    resp = await client.post(
        url,
        json={"returner_name": " 張歸還 ", "note": "外觀完好"},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["status"] == "returned"
    await db.refresh(loan)
    assert loan.returner_name == "張歸還"
    assert loan.checkin_note == "外觀完好"
    assert loan.checkin_by == staff.id
    assert loan.checkin_at is not None
    audit_row = await db.scalar(
        sa.select(AuditLog).where(AuditLog.action == "equipment_checked_in")
    )
    assert f"equipment_loan={loan.id}" in audit_row.detail

    # 已歸還再點收 → 409;未借出(approved)→ 409;不存在 → 404
    resp = await client.post(url, json={"returner_name": "張歸還"}, headers=csrf_headers(client))
    assert resp.status_code == 409
    approved, _ = await make_loan(db, club.id, eq_name="帳篷")
    resp = await client.post(
        f"/api/v1/staff/equipment-loans/{approved.id}/checkin",
        json={"returner_name": "x"},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 409
    assert (
        await client.post(
            "/api/v1/staff/equipment-loans/99999/checkin",
            json={"returner_name": "x"},
            headers=csrf_headers(client),
        )
    ).status_code == 404


# ---- 逾期提醒(與行政端共用 loan_remind) ----


async def test_staff_remind(client, db, monkeypatch):
    _, club = await seed(client, db)
    today = date.today()
    loan, _ = await make_loan(
        db, club.id, status="checked_out", eq_name="遮陽棚",
        start=today - timedelta(days=12), end=today - timedelta(days=10), borrower="王網球",
    )
    calls = _mute_club_event(monkeypatch)
    emails: list[tuple] = []

    async def fake_send_email(to_addr, subject, body, template="generic", html=None):
        emails.append((to_addr, subject, template))

    monkeypatch.setattr(notify, "send_email", fake_send_email)

    resp = await client.post(
        f"/api/v1/staff/equipment-loans/{loan.id}/remind", headers=csrf_headers(client)
    )
    assert resp.status_code == 200, resp.text
    kind, title, desc, webhook = calls[0]
    assert (kind, title) == ("alert", "器材歸還提醒")
    assert "遮陽棚 ×2" in desc
    assert webhook == "https://discord.com/api/webhooks/1/x"
    assert emails[0] == (
        "leader@ntust.edu.tw", f"【{notify.SYSTEM_NAME}】器材歸還提醒", "loan_reminder"
    )
    audit_row = await db.scalar(
        sa.select(AuditLog).where(AuditLog.action == "equipment_loan_reminded")
    )
    assert audit_row.role == "staff"
    assert f"equipment_loan={loan.id}" in audit_row.detail

    # 僅借出中可提醒;不存在 → 404
    returned, _ = await make_loan(db, club.id, status="returned", eq_name="譜架")
    resp = await client.post(
        f"/api/v1/staff/equipment-loans/{returned.id}/remind", headers=csrf_headers(client)
    )
    assert resp.status_code == 409
    assert (
        await client.post(
            "/api/v1/staff/equipment-loans/99999/remind", headers=csrf_headers(client)
        )
    ).status_code == 404
