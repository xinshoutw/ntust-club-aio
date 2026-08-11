"""臨時場地與器材借用審核(/admin,權限鍵 abooking)+ 全校單日場況與逾期列表。"""

from datetime import UTC, date, datetime, timedelta

import sqlalchemy as sa

from app.models import (
    Activity,
    ApprovalRecord,
    AuditLog,
    Equipment,
    EquipmentLoan,
    RoomBookingRequest,
    RoomBookingSlot,
    User,
    Venue,
    VenueBlockRule,
    VenueBooking,
)
from app.models.enums import (
    ActivityStatus,
    ApprovalSubject,
    VenueCategory,
)
from tests.conftest import csrf_headers, login, make_club, make_user


async def make_venue(db, name="精誠廣場", *, allow_fixed=False, allow_temp=True):
    venue = Venue(
        name=name, capacity=40, category=VenueCategory.OUTDOOR,
        allow_fixed=allow_fixed, allow_temp=allow_temp,
    )
    db.add(venue)
    await db.commit()
    await db.refresh(venue)
    return venue


async def make_equipment(db, name="帳篷", *, total_qty=5):
    eq = Equipment(name=name, total_qty=total_qty)
    db.add(eq)
    await db.commit()
    await db.refresh(eq)
    return eq


async def make_activity(db, club, *, name="迎新宿營", day=date(2026, 3, 10), end_day=None):
    creator = await db.scalar(sa.select(User.id).order_by(User.id).limit(1))
    activity = Activity(
        club_id=club.id, name=name, location="活動中心", type="活動",
        date=day, end_date=end_day or day, status=ActivityStatus.APPROVED,
        created_by=creator,
    )
    db.add(activity)
    await db.commit()
    await db.refresh(activity)
    return activity


async def seed(client, db):
    await make_user(db, username="bookadmin", role="admin", permissions=["abooking"])
    await make_user(db, username="other", role="admin", permissions=["aviol"])
    club = await make_club(db)
    other_club = await make_club(db, name="吉他社")
    await login(client, "bookadmin")
    return club, other_club


# ---- 場地主檔 ----


async def test_admin_venues_lists_active_only(client, db):
    await seed(client, db)
    venue = await make_venue(db)
    inactive = await make_venue(db, name="停用場地")
    inactive.is_active = False
    await db.commit()

    data = (await client.get("/api/v1/admin/venues")).json()["data"]
    assert [v["id"] for v in data] == [venue.id]
    assert data[0]["name"] == venue.name
    assert data[0]["capacity"] == 40


# ---- 臨時場地借用審核 ----


async def test_venue_permission_gate(client, db):
    club, _ = await seed(client, db)
    await login(client, "other")
    assert (await client.get("/api/v1/admin/venue-bookings")).status_code == 403
    assert (await client.get("/api/v1/admin/venues")).status_code == 403
    resp = await client.post(
        "/api/v1/admin/venue-bookings/1/approve", headers=csrf_headers(client)
    )
    assert resp.status_code == 403
    assert (
        await client.get("/api/v1/admin/bookings/availability", params={"date": "2026-03-05"})
    ).status_code == 403


async def test_venue_list_and_review_flow(client, db):
    club, other_club = await seed(client, db)
    venue = await make_venue(db)
    activity = await make_activity(db, club)

    rows = [
        VenueBooking(club_id=club.id, venue_id=venue.id, activity_id=activity.id,
                     date=date(2026, 3, 7), periods=["3", "4"], purpose="擺攤",
                     status="approved"),
        VenueBooking(club_id=club.id, venue_id=venue.id, activity_id=activity.id,
                     date=date(2026, 3, 5), periods=["5"], purpose="彩排",
                     phone="0912-345678"),
        VenueBooking(club_id=other_club.id, venue_id=venue.id, activity_id=None,
                     date=date(2026, 3, 6), periods=["7"], purpose="社課"),
    ]
    db.add_all(rows)
    await db.commit()
    for row in rows:
        await db.refresh(row)
    approved_row, pending_a, pending_b = rows

    # 預設:待審佇列在前(借用日升冪),含社團/場地/活動名
    data = (await client.get("/api/v1/admin/venue-bookings")).json()["data"]
    assert [d["status"] for d in data] == ["pending", "pending", "approved"]
    assert data[0]["date"] == "2026-03-05"
    assert data[0]["club_name"] == "熱舞社"
    assert data[0]["venue_name"] == "精誠廣場"
    assert data[0]["activity_name"] == "迎新宿營"
    assert data[1]["activity_name"] is None
    # 審核時要聯絡得到申請人(手動借用可不填,故為 None)
    assert data[0]["phone"] == "0912-345678"
    assert data[2]["phone"] is None

    # 過濾與排序白名單
    resp = await client.get("/api/v1/admin/venue-bookings", params={"status": "approved"})
    assert [d["purpose"] for d in resp.json()["data"]] == ["擺攤"]
    resp = await client.get("/api/v1/admin/venue-bookings", params={"club_id": other_club.id})
    assert [d["club_name"] for d in resp.json()["data"]] == ["吉他社"]
    assert (
        await client.get("/api/v1/admin/venue-bookings", params={"sort": "-date"})
    ).status_code == 200
    assert (
        await client.get("/api/v1/admin/venue-bookings", params={"sort": "hack"})
    ).status_code == 422

    # 核准:pending → approved;非待審再核 → 409
    resp = await client.post(
        f"/api/v1/admin/venue-bookings/{pending_a.id}/approve", headers=csrf_headers(client)
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["status"] == "approved"
    resp = await client.post(
        f"/api/v1/admin/venue-bookings/{pending_a.id}/approve", headers=csrf_headers(client)
    )
    assert resp.status_code == 409
    resp = await client.post(
        f"/api/v1/admin/venue-bookings/{approved_row.id}/approve", headers=csrf_headers(client)
    )
    assert resp.status_code == 409

    # 退回:原因必填;寫 approval_records 與 audit
    resp = await client.post(
        f"/api/v1/admin/venue-bookings/{pending_b.id}/reject",
        json={"reason": "  "},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 422
    resp = await client.post(
        f"/api/v1/admin/venue-bookings/{pending_b.id}/reject",
        json={"reason": "場地當日已有校方活動"},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 200
    await db.refresh(pending_b)
    assert pending_b.status == "rejected"

    records = (
        await db.scalars(
            sa.select(ApprovalRecord).where(
                ApprovalRecord.subject_type == ApprovalSubject.VENUE_BOOKING
            )
        )
    ).all()
    assert {(r.subject_id, r.decision.value) for r in records} == {
        (pending_a.id, "approve"),
        (pending_b.id, "reject"),
    }
    assert next(r for r in records if r.subject_id == pending_b.id).reason \
        == "場地當日已有校方活動"
    actions = set(await db.scalars(sa.select(AuditLog.action)))
    assert {"venue_booking_approved", "venue_booking_rejected"} <= actions

    assert (
        await client.post("/api/v1/admin/venue-bookings/99999/approve",
                          headers=csrf_headers(client))
    ).status_code == 404


# ---- 器材借用審核 ----


async def test_equipment_list_review_and_availability_info(client, db):
    club, _ = await seed(client, db)
    eq = await make_equipment(db, total_qty=5)
    activity = await make_activity(db, club)

    window = dict(start_date=date(2026, 3, 6), end_date=date(2026, 3, 13))
    rows = [
        EquipmentLoan(club_id=club.id, equipment_id=eq.id, activity_id=activity.id,
                      qty=3, purpose="營隊", status="approved", **window),
        EquipmentLoan(club_id=club.id, equipment_id=eq.id, activity_id=activity.id,
                      qty=3, purpose="加借", **window),
    ]
    db.add_all(rows)
    await db.commit()
    for row in rows:
        await db.refresh(row)
    approved_loan, pending_loan = rows

    data = (await client.get("/api/v1/admin/equipment-loans")).json()["data"]
    assert [d["status"] for d in data] == ["pending", "approved"]  # 待審在前
    pending_out = data[0]
    assert pending_out["club_name"] == "熱舞社"
    assert pending_out["equipment_name"] == "帳篷"
    assert pending_out["activity_name"] == "迎新宿營"
    assert pending_out["start_date"] == "2026-03-06"
    # 審核檢核:區間可借數排除本單=總數 5 − 已核准 3 = 2(本單要 3 → 前端紅字警示)
    assert pending_out["available_excluding_self"] == 2
    assert data[1]["available_excluding_self"] is None  # 非待審不推導

    # 排序白名單
    assert (
        await client.get("/api/v1/admin/equipment-loans", params={"sort": "club"})
    ).status_code == 200
    assert (
        await client.get("/api/v1/admin/equipment-loans", params={"sort": "hack"})
    ).status_code == 422

    # 可借數不足仍可核准(管理員裁量);非待審 → 409
    resp = await client.post(
        f"/api/v1/admin/equipment-loans/{pending_loan.id}/approve", headers=csrf_headers(client)
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["status"] == "approved"
    resp = await client.post(
        f"/api/v1/admin/equipment-loans/{pending_loan.id}/approve", headers=csrf_headers(client)
    )
    assert resp.status_code == 409

    # 退回:原因必填
    another = EquipmentLoan(club_id=club.id, equipment_id=eq.id, activity_id=activity.id,
                            qty=1, purpose="再借", **window)
    db.add(another)
    await db.commit()
    await db.refresh(another)
    resp = await client.post(
        f"/api/v1/admin/equipment-loans/{another.id}/reject",
        json={},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 422
    resp = await client.post(
        f"/api/v1/admin/equipment-loans/{another.id}/reject",
        json={"reason": "可借數不足"},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 200
    await db.refresh(another)
    assert another.status == "rejected"
    actions = set(await db.scalars(sa.select(AuditLog.action)))
    assert {"equipment_loan_approved", "equipment_loan_rejected"} <= actions

    # 權限:無 abooking → 403
    await login(client, "other")
    assert (await client.get("/api/v1/admin/equipment-loans")).status_code == 403
    resp = await client.post(
        f"/api/v1/admin/equipment-loans/{approved_loan.id}/reject",
        json={"reason": "x"},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 403


async def test_equipment_overdue_filter(client, db):
    """逾期=推導:checked_out 且過了結束日之隔天上班日 10:30。"""
    club, _ = await seed(client, db)
    eq = await make_equipment(db, name="麥克風", total_qty=9)
    activity = await make_activity(db, club)
    today = datetime.now(UTC).date()

    rows = [
        # 結束日 10 天前仍未歸還 → 逾期
        EquipmentLoan(club_id=club.id, equipment_id=eq.id, activity_id=activity.id, qty=1,
                      start_date=today - timedelta(days=12), end_date=today - timedelta(days=10),
                      purpose="逾期單", status="checked_out"),
        # 結束日在未來 → 未逾期
        EquipmentLoan(club_id=club.id, equipment_id=eq.id, activity_id=activity.id, qty=1,
                      start_date=today, end_date=today + timedelta(days=5),
                      purpose="借出中", status="checked_out"),
        # 已歸還 → 不列入
        EquipmentLoan(club_id=club.id, equipment_id=eq.id, activity_id=activity.id, qty=1,
                      start_date=today - timedelta(days=12), end_date=today - timedelta(days=10),
                      purpose="已歸還", status="returned"),
        # 同起日但結束日更早 → 逾越更久,逾期追蹤排最前(end_date 升冪,非起日/插入序)
        EquipmentLoan(club_id=club.id, equipment_id=eq.id, activity_id=activity.id, qty=1,
                      start_date=today - timedelta(days=12), end_date=today - timedelta(days=11),
                      purpose="更逾期", status="checked_out"),
    ]
    db.add_all(rows)
    await db.commit()

    data = (
        await client.get("/api/v1/admin/equipment-loans", params={"status": "overdue"})
    ).json()["data"]
    assert [d["purpose"] for d in data] == ["更逾期", "逾期單"]
    assert data[0]["overdue"] is True

    # 一般狀態篩選照舊;未知狀態 → 422
    data = (
        await client.get("/api/v1/admin/equipment-loans", params={"status": "checked_out"})
    ).json()["data"]
    assert {d["purpose"] for d in data} == {"逾期單", "借出中", "更逾期"}
    assert (
        await client.get("/api/v1/admin/equipment-loans", params={"status": "hack"})
    ).status_code == 422


# ---- 全校單日場況 ----


async def test_admin_availability_grid_with_booking_ids(client, db):
    club, other_club = await seed(client, db)
    venue = await make_venue(db)
    fixed_venue = await make_venue(db, name="S304", allow_fixed=True, allow_temp=False)
    activity = await make_activity(db, club)
    day = date(2026, 3, 5)  # 週四(isoweekday=4)

    pending = VenueBooking(club_id=club.id, venue_id=venue.id, activity_id=activity.id,
                           date=day, periods=["3"], purpose="彩排")
    approved = VenueBooking(club_id=other_club.id, venue_id=venue.id, activity_id=None,
                            date=day, periods=["7"], purpose="社課", status="approved")
    # 目標學期起訖涵蓋查詢日,場況才會顯示(2026-07-17:固定借用僅在學期內佔格)
    fixed = RoomBookingRequest(club_id=other_club.id, venue_id=fixed_venue.id,
                               purpose="社課", status="approved",
                               start_date=date(2026, 2, 1), end_date=date(2026, 7, 31))
    fixed.slots = [RoomBookingSlot(weekday=4, period="5")]
    db.add_all([pending, approved, fixed])
    await db.commit()
    await db.refresh(pending)

    grid = (
        await client.get("/api/v1/admin/bookings/availability", params={"date": "2026-03-05"})
    ).json()["data"]["grid"]
    # 待審單帶申請 id(供點格開審核彈窗);已核准格只有社團名。kind 區分臨時/固定
    assert grid[str(venue.id)]["3"] == {
        "status": "pending",
        "club": club.name,
        "pending": [{"id": pending.id, "club": club.name, "kind": "temp"}],
    }
    assert grid[str(venue.id)]["7"] == {
        "status": "temp",
        "club": other_club.name,
        "pending": [],
    }
    assert grid[str(fixed_venue.id)]["5"] == {
        "status": "fixed",
        "club": other_club.name,
        "pending": [],
    }

    # 審核中的固定借用也要標,否則承辦核准臨時借用時那格是空白的(點不了,要到 /admin/rooms 審)
    pending_fixed = RoomBookingRequest(
        club_id=club.id, venue_id=fixed_venue.id, purpose="待審社課",
        start_date=date(2026, 2, 1), end_date=date(2026, 7, 31),
    )
    pending_fixed.slots = [RoomBookingSlot(weekday=4, period="6")]
    db.add(pending_fixed)
    await db.commit()
    grid = (
        await client.get("/api/v1/admin/bookings/availability", params={"date": "2026-03-05"})
    ).json()["data"]["grid"]
    assert grid[str(fixed_venue.id)]["6"] == {
        "status": "pending",
        "club": club.name,
        "pending": [{"id": None, "club": club.name, "kind": "fixed"}],
    }

    # 不同星期:固定借用不佔用
    grid = (
        await client.get("/api/v1/admin/bookings/availability", params={"date": "2026-03-06"})
    ).json()["data"]["grid"]
    assert str(fixed_venue.id) not in grid

    # 日期必填/格式驗證
    assert (
        await client.get("/api/v1/admin/bookings/availability", params={"date": "bad"})
    ).status_code == 422


async def test_admin_grid_lists_every_pending_in_a_cell(client, db):
    """一格多筆待審:已核准蓋過審核中之後仍點得到底下的待審單,兩社搶同一格也兩筆都在。"""
    club, other_club = await seed(client, db)
    venue = await make_venue(db)
    activity = await make_activity(db, club)
    day = date(2026, 3, 5)

    def booking(owner, periods, status="pending", *, id=None):
        return VenueBooking(id=id, club_id=owner.id, venue_id=venue.id, activity_id=activity.id,
                            date=day, periods=periods, purpose="彩排", status=status)

    # 指定 id 並讓寫入順序與 id 順序相反,盡量讓「拿掉 ORDER BY」現形。
    # 但這條斷言測不出排序被拿掉:小表的回傳順序由 planner 決定(實測 join clubs 之後
    # 剛好又回到 id 序),要真正壓出反序得操縱執行計畫,不值得。斷言留著是為了釘住契約
    # ——「同一格多筆待審時,格色與 pending 順序照送件序」——ORDER BY 別在重構時被順手刪掉
    second = booking(other_club, ["5"], id=20)
    approved = booking(other_club, ["3"], "approved", id=30)
    first = booking(club, ["3", "5"], id=10)
    for row in (second, approved, first):
        db.add(row)
        await db.commit()

    grid = (
        await client.get("/api/v1/admin/bookings/availability", params={"date": "2026-03-05"})
    ).json()["data"]["grid"]
    # 格色是已核准的,但被蓋掉的待審單仍在 pending —— 承辦點得到、也看得到是誰的
    assert grid[str(venue.id)]["3"] == {
        "status": "temp",
        "club": other_club.name,
        "pending": [{"id": first.id, "club": club.name, "kind": "temp"}],
    }
    # 兩社搶同一格:兩筆都要點得到,順序依 id(不隨 PG 回傳順序變動)
    assert grid[str(venue.id)]["5"] == {
        "status": "pending",
        "club": club.name,
        "pending": [
            {"id": first.id, "club": club.name, "kind": "temp"},
            {"id": second.id, "club": other_club.name, "kind": "temp"},
        ],
    }

    # 行政手動借用沒有社團(club_id NULL),格上顯示「學務處」
    db.add(VenueBooking(club_id=None, venue_id=venue.id, activity_id=None, date=day,
                        periods=["7"], purpose="場地整理", status="approved"))
    # 不開放規則蓋掉格色,但底下壓著的待審單要留著(承辦要看得到「這張得退掉」)
    admin_id = await db.scalar(sa.select(User.id).order_by(User.id).limit(1))
    db.add(VenueBlockRule(venue_id=venue.id, start_date=day, end_date=day,
                          weekdays=[], periods=["3"], reason="行政徵用", created_by=admin_id))
    await db.commit()

    grid = (
        await client.get("/api/v1/admin/bookings/availability", params={"date": "2026-03-05"})
    ).json()["data"]["grid"]
    assert grid[str(venue.id)]["7"] == {"status": "temp", "club": "學務處", "pending": []}
    assert grid[str(venue.id)]["3"] == {
        "status": "blocked",
        "club": "行政徵用",
        "pending": [{"id": first.id, "club": club.name, "kind": "temp"}],
    }


# ---- 核准衝突/可借數硬性檢核(2026-07-17 第十二輪) ----


async def test_venue_approve_blocks_approved_overlap(client, db):
    """核准前檢核:同場地同日已有核准單佔用重疊節次 → 409;不重疊照常核准。"""
    club, other_club = await seed(client, db)
    venue = await make_venue(db)
    rows = [
        VenueBooking(club_id=club.id, venue_id=venue.id, activity_id=None,
                     date=date(2026, 3, 7), periods=["3", "4"], purpose="擺攤",
                     status="approved"),
        VenueBooking(club_id=other_club.id, venue_id=venue.id, activity_id=None,
                     date=date(2026, 3, 7), periods=["4", "5"], purpose="社課"),
        VenueBooking(club_id=other_club.id, venue_id=venue.id, activity_id=None,
                     date=date(2026, 3, 7), periods=["6"], purpose="彩排"),
    ]
    db.add_all(rows)
    await db.commit()
    for row in rows:
        await db.refresh(row)
    _, overlap, free = rows

    resp = await client.post(
        f"/api/v1/admin/venue-bookings/{overlap.id}/approve", headers=csrf_headers(client)
    )
    assert resp.status_code == 409
    assert resp.json()["meta"]["code"] == "SLOT_TAKEN"

    resp = await client.post(
        f"/api/v1/admin/venue-bookings/{free.id}/approve", headers=csrf_headers(client)
    )
    assert resp.status_code == 200



async def test_temp_and_fixed_approval_cross_check(client, db):
    """臨時與固定搶的是同一間場地:兩邊核准必須互相檢核。

    原本臨時只查臨時、固定只查固定,DB 也沒有兜底約束,同一格可被雙重核准。
    """
    club, other_club = await seed(client, db)
    venue = await make_venue(db, name="S304", allow_fixed=True, allow_temp=True)
    activity = await make_activity(db, club, day=date.today() + timedelta(days=40))
    day = date.today() + timedelta(days=40)

    fixed = RoomBookingRequest(
        club_id=other_club.id,
        venue_id=venue.id,
        purpose="樂團練習",
        status="approved",
        start_date=day - timedelta(days=10),
        end_date=day + timedelta(days=10),
    )
    fixed.slots = [RoomBookingSlot(weekday=day.isoweekday(), period="3")]
    booking = VenueBooking(
        club_id=club.id,
        venue_id=venue.id,
        activity_id=activity.id,
        date=day,
        periods=["3"],
        purpose="擺攤",
    )
    db.add_all([fixed, booking])
    await db.commit()
    await db.refresh(booking)

    resp = await client.post(
        f"/api/v1/admin/venue-bookings/{booking.id}/approve", headers=csrf_headers(client)
    )
    assert resp.status_code == 409
    assert resp.json()["meta"]["code"] == "SLOT_TAKEN"

    # 反向:已核准的單日臨時借用同樣擋得下整學期的固定借用
    await make_user(db, username="roomadmin", role="admin", permissions=["aroom"])
    fixed.status = "cancelled"
    booking.status = "approved"
    pending_fixed = RoomBookingRequest(
        club_id=other_club.id,
        venue_id=venue.id,
        purpose="想借整學期",
        start_date=day - timedelta(days=10),
        end_date=day + timedelta(days=10),
    )
    pending_fixed.slots = [RoomBookingSlot(weekday=day.isoweekday(), period="3")]
    db.add(pending_fixed)
    await db.commit()
    await db.refresh(pending_fixed)

    await login(client, "roomadmin")
    resp = await client.post(
        f"/api/v1/admin/room-bookings/{pending_fixed.id}/approve", headers=csrf_headers(client)
    )
    assert resp.status_code == 409, resp.text
    assert resp.json()["meta"]["code"] == "SLOT_TAKEN"


async def test_revoke_approved_venue_booking_and_stale_loan(client, db):
    club, _ = await seed(client, db)
    venue = await make_venue(db)
    equipment = await make_equipment(db)
    activity = await make_activity(db, club, day=date.today() + timedelta(days=20))
    day = date.today() + timedelta(days=20)

    booking = VenueBooking(
        club_id=club.id, venue_id=venue.id, activity_id=activity.id,
        date=day, periods=["5"], purpose="擺攤", status="approved",
    )
    # 「核准後沒來領」:區間已過但仍卡在待借出清單,必須清得掉
    loan = EquipmentLoan(
        club_id=club.id, equipment_id=equipment.id, activity_id=activity.id, qty=1,
        start_date=date.today() - timedelta(days=30),
        end_date=date.today() - timedelta(days=25),
        purpose="上個月核准沒來領", status="approved",
    )
    db.add_all([booking, loan])
    await db.commit()
    await db.refresh(booking)
    await db.refresh(loan)

    base = "/api/v1/admin"
    assert (
        await client.post(
            f"{base}/venue-bookings/{booking.id}/revoke", json={}, headers=csrf_headers(client)
        )
    ).status_code == 422  # 原因必填

    resp = await client.post(
        f"{base}/venue-bookings/{booking.id}/revoke",
        json={"reason": "場地整修"},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 200, resp.text
    resp = await client.post(
        f"{base}/equipment-loans/{loan.id}/revoke",
        json={"reason": "逾期未領"},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 200, resp.text

    await db.refresh(booking)
    await db.refresh(loan)
    assert booking.status.value == "cancelled"
    assert loan.status.value == "cancelled"
    assert await db.scalar(
        sa.select(AuditLog.id).where(AuditLog.action == "venue_booking_revoked")
    ) is not None
    assert await db.scalar(
        sa.select(ApprovalRecord.id).where(
            ApprovalRecord.subject_type == ApprovalSubject.EQUIPMENT_LOAN,
            ApprovalRecord.decision == "revoke",
        )
    ) is not None

    # 已借出的要走歸還,不是撤銷
    loan.status = "checked_out"
    await db.commit()
    assert (
        await client.post(
            f"{base}/equipment-loans/{loan.id}/revoke",
            json={"reason": "x"},
            headers=csrf_headers(client),
        )
    ).status_code == 409
