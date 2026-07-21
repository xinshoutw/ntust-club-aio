"""2026-07-21 需求方新功能:取消借用、場地不開放規則、單次可借上限、行政手動借用、
過去時間全面禁止(節次時刻表)。"""

from datetime import UTC, date, datetime, time, timedelta

import sqlalchemy as sa

from app.core.semesters import TAIPEI
from app.models import EquipmentLoan, VenueBooking
from app.models.enums import BookingStatus, LoanStatus
from app.services import booking_service
from tests.conftest import csrf_headers, login, make_club, make_user
from tests.test_bookings import make_activity, make_equipment, make_venue

TOMORROW = date.today() + timedelta(days=7)
YESTERDAY = date.today() - timedelta(days=7)


def freeze_taipei(monkeypatch, day: date, hhmm: str) -> datetime:
    """把借用領域時鐘釘在台北時區某日某時刻,節次邊界測試不依賴牆鐘。"""
    hour, minute = (int(x) for x in hhmm.split(":"))
    fixed = datetime.combine(day, time(hour, minute), tzinfo=TAIPEI).astimezone(UTC)
    monkeypatch.setattr(booking_service, "now_utc", lambda: fixed)
    return fixed


async def seed_club(client, db):
    club = await make_club(db)
    await make_user(db, username="club01", club_id=club.id)
    await login(client, "club01")
    return club


async def make_booking(db, club, venue, *, day=TOMORROW, status=BookingStatus.PENDING):
    row = VenueBooking(
        club_id=club.id, venue_id=venue.id, date=day, periods=["3", "4"],
        purpose="社課", status=status,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


async def test_cancel_venue_booking(client, db):
    club = await seed_club(client, db)
    venue = await make_venue(db, allow_temp=True)

    pending = await make_booking(db, club, venue)
    resp = await client.post(
        f"/api/v1/club/venue-bookings/{pending.id}/cancel", headers=csrf_headers(client)
    )
    assert resp.status_code == 200
    await db.refresh(pending)
    assert pending.status == BookingStatus.CANCELLED

    # 已核准且未開始 → 可取消;已開始/過去 → 409
    future = await make_booking(db, club, venue, status=BookingStatus.APPROVED)
    resp = await client.post(
        f"/api/v1/club/venue-bookings/{future.id}/cancel", headers=csrf_headers(client)
    )
    assert resp.status_code == 200
    past = await make_booking(db, club, venue, day=YESTERDAY, status=BookingStatus.APPROVED)
    resp = await client.post(
        f"/api/v1/club/venue-bookings/{past.id}/cancel", headers=csrf_headers(client)
    )
    assert resp.status_code == 409

    # 已退回不可取消;他社的看不到
    rejected = await make_booking(db, club, venue, status=BookingStatus.REJECTED)
    resp = await client.post(
        f"/api/v1/club/venue-bookings/{rejected.id}/cancel", headers=csrf_headers(client)
    )
    assert resp.status_code == 409
    other = await make_club(db, name="吉他社")
    others = await make_booking(db, other, venue)
    resp = await client.post(
        f"/api/v1/club/venue-bookings/{others.id}/cancel", headers=csrf_headers(client)
    )
    assert resp.status_code == 404

    # 取消後同場地同日可重新申請(cancelled 不算重複)
    activity = await make_activity(db, club, day=TOMORROW)
    resp = await client.post(
        "/api/v1/club/venue-bookings",
        json={"venue_id": venue.id, "activity_id": activity.id,
              "date": str(TOMORROW), "periods": ["5"], "purpose": "重新申請",
              "phone": "0912345678"},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["data"]["phone"] == "0912345678"


async def test_cancel_equipment_loan(client, db):
    club = await seed_club(client, db)
    eq = await make_equipment(db)
    loan = EquipmentLoan(
        club_id=club.id, equipment_id=eq.id, activity_id=None, qty=1,
        start_date=TOMORROW, end_date=TOMORROW, purpose="測試",
        status=LoanStatus.APPROVED,
    )
    db.add(loan)
    await db.commit()
    resp = await client.post(
        f"/api/v1/club/equipment-loans/{loan.id}/cancel", headers=csrf_headers(client)
    )
    assert resp.status_code == 200
    await db.refresh(loan)
    assert loan.status == LoanStatus.CANCELLED

    # 已借出不可取消
    out = EquipmentLoan(
        club_id=club.id, equipment_id=eq.id, activity_id=None, qty=1,
        start_date=TOMORROW, end_date=TOMORROW, purpose="測試",
        status=LoanStatus.CHECKED_OUT,
    )
    db.add(out)
    await db.commit()
    resp = await client.post(
        f"/api/v1/club/equipment-loans/{out.id}/cancel", headers=csrf_headers(client)
    )
    assert resp.status_code == 409


async def test_venue_block_rules(client, db):
    club = await seed_club(client, db)
    venue = await make_venue(db, allow_temp=True)
    activity = await make_activity(db, club, day=TOMORROW)
    await make_user(db, username="root", role="admin", is_super=True)
    await make_user(db, username="mgr", role="admin", permissions=["abooking"])

    # 非 super 不可管理規則
    await login(client, "mgr")
    resp = await client.post(
        "/api/v1/admin/venue-rules",
        json={"venue_id": venue.id, "start_date": str(TOMORROW), "end_date": str(TOMORROW),
              "periods": ["3", "4"], "reason": "行政徵用"},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 403

    await login(client, "root")
    resp = await client.post(
        "/api/v1/admin/venue-rules",
        json={"venue_id": venue.id, "start_date": str(TOMORROW), "end_date": str(TOMORROW),
              "periods": ["3", "4"], "reason": "行政徵用"},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 201, resp.text
    rule_id = resp.json()["data"]["id"]

    # 社團申請命中封鎖節次 → 422;避開則可
    await login(client, "club01")
    body = {"venue_id": venue.id, "activity_id": activity.id, "date": str(TOMORROW),
            "periods": ["4", "5"], "purpose": "社課", "phone": "0912000111"}
    resp = await client.post(
        "/api/v1/club/venue-bookings", json=body, headers=csrf_headers(client)
    )
    assert resp.status_code == 422
    resp = await client.post(
        "/api/v1/club/venue-bookings",
        json={**body, "periods": ["5", "6"]},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 201, resp.text

    # 場況圖:封鎖格標 blocked 且蓋過既有佔用
    resp = await client.get(
        "/api/v1/club/bookings/availability", params={"date": str(TOMORROW)}
    )
    cell = resp.json()["data"]["grid"][str(venue.id)]
    assert cell["3"]["status"] == "blocked"
    assert cell["3"]["club"] == "行政徵用"

    # 待審單命中封鎖 → 核准被擋(SLOT_BLOCKED)
    blocked_pending = await make_booking(db, club, venue)  # periods 3,4
    await login(client, "mgr")
    resp = await client.post(
        f"/api/v1/admin/venue-bookings/{blocked_pending.id}/approve",
        headers=csrf_headers(client),
    )
    assert resp.status_code == 409
    assert resp.json()["meta"]["code"] == "SLOT_BLOCKED"

    # 刪除規則後可核准
    await login(client, "root")
    resp = await client.delete(
        f"/api/v1/admin/venue-rules/{rule_id}", headers=csrf_headers(client)
    )
    assert resp.status_code == 200
    await login(client, "mgr")
    resp = await client.post(
        f"/api/v1/admin/venue-bookings/{blocked_pending.id}/approve",
        headers=csrf_headers(client),
    )
    assert resp.status_code == 200, resp.text


async def test_max_lease_count(client, db):
    club = await seed_club(client, db)
    eq = await make_equipment(db, total_qty=10, max_lease_count=2)
    activity = await make_activity(db, club, day=TOMORROW)
    body = {"equipment_id": eq.id, "activity_id": activity.id, "qty": 3,
            "purpose": "活動", "phone": "0912000111"}
    resp = await client.post(
        "/api/v1/club/equipment-loans", json=body, headers=csrf_headers(client)
    )
    assert resp.status_code == 422
    assert "單次至多借用 2 件" in resp.text
    resp = await client.post(
        "/api/v1/club/equipment-loans",
        json={**body, "qty": 2},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 201, resp.text


async def test_manual_bookings_super_only(client, db):
    await make_club(db)  # 佔一個 club id,確認手動借用不掛社團
    await make_user(db, username="root", role="admin", is_super=True)
    await make_user(db, username="mgr", role="admin", permissions=["abooking"])
    venue = await make_venue(db, allow_temp=True)
    eq = await make_equipment(db, total_qty=3)

    await login(client, "mgr")
    resp = await client.post(
        "/api/v1/admin/bookings/manual-venue",
        json={"venue_id": venue.id, "date": str(TOMORROW), "periods": ["1"],
              "purpose": "行政人員活動"},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 403

    await login(client, "root")
    resp = await client.post(
        "/api/v1/admin/bookings/manual-venue",
        json={"venue_id": venue.id, "date": str(TOMORROW), "periods": ["1", "2"],
              "purpose": "行政人員活動"},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()["data"]
    assert data["club_name"] == "學務處"
    assert data["status"] == "approved"

    # 直接核准即佔格:重疊時段再手動借用 → 409
    resp = await client.post(
        "/api/v1/admin/bookings/manual-venue",
        json={"venue_id": venue.id, "date": str(TOMORROW), "periods": ["2"],
              "purpose": "重複"},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 409

    resp = await client.post(
        "/api/v1/admin/bookings/manual-equipment",
        json={"equipment_id": eq.id, "qty": 2, "start_date": str(TOMORROW),
              "end_date": str(TOMORROW), "purpose": "行政活動器材", "phone": "0912000111"},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["data"]["club_name"] == "學務處"

    # 可借數檢核涵蓋行政借用
    resp = await client.post(
        "/api/v1/admin/bookings/manual-equipment",
        json={"equipment_id": eq.id, "qty": 2, "start_date": str(TOMORROW),
              "end_date": str(TOMORROW), "purpose": "超量", "phone": "0912000111"},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 409

    loans = await db.scalars(sa.select(EquipmentLoan))
    assert all(loan.club_id is None for loan in loans)


async def test_active_filter_on_club_lists(client, db):
    """2026-07-21:active=true 僅回正在借用;false 僅回其餘(伺服器端過濾,不整批撈)。"""
    club = await seed_club(client, db)
    venue = await make_venue(db, allow_temp=True)
    future = await make_booking(db, club, venue, status=BookingStatus.APPROVED)
    past = await make_booking(db, club, venue, day=YESTERDAY, status=BookingStatus.APPROVED)
    cancelled = await make_booking(db, club, venue, status=BookingStatus.CANCELLED)

    resp = await client.get("/api/v1/club/venue-bookings", params={"active": "true"})
    ids = {v["id"] for v in resp.json()["data"]}
    assert ids == {future.id}
    resp = await client.get("/api/v1/club/venue-bookings", params={"active": "false"})
    ids = {v["id"] for v in resp.json()["data"]}
    assert ids == {past.id, cancelled.id}

    eq = await make_equipment(db)
    rows = {}
    for key, status in {
        "out": LoanStatus.CHECKED_OUT,
        "ret": LoanStatus.RETURNED,
        "can": LoanStatus.CANCELLED,
    }.items():
        loan = EquipmentLoan(
            club_id=club.id, equipment_id=eq.id, activity_id=None, qty=1,
            start_date=YESTERDAY, end_date=YESTERDAY, purpose="x", status=status,
        )
        db.add(loan)
        await db.commit()
        rows[key] = loan.id
    resp = await client.get("/api/v1/club/equipment-loans", params={"active": "true"})
    assert {row["id"] for row in resp.json()["data"]} == {rows["out"]}
    resp = await client.get("/api/v1/club/equipment-loans", params={"status": "returned"})
    assert {row["id"] for row in resp.json()["data"]} == {rows["ret"]}


# ---- 過去時間全面禁止(2026-07-21,節次時刻表) ----


async def test_venue_booking_rejects_past_date(client, db):
    club = await seed_club(client, db)
    venue = await make_venue(db, allow_temp=True)
    activity = await make_activity(db, club, day=TOMORROW)
    body = {"venue_id": venue.id, "activity_id": activity.id, "date": str(YESTERDAY),
            "periods": ["5"], "purpose": "社課", "phone": "0912000111"}
    resp = await client.post(
        "/api/v1/club/venue-bookings", json=body, headers=csrf_headers(client)
    )
    assert resp.status_code == 422
    assert "早於今天" in resp.json()["error"]


async def test_venue_booking_today_started_period_boundary(client, db, monkeypatch):
    """今天的申請以節次時刻表把關:最早節次起點 ≤ now 即擋;固定時鐘不依賴牆鐘。"""
    club = await seed_club(client, db)
    venue = await make_venue(db, allow_temp=True)
    activity = await make_activity(db, club, day=TOMORROW)
    today = date.today()
    # 釘在今天 12:00(台北):第 3 節(10:20)已開始、第 5 節(12:20)未開始
    freeze_taipei(monkeypatch, today, "12:00")

    body = {"venue_id": venue.id, "activity_id": activity.id, "date": str(today),
            "purpose": "社課", "phone": "0912000111"}
    # 已開始節次(且 periods 無序:最早者為第 3 節)→ 422
    resp = await client.post(
        "/api/v1/club/venue-bookings",
        json={**body, "periods": ["5", "3"]},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 422
    assert "已開始" in resp.json()["error"]
    # 未開始節次 → 201
    resp = await client.post(
        "/api/v1/club/venue-bookings",
        json={**body, "periods": ["5", "6"]},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 201, resp.text

    # 邊界:正好 12:20(第 5 節起點)視為已開始
    freeze_taipei(monkeypatch, today, "12:20")
    resp = await client.post(
        "/api/v1/club/venue-bookings",
        json={**body, "periods": ["5"]},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 422

    # 午夜後、第 1 節(08:10)前:今天全部節次皆可申請
    # (換場地:同社同場地同日已有上面的申請,會先撞重複申請檢核)
    other_venue = await make_venue(db, name="精誠廣場", allow_fixed=False, allow_temp=True)
    freeze_taipei(monkeypatch, today, "00:30")
    resp = await client.post(
        "/api/v1/club/venue-bookings",
        json={**body, "venue_id": other_venue.id, "periods": ["1"]},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 201, resp.text


async def test_equipment_loan_rejects_ended_activity(client, db):
    club = await seed_club(client, db)
    eq = await make_equipment(db)
    ended = await make_activity(
        db, club, day=YESTERDAY - timedelta(days=2), end_day=YESTERDAY
    )
    body = {"equipment_id": eq.id, "activity_id": ended.id, "qty": 1,
            "purpose": "補借", "phone": "0912000111"}
    resp = await client.post(
        "/api/v1/club/equipment-loans", json=body, headers=csrf_headers(client)
    )
    assert resp.status_code == 422
    assert "已結束" in resp.json()["error"]

    # 未結束活動照常可借
    upcoming = await make_activity(db, club, name="未來活動", day=TOMORROW)
    resp = await client.post(
        "/api/v1/club/equipment-loans",
        json={**body, "activity_id": upcoming.id},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 201, resp.text


async def test_phone_character_whitelist(client, db):
    club = await seed_club(client, db)
    venue = await make_venue(db, allow_temp=True)
    activity = await make_activity(db, club, day=TOMORROW)
    body = {"venue_id": venue.id, "activity_id": activity.id, "date": str(TOMORROW),
            "periods": ["5"], "purpose": "x", "phone": "0912-345 678"}  # 空白不合法
    resp = await client.post(
        "/api/v1/club/venue-bookings", json=body, headers=csrf_headers(client)
    )
    assert resp.status_code == 422
    resp = await client.post(
        "/api/v1/club/venue-bookings",
        json={**body, "phone": "(02)2737#123*"},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 201, resp.text
