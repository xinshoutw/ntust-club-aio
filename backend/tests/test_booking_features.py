"""2026-07-21 需求方新功能:取消借用、場地不開放規則、單次可借上限、行政手動借用。"""

from datetime import date, timedelta

import sqlalchemy as sa

from app.models import EquipmentLoan, VenueBooking
from app.models.enums import BookingStatus, LoanStatus
from tests.conftest import csrf_headers, login, make_club, make_user
from tests.test_bookings import make_activity, make_equipment, make_venue

TOMORROW = date.today() + timedelta(days=7)
YESTERDAY = date.today() - timedelta(days=7)


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
