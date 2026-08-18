"""2026-07-21 需求方新功能:取消借用、場地不開放規則、單次可借上限、行政手動借用、
過去時間全面禁止(節次時刻表)。"""

from datetime import UTC, date, datetime, time, timedelta

import sqlalchemy as sa

from app.core.semesters import TAIPEI, next_semester_range
from app.models import EquipmentLoan, RoomBookingRequest, VenueBooking
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


async def test_active_lists_upcoming_first(client, db):
    """active=true 預設排序=開始日升冪(即將到來在前);false/status= 維持現行降冪(2026-07-21)。"""
    club = await seed_club(client, db)
    venue = await make_venue(db, allow_temp=True)

    # 臨時場地:晚的先建立,驗證非建立序;同日依 id 升冪
    far = await make_booking(db, club, venue, day=TOMORROW + timedelta(days=7),
                             status=BookingStatus.APPROVED)
    near = await make_booking(db, club, venue, day=TOMORROW)
    same_day = await make_booking(db, club, venue, day=TOMORROW + timedelta(days=7))
    resp = await client.get("/api/v1/club/venue-bookings", params={"active": "true"})
    assert [v["id"] for v in resp.json()["data"]] == [near.id, far.id, same_day.id]
    # active=false 維持借用日新到舊
    past_new = await make_booking(db, club, venue, day=YESTERDAY, status=BookingStatus.APPROVED)
    past_old = await make_booking(db, club, venue, day=YESTERDAY - timedelta(days=7),
                                  status=BookingStatus.APPROVED)
    resp = await client.get("/api/v1/club/venue-bookings", params={"active": "false"})
    assert [v["id"] for v in resp.json()["data"]] == [past_new.id, past_old.id]

    # 器材:active=true 起始日升冪;status= 精確過濾維持起始日降冪
    eq = await make_equipment(db)

    def loan(start, end, status=LoanStatus.APPROVED):
        row = EquipmentLoan(club_id=club.id, equipment_id=eq.id, activity_id=None, qty=1,
                            start_date=start, end_date=end, purpose="x", status=status)
        db.add(row)
        return row

    late = loan(TOMORROW + timedelta(days=7), TOMORROW + timedelta(days=8))
    soon = loan(TOMORROW, TOMORROW + timedelta(days=1))
    out = loan(YESTERDAY, YESTERDAY, status=LoanStatus.CHECKED_OUT)
    done_new = loan(TOMORROW, TOMORROW, status=LoanStatus.RETURNED)
    done_old = loan(YESTERDAY, YESTERDAY, status=LoanStatus.RETURNED)
    await db.commit()
    resp = await client.get("/api/v1/club/equipment-loans", params={"active": "true"})
    assert [r["id"] for r in resp.json()["data"]] == [out.id, soon.id, late.id]
    resp = await client.get("/api/v1/club/equipment-loans", params={"status": "returned"})
    assert [r["id"] for r in resp.json()["data"]] == [done_new.id, done_old.id]

    # 固定教室:active=true 開始日升冪(非插入序);已結束者歸 active=false
    sem_b = RoomBookingRequest(club_id=club.id, venue_id=venue.id, purpose="下下學期",
                               start_date=TOMORROW + timedelta(days=60),
                               end_date=TOMORROW + timedelta(days=90))
    sem_a = RoomBookingRequest(club_id=club.id, venue_id=venue.id, purpose="下學期",
                               start_date=TOMORROW, end_date=TOMORROW + timedelta(days=30))
    ended = RoomBookingRequest(club_id=club.id, venue_id=venue.id, purpose="已結束",
                               start_date=YESTERDAY - timedelta(days=30), end_date=YESTERDAY,
                               status=BookingStatus.APPROVED)
    db.add_all([sem_b, sem_a, ended])
    await db.commit()
    resp = await client.get("/api/v1/club/room-bookings", params={"active": "true"})
    assert [r["id"] for r in resp.json()["data"]] == [sem_a.id, sem_b.id]
    resp = await client.get("/api/v1/club/room-bookings", params={"active": "false"})
    assert [r["id"] for r in resp.json()["data"]] == [ended.id]


async def test_venue_active_boundary_and_cancel_at_start_time(client, db, monkeypatch):
    """臨時場地的「正在申請/最近申請」與可否取消都以申請起始時刻分界(2026-07-21)。

    起始時刻=最早節次起點;pending 與 approved 一致——起始時刻一過即移到「最近」且不可取消。
    """
    club = await seed_club(client, db)
    venue = await make_venue(db, allow_temp=True)
    today = date.today()

    started = await make_booking(db, club, venue, day=today, status=BookingStatus.APPROVED)
    # periods 刻意無序:遷移舊資料未排序,「已開始」判斷須全元素比對(最早=第 8 節)
    upcoming = VenueBooking(
        club_id=club.id, venue_id=venue.id, date=today, periods=["9", "8"],
        purpose="夜間排練", status=BookingStatus.PENDING,
    )
    db.add(upcoming)
    await db.commit()
    await db.refresh(upcoming)
    past_pending = await make_booking(db, club, venue, day=YESTERDAY)  # 過去的 pending

    # 釘在今天 12:00(台北):第 3 節(10:20)已開始、第 8 節(15:30)未開始
    freeze_taipei(monkeypatch, today, "12:00")
    resp = await client.get("/api/v1/club/venue-bookings", params={"active": "true"})
    assert {v["id"] for v in resp.json()["data"]} == {upcoming.id}
    resp = await client.get("/api/v1/club/venue-bookings", params={"active": "false"})
    assert {v["id"] for v in resp.json()["data"]} == {started.id, past_pending.id}

    # 已開始(approved)與過去(pending)皆不可取消;未開始(pending)可取消
    for bid in (started.id, past_pending.id):
        resp = await client.post(
            f"/api/v1/club/venue-bookings/{bid}/cancel", headers=csrf_headers(client)
        )
        assert resp.status_code == 409
    resp = await client.post(
        f"/api/v1/club/venue-bookings/{upcoming.id}/cancel", headers=csrf_headers(client)
    )
    assert resp.status_code == 200

    # 邊界:正好 15:30(第 8 節起點)=已開始 → 落到「最近」且不可取消
    late = VenueBooking(
        club_id=club.id, venue_id=venue.id, date=today, periods=["8"],
        purpose="邊界", status=BookingStatus.APPROVED,
    )
    db.add(late)
    await db.commit()
    await db.refresh(late)
    freeze_taipei(monkeypatch, today, "15:30")
    resp = await client.get("/api/v1/club/venue-bookings", params={"active": "true"})
    assert late.id not in {v["id"] for v in resp.json()["data"]}
    resp = await client.post(
        f"/api/v1/club/venue-bookings/{late.id}/cancel", headers=csrf_headers(client)
    )
    assert resp.status_code == 409

    # 午夜剛過(00:10):今天所有節次都未開始 → 全部仍在「正在申請」
    freeze_taipei(monkeypatch, today, "00:10")
    resp = await client.get("/api/v1/club/venue-bookings", params={"active": "true"})
    assert {started.id, late.id} <= {v["id"] for v in resp.json()["data"]}


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


def test_fixed_target_semester_follows_the_intake_window():
    """開放窗跨學期邊界時,同一輪申請必須全部落在同一個(較後面的)學期。

    115-1 學期是 2026-08-01 起,受理期間 7/25–8/5 剛好跨過去:
    照「今天」推導的話 7/28 送的單歸 115-1、8/2 送的單歸 115-2,
    每社 10 節的額度在期間中途重置一次(ISS-33)。
    """
    window = {"open_from": "2026-07-25", "open_until": "2026-08-05"}
    later = (date(2027, 2, 1), date(2027, 7, 31))  # 115-2
    assert booking_service.fixed_target_semester(window, date(2026, 7, 28)) == later
    assert booking_service.fixed_target_semester(window, date(2026, 8, 2)) == later


def test_fixed_target_semester_never_falls_back_to_a_finished_semester():
    """期間已過或未設定就以今天推導 —— 顯示用途不該倒退回一個已結束的學期。"""
    today = date(2027, 3, 1)
    stale = {"open_from": "2026-07-25", "open_until": "2026-08-05"}
    assert booking_service.fixed_target_semester(stale, today) == next_semester_range(today)
    assert booking_service.fixed_target_semester({}, today) == next_semester_range(today)


def test_period_axis_matches_the_frontend_sort_rule():
    """節次軸的順序必須與前端 `lib/periods.periodRank`(數字節在前、字母節在後)一致。

    前端的純轉換函式(把 slots 排成每週時段)拿不到 hook,只能用這條規則排序。
    新增節次時若打破,固定借用的時段顯示會靜默倒過來,而畫面上看不出來。
    """
    rank = lambda k: int(k) if k.isdigit() else 100 + ord(k)  # noqa: E731
    assert list(booking_service.PERIODS) == sorted(booking_service.PERIODS, key=rank)


def test_fixed_window_state_separates_not_yet_from_already_over():
    """「還沒開始」與「已經結束」對使用者是相反的兩句話,不能都講成「未開放」。"""
    window = {"open_from": "2026-09-01", "open_until": "2026-09-15"}
    assert booking_service.fixed_window_state({}, date(2026, 8, 20)) == "unset"
    assert booking_service.fixed_window_state(window, date(2026, 8, 20)) == "upcoming"
    assert booking_service.fixed_window_state(window, date(2026, 9, 1)) == "open"
    assert booking_service.fixed_window_state(window, date(2026, 9, 15)) == "open"
    assert booking_service.fixed_window_state(window, date(2026, 9, 16)) == "closed"
