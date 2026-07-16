from datetime import UTC, date, datetime, timedelta

import sqlalchemy as sa

from app.models import (
    Activity,
    Equipment,
    EquipmentLoan,
    Holiday,
    RoomBookingRequest,
    SystemSetting,
    Venue,
)
from app.models.enums import ActivityStatus, EquipmentCategory, VenueCategory
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


async def make_activity(
    db,
    club,
    *,
    name="迎新宿營",
    day=date(2026, 3, 10),
    end_day=None,
    status=ActivityStatus.APPROVED,
):
    from app.models import User

    creator = await db.scalar(sa.select(User.id).order_by(User.id).limit(1))
    activity = Activity(
        club_id=club.id,
        name=name,
        location="活動中心",
        type="活動",
        date=day,
        end_date=end_day or day,
        participants_in=10,
        participants_out=0,
        status=status,
        created_by=creator,
    )
    db.add(activity)
    await db.commit()
    await db.refresh(activity)
    return activity


async def open_fixed_window(db):
    """固定借用預設不開放;測試以日期區間加開(2026-07-16 第八輪)。"""
    today = date.today()
    db.add(
        SystemSetting(
            key="fixed_booking_window",
            value={
                "open_from": (today - timedelta(days=1)).isoformat(),
                "open_until": (today + timedelta(days=7)).isoformat(),
            },
        )
    )
    await db.commit()


async def setup_session(client, db, username="club01", name="熱舞社"):
    club = await make_club(db, name=name)
    await make_user(db, username=username, club_id=club.id)
    await login(client, username)
    return club


# ---- 教室固定借用(2026-07-15:星期×節次) ----


async def test_room_booking_create_and_list(client, db):
    await setup_session(client, db)
    await open_fixed_window(db)
    venue = await make_venue(db)

    resp = await client.post(
        "/api/v1/club/room-bookings",
        json={
            "venue_id": venue.id,
            "purpose": "社課練習",
            "slots": [
                {"weekday": 2, "period": "3"},
                {"weekday": 2, "period": "4"},
                {"weekday": 4, "period": "5"},
            ],
        },
        headers=csrf_headers(client),
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()["data"]
    assert data["venue_name"] == "S304 音樂教室"
    assert len(data["slots"]) == 3
    assert data["slots"][0] == {"weekday": 2, "period": "3"}

    # 重複時段 / 無效節次 / 無效星期 / 不開放固定借用
    resp = await client.post(
        "/api/v1/club/room-bookings",
        json={
            "venue_id": venue.id,
            "purpose": "x",
            "slots": [{"weekday": 2, "period": "3"}, {"weekday": 2, "period": "3"}],
        },
        headers=csrf_headers(client),
    )
    assert resp.status_code == 422
    resp = await client.post(
        "/api/v1/club/room-bookings",
        json={"venue_id": venue.id, "purpose": "x", "slots": [{"weekday": 2, "period": "Z"}]},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 422
    resp = await client.post(
        "/api/v1/club/room-bookings",
        json={"venue_id": venue.id, "purpose": "x", "slots": [{"weekday": 8, "period": "1"}]},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 422

    temp_only = await make_venue(db, name="精誠廣場", allow_fixed=False, allow_temp=True)
    resp = await client.post(
        "/api/v1/club/room-bookings",
        json={"venue_id": temp_only.id, "purpose": "x", "slots": [{"weekday": 1, "period": "1"}]},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 422

    listing = (await client.get("/api/v1/club/room-bookings")).json()
    assert listing["meta"]["total"] == 1


async def test_room_booking_window_gate(client, db):
    """僅於開放窗受理(預設未設定日期區間 → 不開放)。"""
    await setup_session(client, db)
    venue = await make_venue(db)
    body = {"venue_id": venue.id, "purpose": "社課", "slots": [{"weekday": 1, "period": "1"}]}

    resp = await client.post("/api/v1/club/room-bookings", json=body, headers=csrf_headers(client))
    assert resp.status_code == 409
    assert resp.json()["meta"]["code"] == "WINDOW_CLOSED"

    window = (await client.get("/api/v1/club/room-bookings/window")).json()["data"]
    assert window == {"open": False, "open_from": None, "open_until": None}

    await open_fixed_window(db)
    window = (await client.get("/api/v1/club/room-bookings/window")).json()["data"]
    assert window["open"] is True
    assert window["open_from"] is not None
    resp = await client.post("/api/v1/club/room-bookings", json=body, headers=csrf_headers(client))
    assert resp.status_code == 201


async def test_room_booking_late_period_rule(client, db):
    """第 10 節及 A–D 節需至少連續 3 節:合法 8–10、9–A、A–C、B–D;不合法 9–10、C–D。"""
    await setup_session(client, db)
    await open_fixed_window(db)
    venue = await make_venue(db)

    async def attempt(periods, weekday=3):
        resp = await client.post(
            "/api/v1/club/room-bookings",
            json={
                "venue_id": venue.id,
                "purpose": "夜間排練",
                "slots": [{"weekday": weekday, "period": p} for p in periods],
            },
            headers=csrf_headers(client),
        )
        if resp.status_code == 201:
            # 成單後即核准,避免審核中額度(每社 10 節)干擾本測試的規則驗證
            await db.execute(
                sa.update(RoomBookingRequest)
                .where(RoomBookingRequest.id == resp.json()["data"]["id"])
                .values(status="approved")
            )
            await db.commit()
        return resp

    assert (await attempt(["9", "10"])).status_code == 422  # 不合法:僅 2 節觸及晚間
    assert (await attempt(["C", "D"])).status_code == 422
    assert (await attempt(["10"])).status_code == 422
    assert (await attempt(["8", "9", "10"], weekday=1)).status_code == 201
    assert (await attempt(["9", "10", "A"], weekday=2)).status_code == 201
    assert (await attempt(["A", "B", "C"], weekday=3)).status_code == 201
    assert (await attempt(["B", "C", "D"], weekday=4)).status_code == 201
    # 白天時段不受連 3 節限制
    assert (await attempt(["3"], weekday=5)).status_code == 201
    # 不同星期各自檢查:週一 8–10 合法、週二只有 10 不合法 → 整單退回
    resp = await client.post(
        "/api/v1/club/room-bookings",
        json={
            "venue_id": venue.id,
            "purpose": "x",
            "slots": [
                {"weekday": 1, "period": "8"},
                {"weekday": 1, "period": "9"},
                {"weekday": 1, "period": "10"},
                {"weekday": 2, "period": "10"},
            ],
        },
        headers=csrf_headers(client),
    )
    assert resp.status_code == 422


async def test_room_booking_slot_limit(client, db):
    """每社至多 10 節:單筆超過擋於 422;跨審核中申請合計超過 → 409。"""
    await setup_session(client, db)
    await open_fixed_window(db)
    venue = await make_venue(db)

    eleven = [{"weekday": d, "period": p} for d, p in [(1, "1"), (1, "2"), (1, "3"), (1, "4"),
                                                      (2, "1"), (2, "2"), (2, "3"), (2, "4"),
                                                      (3, "1"), (3, "2"), (3, "3")]]
    resp = await client.post(
        "/api/v1/club/room-bookings",
        json={"venue_id": venue.id, "purpose": "x", "slots": eleven},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 422  # schema 上限 10

    six = [{"weekday": 1, "period": str(i)} for i in range(1, 7)]
    resp = await client.post(
        "/api/v1/club/room-bookings",
        json={"venue_id": venue.id, "purpose": "社課", "slots": six},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 201

    five = [{"weekday": 2, "period": str(i)} for i in range(1, 6)]
    resp = await client.post(
        "/api/v1/club/room-bookings",
        json={"venue_id": venue.id, "purpose": "社課", "slots": five},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 409
    assert resp.json()["meta"]["code"] == "SLOT_LIMIT"

    four = [{"weekday": 2, "period": str(i)} for i in range(1, 5)]
    resp = await client.post(
        "/api/v1/club/room-bookings",
        json={"venue_id": venue.id, "purpose": "社課", "slots": four},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 201


# ---- 臨時場地借用(綁定審核通過活動) ----


async def test_venue_booking_requires_approved_activity(client, db):
    club = await setup_session(client, db)
    venue = await make_venue(db, name="精誠廣場", allow_fixed=False, allow_temp=True)
    approved = await make_activity(db, club)
    pending = await make_activity(db, club, name="未核准", status=ActivityStatus.PENDING_ADVISOR)

    body = {
        "venue_id": venue.id,
        "activity_id": approved.id,
        "date": "2026-03-05",
        "periods": ["3", "4"],
        "purpose": "擺攤",
    }
    resp = await client.post("/api/v1/club/venue-bookings", json=body, headers=csrf_headers(client))
    assert resp.status_code == 201, resp.text
    assert resp.json()["data"]["activity_name"] == "迎新宿營"

    # 同場地同日重複申請 → 409
    resp = await client.post("/api/v1/club/venue-bookings", json=body, headers=csrf_headers(client))
    assert resp.status_code == 409

    # 未核准活動 → 422
    resp = await client.post(
        "/api/v1/club/venue-bookings",
        json={**body, "date": "2026-03-06", "activity_id": pending.id},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 422

    # 他社活動 → 422
    other = await make_club(db, name="吉他社")
    other_activity = await make_activity(db, other, name="他社活動")
    resp = await client.post(
        "/api/v1/club/venue-bookings",
        json={**body, "date": "2026-03-07", "activity_id": other_activity.id},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 422

    # 缺 activity_id → 422(必填)
    resp = await client.post(
        "/api/v1/club/venue-bookings",
        json={"venue_id": venue.id, "date": "2026-03-08", "periods": ["3"], "purpose": "x"},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 422

    listing = (await client.get("/api/v1/club/venue-bookings")).json()["data"]
    assert listing[0]["activity_id"] == approved.id


# ---- 借用總覽色格 ----


async def test_availability_grid_statuses(client, db):
    club = await setup_session(client, db)  # club01
    venue = await make_venue(db, name="精誠廣場", allow_fixed=False, allow_temp=True)
    fixed_venue = await make_venue(db, name="S304")
    await open_fixed_window(db)
    activity = await make_activity(db, club)

    # 自己的臨時申請(pending)→ pending(2026-07-17:自己審核中不再標 mine)
    await client.post(
        "/api/v1/club/venue-bookings",
        json={
            "venue_id": venue.id,
            "activity_id": activity.id,
            "date": "2026-03-05",
            "periods": ["3"],
            "purpose": "擺攤",
        },
        headers=csrf_headers(client),
    )
    # 他社:固定借用已核准 → 每週該星期呈 fixed;審核中固定借用不顯示;臨時 pending → pending
    other_club = await make_club(db, name="吉他社")
    await make_user(db, username="club02", club_id=other_club.id)
    other_activity = await make_activity(db, other_club, name="社課成發")
    await login(client, "club02")
    resp = await client.post(
        "/api/v1/club/room-bookings",
        json={
            "venue_id": fixed_venue.id,
            "purpose": "社課",
            # 2026-03-05 是週四(isoweekday=4)
            "slots": [{"weekday": 4, "period": "5"}, {"weekday": 4, "period": "6"}],
        },
        headers=csrf_headers(client),
    )
    rid = resp.json()["data"]["id"]
    await client.post(
        "/api/v1/club/venue-bookings",
        json={
            "venue_id": venue.id,
            "activity_id": other_activity.id,
            "date": "2026-03-05",
            "periods": ["7"],
            "purpose": "活動",
        },
        headers=csrf_headers(client),
    )

    await login(client, "club01")
    grid = (
        await client.get("/api/v1/club/bookings/availability", params={"date": "2026-03-05"})
    ).json()["data"]["grid"]
    # 本社的臨時申請仍在審核中 → pending(非 mine);格帶社團名供 hover
    assert grid[str(venue.id)]["3"] == {"status": "pending", "club": "熱舞社"}
    assert grid[str(venue.id)]["7"] == {"status": "pending", "club": "吉他社"}
    # 審核中的固定借用不顯示(2026-07-15:場況圖只顯示已核准的固定借用)
    assert str(fixed_venue.id) not in grid

    await db.execute(
        sa.update(RoomBookingRequest).where(RoomBookingRequest.id == rid).values(status="approved")
    )
    await db.commit()
    grid = (
        await client.get("/api/v1/club/bookings/availability", params={"date": "2026-03-05"})
    ).json()["data"]["grid"]
    assert grid[str(fixed_venue.id)]["5"] == {"status": "fixed", "club": "吉他社"}
    # 每週固定:下週同星期也佔用,不同星期不佔用
    grid = (
        await client.get("/api/v1/club/bookings/availability", params={"date": "2026-03-12"})
    ).json()["data"]["grid"]
    assert grid[str(fixed_venue.id)]["5"]["status"] == "fixed"
    grid = (
        await client.get("/api/v1/club/bookings/availability", params={"date": "2026-03-06"})
    ).json()["data"]["grid"]
    assert str(fixed_venue.id) not in grid


async def test_availability_range(client, db):
    """區間逐日場況:臨時只佔當日、固定每週同星期;區間驗證。"""
    club = await setup_session(client, db)
    venue = await make_venue(db, name="精誠廣場", allow_fixed=False, allow_temp=True)
    fixed_venue = await make_venue(db, name="S304")
    await open_fixed_window(db)
    activity = await make_activity(db, club)

    await client.post(
        "/api/v1/club/venue-bookings",
        json={
            "venue_id": venue.id,
            "activity_id": activity.id,
            "date": "2026-03-05",  # 週四
            "periods": ["3"],
            "purpose": "擺攤",
        },
        headers=csrf_headers(client),
    )
    resp = await client.post(
        "/api/v1/club/room-bookings",
        json={
            "venue_id": fixed_venue.id,
            "purpose": "社課",
            "slots": [{"weekday": 4, "period": "5"}],
        },
        headers=csrf_headers(client),
    )
    rid = resp.json()["data"]["id"]
    await db.execute(
        sa.update(RoomBookingRequest).where(RoomBookingRequest.id == rid).values(status="approved")
    )
    await db.commit()

    days = (
        await client.get(
            "/api/v1/club/bookings/availability-range",
            params={"start": "2026-03-04", "end": "2026-03-12"},
        )
    ).json()["data"]["days"]
    by_date = {d["date"]: d["grid"] for d in days}
    assert list(by_date) == [f"2026-03-{i:02d}" for i in range(4, 13)]  # 連續、含頭尾
    # 臨時只佔當日;本社審核中 → pending(非 mine)
    assert by_date["2026-03-05"][str(venue.id)]["3"]["status"] == "pending"
    assert str(venue.id) not in by_date["2026-03-06"]
    # 固定每週同星期(3/5、3/12 皆週四);自己社的固定借用顯示 mine;其他日不佔
    assert by_date["2026-03-05"][str(fixed_venue.id)]["5"]["status"] == "mine"
    assert by_date["2026-03-12"][str(fixed_venue.id)]["5"]["status"] == "mine"
    assert str(fixed_venue.id) not in by_date["2026-03-06"]

    # 區間驗證:起訖顛倒、超出上限
    resp = await client.get(
        "/api/v1/club/bookings/availability-range",
        params={"start": "2026-03-05", "end": "2026-03-04"},
    )
    assert resp.status_code == 422
    resp = await client.get(
        "/api/v1/club/bookings/availability-range",
        params={"start": "2026-03-01", "end": "2026-04-15"},
    )
    assert resp.status_code == 422


# ---- 器材借用(綁定審核通過活動,區間推導) ----


async def test_equipment_loan_window_derived_from_activity(client, db):
    """借用區間=活動開始日 −2 個工作天 ~ 結束日 +1 個工作天(排除週六日與假日)。"""
    club = await setup_session(client, db)
    eq = await make_equipment(db, total_qty=5)
    # 2026-03-10(二)~ 2026-03-12(四)
    activity = await make_activity(db, club, day=date(2026, 3, 10), end_day=date(2026, 3, 12))

    resp = await client.post(
        "/api/v1/club/equipment-loans",
        json={"equipment_id": eq.id, "activity_id": activity.id, "qty": 2, "purpose": "營隊"},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()["data"]
    assert data["start_date"] == "2026-03-06"  # 週二 −2 工作天=上週五
    assert data["end_date"] == "2026-03-13"  # 週四 +1 工作天=週五
    assert data["activity_name"] == "迎新宿營"

    # 假日再往前跳:3/6(五)為假日 → 起日 3/5(四)
    db.add(Holiday(date=date(2026, 3, 6), name="補假"))
    await db.commit()
    activity2 = await make_activity(
        db, club, name="第二活動", day=date(2026, 3, 10), end_day=date(2026, 3, 12)
    )
    resp = await client.post(
        "/api/v1/club/equipment-loans",
        json={"equipment_id": eq.id, "activity_id": activity2.id, "qty": 1, "purpose": "x"},
        headers=csrf_headers(client),
    )
    assert resp.json()["data"]["start_date"] == "2026-03-05"

    # 未核准活動不可借
    pending = await make_activity(db, club, name="未核准", status=ActivityStatus.DRAFT)
    resp = await client.post(
        "/api/v1/club/equipment-loans",
        json={"equipment_id": eq.id, "activity_id": pending.id, "qty": 1, "purpose": "x"},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 422


async def test_equipment_available_within_window(client, db):
    """可借數依指定活動推導區間動態計算:總數 − 區間重疊之未歸還未退回借用量。"""
    club = await setup_session(client, db)
    eq = await make_equipment(db, total_qty=5)
    first = await make_activity(db, club, day=date(2026, 3, 10), end_day=date(2026, 3, 12))

    resp = await client.post(
        "/api/v1/club/equipment-loans",
        json={"equipment_id": eq.id, "activity_id": first.id, "qty": 3, "purpose": "營隊"},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 201  # 佔用 2026-03-06 ~ 2026-03-13(pending 亦佔用)

    # 區間重疊的活動(3/16 起,窗 3/12–3/18)→ 可借 2
    overlap = await make_activity(
        db, club, name="重疊活動", day=date(2026, 3, 16), end_day=date(2026, 3, 17)
    )
    listing = await client.get("/api/v1/club/equipment", params={"activity_id": overlap.id})
    body = listing.json()
    assert body["data"][0]["available"] == 2
    assert body["meta"] == {"loan_start": "2026-03-12", "loan_end": "2026-03-18"}

    resp = await client.post(
        "/api/v1/club/equipment-loans",
        json={"equipment_id": eq.id, "activity_id": overlap.id, "qty": 3, "purpose": "x"},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 409  # 超過區間可借數

    # 不重疊的活動(3/23 起,窗 3/19–3/25)→ 可借 5
    apart = await make_activity(
        db, club, name="不重疊活動", day=date(2026, 3, 23), end_day=date(2026, 3, 24)
    )
    listing = (await client.get("/api/v1/club/equipment", params={"activity_id": apart.id})).json()
    assert listing["data"][0]["available"] == 5
    resp = await client.post(
        "/api/v1/club/equipment-loans",
        json={"equipment_id": eq.id, "activity_id": apart.id, "qty": 5, "purpose": "x"},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 201

    # 他社審核通過活動不可用來查詢
    other = await make_club(db, name="吉他社")
    other_activity = await make_activity(db, other, name="他社活動")
    resp = await client.get("/api/v1/club/equipment", params={"activity_id": other_activity.id})
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
    await open_fixed_window(db)
    activity = await make_activity(db, club)
    club.suspended_until = date_cls.today() + timedelta(days=7)
    await db.commit()
    eq = await make_equipment(db, name="音響", total_qty=2)
    venue = await make_venue(db, name="精誠廣場", allow_fixed=False, allow_temp=True)

    resp = await client.post(
        "/api/v1/club/equipment-loans",
        json={"equipment_id": eq.id, "activity_id": activity.id, "qty": 1, "purpose": "x"},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 403
    assert resp.json()["meta"]["code"] == "CLUB_SUSPENDED"

    venue_body = {
        "venue_id": venue.id,
        "activity_id": activity.id,
        "date": "2026-03-05",
        "periods": ["3"],
        "purpose": "x",
    }
    resp = await client.post(
        "/api/v1/club/venue-bookings", json=venue_body, headers=csrf_headers(client)
    )
    assert resp.status_code == 403

    # 停權期滿即恢復
    club.suspended_until = date_cls.today() - timedelta(days=1)
    await db.commit()
    resp = await client.post(
        "/api/v1/club/venue-bookings", json=venue_body, headers=csrf_headers(client)
    )
    assert resp.status_code == 201


async def test_loan_overdue_flag(client, db):
    club = await setup_session(client, db)
    eq = await make_equipment(db, name="麥克風", total_qty=2)
    activity = await make_activity(db, club)
    yesterday = datetime.now(UTC).date() - timedelta(days=10)
    db.add(
        EquipmentLoan(
            club_id=club.id,
            equipment_id=eq.id,
            activity_id=activity.id,
            qty=1,
            start_date=yesterday - timedelta(days=2),
            end_date=yesterday,
            purpose="x",
            status="checked_out",
            borrower_name="陳予恩",  # 借出點交時登記
        )
    )
    await db.commit()

    listing = (await client.get("/api/v1/club/equipment-loans")).json()["data"]
    assert listing[0]["overdue"] is True
    # 借用紀錄顯示借用人/歸還人(2026-07-15)
    assert listing[0]["borrower_name"] == "陳予恩"
    assert listing[0]["returner_name"] is None
    assert listing[0]["activity_name"] == "迎新宿營"


async def test_seed_creates_19_venues(db):
    """場地主檔 seed:19 處(含宿舍區),重跑 idempotent。"""
    from scripts.seed import seed

    await seed(None, None)
    await seed(None, None)  # 重跑不重複
    venues = (await db.scalars(sa.select(Venue))).all()
    assert len(venues) == 19
    by_name = {v.name: v for v in venues}
    assert by_name["一宿 B2 樓梯"].category == VenueCategory.DORM
    assert by_name["一宿 B2 樓梯"].allow_fixed is False
    assert by_name["一宿 B2 樓梯"].allow_temp is True
    assert by_name["S204 共享食堂"].capacity == 60
    assert by_name["練團室"].capacity == 15
    assert sum(1 for v in venues if v.allow_fixed) == 11  # 教室 9 + 練習空間 2
