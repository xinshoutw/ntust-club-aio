from datetime import UTC, date, datetime, timedelta

import sqlalchemy as sa

from app.models import Equipment, EquipmentLoan, Holiday, Venue
from app.models.enums import EquipmentCategory, VenueCategory
from app.services.booking_service import next_workday, overdue_deadline
from tests.conftest import csrf_headers, login, make_club, make_user


async def make_venue(db, name="S304 音樂教室", *, allow_fixed=True, allow_temp=False, **kw):
    venue = Venue(
        name=name,
        capacity=40,
        category=VenueCategory.CLASSROOM,
        allow_fixed=allow_fixed,
        allow_temp=allow_temp,
        **kw,
    )
    db.add(venue)
    await db.commit()
    await db.refresh(venue)
    return venue


async def make_equipment(db, name="帳篷", *, total_qty=5, category=EquipmentCategory.TENT, **kw):
    eq = Equipment(name=name, category=category, total_qty=total_qty, **kw)
    db.add(eq)
    await db.commit()
    await db.refresh(eq)
    return eq


async def setup_session(client, db, username="club01", name="熱舞社"):
    club = await make_club(db, name=name)
    await make_user(db, username=username, club_id=club.id)
    await login(client, username)
    return club


async def test_room_booking_create_and_list(client, db):
    await setup_session(client, db)
    venue = await make_venue(db)

    resp = await client.post(
        "/api/v1/club/room-bookings",
        json={
            "venue_id": venue.id,
            "purpose": "社課練習",
            "slots": [
                {"date": "2026-03-02", "period": "A"},
                {"date": "2026-03-09", "period": "A"},
            ],
        },
        headers=csrf_headers(client),
    )
    assert resp.status_code == 201
    data = resp.json()["data"]
    assert data["venue_name"] == "S304 音樂教室"
    assert len(data["slots"]) == 2

    # 重複時段 / 無效節次 / 不開放固定借用
    resp = await client.post(
        "/api/v1/club/room-bookings",
        json={
            "venue_id": venue.id,
            "purpose": "x",
            "slots": [{"date": "2026-03-02", "period": "A"}, {"date": "2026-03-02", "period": "A"}],
        },
        headers=csrf_headers(client),
    )
    assert resp.status_code == 422
    resp = await client.post(
        "/api/v1/club/room-bookings",
        json={
            "venue_id": venue.id,
            "purpose": "x",
            "slots": [{"date": "2026-03-02", "period": "Z"}],
        },
        headers=csrf_headers(client),
    )
    assert resp.status_code == 422

    temp_only = await make_venue(db, name="精誠廣場", allow_fixed=False, allow_temp=True)
    resp = await client.post(
        "/api/v1/club/room-bookings",
        json={
            "venue_id": temp_only.id,
            "purpose": "x",
            "slots": [{"date": "2026-03-02", "period": "1"}],
        },
        headers=csrf_headers(client),
    )
    assert resp.status_code == 422

    listing = (await client.get("/api/v1/club/room-bookings")).json()
    assert listing["meta"]["total"] == 1


async def test_venue_booking_create_rules(client, db):
    await setup_session(client, db)
    venue = await make_venue(db, name="精誠廣場", allow_fixed=False, allow_temp=True)

    body = {"venue_id": venue.id, "date": "2026-03-05", "periods": ["3", "4"], "purpose": "擺攤"}
    resp = await client.post("/api/v1/club/venue-bookings", json=body, headers=csrf_headers(client))
    assert resp.status_code == 201

    # 同場地同日重複申請 → 409
    resp = await client.post("/api/v1/club/venue-bookings", json=body, headers=csrf_headers(client))
    assert resp.status_code == 409


async def test_availability_grid_statuses(client, db):
    await setup_session(client, db)  # club01
    venue = await make_venue(db, name="精誠廣場", allow_fixed=False, allow_temp=True)
    fixed_venue = await make_venue(db, name="S304")

    # 自己的臨時申請(pending)→ mine
    await client.post(
        "/api/v1/club/venue-bookings",
        json={"venue_id": venue.id, "date": "2026-03-05", "periods": ["3"], "purpose": "擺攤"},
        headers=csrf_headers(client),
    )
    # 他社:固定借用已核准 → fixed;臨時 pending → pending
    other_club = await make_club(db, name="吉他社")
    await make_user(db, username="club02", club_id=other_club.id)
    await login(client, "club02")
    resp = await client.post(
        "/api/v1/club/room-bookings",
        json={
            "venue_id": fixed_venue.id,
            "purpose": "社課",
            "slots": [{"date": "2026-03-05", "period": "5"}],
        },
        headers=csrf_headers(client),
    )
    rid = resp.json()["data"]["id"]
    from app.models import RoomBookingRequest

    await db.execute(
        sa.update(RoomBookingRequest).where(RoomBookingRequest.id == rid).values(status="approved")
    )
    await db.commit()
    await client.post(
        "/api/v1/club/venue-bookings",
        json={"venue_id": venue.id, "date": "2026-03-05", "periods": ["7"], "purpose": "活動"},
        headers=csrf_headers(client),
    )

    await login(client, "club01")
    grid = (
        await client.get("/api/v1/club/bookings/availability", params={"date": "2026-03-05"})
    ).json()["data"]["grid"]
    assert grid[str(venue.id)]["3"] == "mine"
    assert grid[str(venue.id)]["7"] == "pending"
    assert grid[str(fixed_venue.id)]["5"] == "fixed"


async def test_equipment_available_and_loan_rules(client, db):
    club = await setup_session(client, db)
    eq = await make_equipment(db, total_qty=5)

    # 有 3 件借出中 → 可借 2
    db.add(
        EquipmentLoan(
            club_id=club.id,
            equipment_id=eq.id,
            qty=3,
            start_date=date(2026, 3, 1),
            end_date=date(2026, 3, 3),
            purpose="x",
            status="checked_out",
        )
    )
    await db.commit()

    listing = (await client.get("/api/v1/club/equipment")).json()["data"]
    assert listing[0]["available"] == 2

    resp = await client.post(
        "/api/v1/club/equipment-loans",
        json={
            "equipment_id": eq.id,
            "qty": 3,
            "start_date": "2026-03-10",
            "end_date": "2026-03-12",
            "purpose": "營隊",
        },
        headers=csrf_headers(client),
    )
    assert resp.status_code == 409  # 超過可借數

    resp = await client.post(
        "/api/v1/club/equipment-loans",
        json={
            "equipment_id": eq.id,
            "qty": 2,
            "start_date": "2026-03-10",
            "end_date": "2026-03-12",
            "purpose": "營隊",
        },
        headers=csrf_headers(client),
    )
    assert resp.status_code == 201

    # 日期順序錯誤
    resp = await client.post(
        "/api/v1/club/equipment-loans",
        json={
            "equipment_id": eq.id,
            "qty": 1,
            "start_date": "2026-03-12",
            "end_date": "2026-03-10",
            "purpose": "x",
        },
        headers=csrf_headers(client),
    )
    assert resp.status_code == 422


async def test_next_workday_skips_weekend_and_holiday(db):
    # 2026-03-06 是週五;隔天週六日跳過 → 週一 03-09;若週一是假日 → 03-10
    assert await next_workday(db, date(2026, 3, 6)) == date(2026, 3, 9)
    db.add(Holiday(date=date(2026, 3, 9), name="補假"))
    await db.commit()
    assert await next_workday(db, date(2026, 3, 6)) == date(2026, 3, 10)

    deadline = await overdue_deadline(db, date(2026, 3, 6), "10:30")
    assert deadline.date() == date(2026, 3, 10)
    assert (deadline.hour, deadline.minute) == (10, 30)


async def test_suspended_club_cannot_book(client, db):
    from datetime import date as date_cls

    club = await setup_session(client, db)
    club.suspended_until = date_cls.today() + timedelta(days=7)
    await db.commit()
    eq = await make_equipment(db, name="音響", total_qty=2)
    venue = await make_venue(db, name="精誠廣場", allow_fixed=False, allow_temp=True)

    resp = await client.post(
        "/api/v1/club/equipment-loans",
        json={
            "equipment_id": eq.id,
            "qty": 1,
            "start_date": "2026-03-10",
            "end_date": "2026-03-12",
            "purpose": "x",
        },
        headers=csrf_headers(client),
    )
    assert resp.status_code == 403
    assert resp.json()["meta"]["code"] == "CLUB_SUSPENDED"

    resp = await client.post(
        "/api/v1/club/venue-bookings",
        json={"venue_id": venue.id, "date": "2026-03-05", "periods": ["3"], "purpose": "x"},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 403

    # 停權期滿即恢復
    club.suspended_until = date_cls.today() - timedelta(days=1)
    await db.commit()
    resp = await client.post(
        "/api/v1/club/venue-bookings",
        json={"venue_id": venue.id, "date": "2026-03-05", "periods": ["3"], "purpose": "x"},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 201


async def test_loan_overdue_flag(client, db):
    club = await setup_session(client, db)
    eq = await make_equipment(db, name="麥克風", total_qty=2)
    yesterday = datetime.now(UTC).date() - timedelta(days=10)
    db.add(
        EquipmentLoan(
            club_id=club.id,
            equipment_id=eq.id,
            qty=1,
            start_date=yesterday - timedelta(days=2),
            end_date=yesterday,
            purpose="x",
            status="checked_out",
        )
    )
    await db.commit()

    listing = (await client.get("/api/v1/club/equipment-loans")).json()["data"]
    assert listing[0]["overdue"] is True
