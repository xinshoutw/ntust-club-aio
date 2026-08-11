from datetime import UTC, date, datetime, timedelta

import pytest
import sqlalchemy as sa

from app.core.semesters import next_semester_range
from app.models import (
    Activity,
    Equipment,
    EquipmentLoan,
    Holiday,
    RoomBookingRequest,
    SystemSetting,
    Venue,
)
from app.models.enums import ActivityStatus, LoanStatus, VenueCategory
from app.services import booking_service
from app.services.booking_service import next_workday, overdue_deadline
from tests.conftest import csrf_headers, login, make_club, make_user


def first_thursday(start: date) -> date:
    return start + timedelta(days=(4 - start.isoweekday()) % 7)


def future_tuesday(weeks_ahead: int = 3) -> date:
    """未來的週二:工作天推導測試的定錨(相對日期,避免固定日期隨時間變成過去)。"""
    today = date.today()
    return today + timedelta(days=(1 - today.weekday()) % 7 + 7 * weeks_ahead)


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


async def make_equipment(db, name="帳篷", *, total_qty=5, **kw):
    eq = Equipment(name=name, total_qty=total_qty, **kw)
    db.add(eq)
    await db.commit()
    await db.refresh(eq)
    return eq


async def make_activity(
    db,
    club,
    *,
    name="迎新宿營",
    # 預設未來日:借用一律綁「尚未結束」的活動,已結束的活動要測就明寫過去日期
    day=None,
    end_day=None,
    status=ActivityStatus.APPROVED,
):
    from app.models import User

    creator = await db.scalar(sa.select(User.id).order_by(User.id).limit(1))
    day = day or date.today() + timedelta(days=30)
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
    assert window == {
        "open": False,
        "open_from": None,
        "open_until": None,
        "used_periods": 0,
        "max_periods": 10,
    }

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
            # 成單後即退回:同學期未退回單(審核中+已核准)合計佔每社 10 節額度,
            # 退回不佔,才不干擾本測試的晚間規則驗證
            await db.execute(
                sa.update(RoomBookingRequest)
                .where(RoomBookingRequest.id == resp.json()["data"]["id"])
                .values(status="rejected")
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

    # 額度是跨申請單合計:畫面要在送出前就看得到已佔用多少(與檢核同一份判定)
    window = (await client.get("/api/v1/club/room-bookings/window")).json()["data"]
    assert (window["used_periods"], window["max_periods"]) == (6, 10)

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


async def test_room_booking_waits_for_the_club_lock(client, db):
    """10 節額度是「先查合計再寫入」:沒鎖的話兩張並發申請會各自通過同一份合計。

    直接佔住鎖再斷言請求卡住 —— 真的送兩支並發請求無法穩定重現交錯,
    機器快一點就會自己排成序列而靜默通過(前兩批踩過)。
    """
    import asyncio

    from app.core.db import async_session_factory

    await setup_session(client, db)
    await open_fixed_window(db)
    venue = await make_venue(db)

    async with async_session_factory() as holder:
        await booking_service.lock_resource(holder, "club", 1)  # 該社團的鎖
        with pytest.raises(TimeoutError):
            await asyncio.wait_for(
                client.post(
                    "/api/v1/club/room-bookings",
                    json={
                        "venue_id": venue.id,
                        "purpose": "社課",
                        "slots": [{"weekday": 1, "period": str(i)} for i in range(1, 7)],
                    },
                    headers=csrf_headers(client),
                ),
                timeout=1,
            )


async def test_venue_booking_locks_before_the_duplicate_check(client, db):
    """「同社同場地同日只能一張」是先查再寫:鎖必須取在查之前,否則雙擊送出會落兩筆。"""
    from app.core.db import engine

    club = await setup_session(client, db)
    venue = await make_venue(db, name="精誠廣場", allow_fixed=False, allow_temp=True)
    activity = await make_activity(db, club)

    statements: list[str] = []

    def record(conn, cursor, statement, *args):
        statements.append(" ".join(statement.split()))

    sa.event.listen(engine.sync_engine, "before_cursor_execute", record)
    try:
        resp = await client.post(
            "/api/v1/club/venue-bookings",
            json={
                "venue_id": venue.id,
                "activity_id": activity.id,
                "date": (date.today() + timedelta(days=14)).isoformat(),
                "periods": ["3", "4"],
                "purpose": "擺攤",
                "phone": "0912000111",
            },
            headers=csrf_headers(client),
        )
    finally:
        sa.event.remove(engine.sync_engine, "before_cursor_execute", record)
    assert resp.status_code == 201, resp.text

    locked = next(i for i, s in enumerate(statements) if "pg_advisory_xact_lock" in s)
    checked = next(i for i, s in enumerate(statements) if "FROM venue_bookings" in s)
    assert locked < checked


async def test_venue_booking_requires_approved_activity(client, db):
    club = await setup_session(client, db)
    venue = await make_venue(db, name="精誠廣場", allow_fixed=False, allow_temp=True)
    approved = await make_activity(db, club)
    pending = await make_activity(db, club, name="未核准", status=ActivityStatus.PENDING_ADVISOR)
    day = date.today() + timedelta(days=14)  # 過去日期已全面禁止,一律用未來日期

    body = {
        "venue_id": venue.id,
        "activity_id": approved.id,
        "date": day.isoformat(),
        "periods": ["3", "4"],
        "purpose": "擺攤",
        "phone": "0912000111",
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
        json={**body, "date": (day + timedelta(days=1)).isoformat(), "activity_id": pending.id},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 422

    # 他社活動 → 422
    other = await make_club(db, name="吉他社")
    other_activity = await make_activity(db, other, name="他社活動")
    resp = await client.post(
        "/api/v1/club/venue-bookings",
        json={
            **body,
            "date": (day + timedelta(days=2)).isoformat(),
            "activity_id": other_activity.id,
        },
        headers=csrf_headers(client),
    )
    assert resp.status_code == 422

    # 已結束的活動 → 422:不看時間的話,帶一個去年辦完的活動就能預約未來任何時段
    ended = await make_activity(
        db, club, name="去年辦完的活動", day=date.today() - timedelta(days=60)
    )
    resp = await client.post(
        "/api/v1/club/venue-bookings",
        json={**body, "date": (day + timedelta(days=4)).isoformat(), "activity_id": ended.id},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 422
    assert "已結束" in resp.json()["error"]

    # 缺 activity_id → 422(必填)
    resp = await client.post(
        "/api/v1/club/venue-bookings",
        json={"venue_id": venue.id, "date": (day + timedelta(days=3)).isoformat(),
              "periods": ["3"], "purpose": "x", "phone": "0912000111"},
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
    # 固定借用歸屬「下一學期」:場況斷言取目標學期內的週四(slots weekday=4)
    sem_start, _ = next_semester_range(date.today())
    thu = first_thursday(sem_start)

    # 自己的臨時申請(pending)→ pending(2026-07-17:自己審核中不再標 mine)
    await client.post(
        "/api/v1/club/venue-bookings",
        json={
            "venue_id": venue.id,
            "activity_id": activity.id,
            "date": thu.isoformat(),
            "periods": ["3"],
            "purpose": "擺攤",
            "phone": "0912000111",
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
            "date": thu.isoformat(),
            "periods": ["7"],
            "purpose": "活動",
            "phone": "0912000111",
        },
        headers=csrf_headers(client),
    )

    await login(client, "club01")
    grid = (
        await client.get("/api/v1/club/bookings/availability", params={"date": thu.isoformat()})
    ).json()["data"]["grid"]
    # 本社的臨時申請仍在審核中 → pending(非 mine);格帶社團名供 hover
    assert grid[str(venue.id)]["3"] == {"status": "pending", "club": "熱舞社"}
    assert grid[str(venue.id)]["7"] == {"status": "pending", "club": "吉他社"}
    # 審核中的固定借用也標記(2026-07-17:pending 固定借用顯示為審核中)
    assert grid[str(fixed_venue.id)]["5"] == {"status": "pending", "club": "吉他社"}

    await db.execute(
        sa.update(RoomBookingRequest).where(RoomBookingRequest.id == rid).values(status="approved")
    )
    await db.commit()
    grid = (
        await client.get("/api/v1/club/bookings/availability", params={"date": thu.isoformat()})
    ).json()["data"]["grid"]
    assert grid[str(fixed_venue.id)]["5"] == {"status": "fixed", "club": "吉他社"}
    # 每週固定:下週同星期也佔用,不同星期不佔用
    grid = (
        await client.get(
            "/api/v1/club/bookings/availability",
            params={"date": (thu + timedelta(days=7)).isoformat()},
        )
    ).json()["data"]["grid"]
    assert grid[str(fixed_venue.id)]["5"]["status"] == "fixed"
    grid = (
        await client.get(
            "/api/v1/club/bookings/availability",
            params={"date": (thu + timedelta(days=1)).isoformat()},
        )
    ).json()["data"]["grid"]
    assert str(fixed_venue.id) not in grid


async def test_availability_range(client, db):
    """區間逐日場況:臨時只佔當日、固定每週同星期;venue 篩選;區間驗證。"""
    club = await setup_session(client, db)
    venue = await make_venue(db, name="精誠廣場", allow_fixed=False, allow_temp=True)
    fixed_venue = await make_venue(db, name="S304")
    await open_fixed_window(db)
    activity = await make_activity(db, club)
    sem_start, _ = next_semester_range(date.today())
    thu = first_thursday(sem_start)  # 固定借用目標學期內的週四
    wed, fri, next_thu = thu - timedelta(days=1), thu + timedelta(days=1), thu + timedelta(days=7)

    await client.post(
        "/api/v1/club/venue-bookings",
        json={
            "venue_id": venue.id,
            "activity_id": activity.id,
            "date": thu.isoformat(),
            "periods": ["3"],
            "purpose": "擺攤",
            "phone": "0912000111",
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
            params={"start": wed.isoformat(), "end": next_thu.isoformat()},
        )
    ).json()["data"]["days"]
    by_date = {d["date"]: d["grid"] for d in days}
    # 連續、含頭尾
    assert list(by_date) == [(wed + timedelta(days=i)).isoformat() for i in range(9)]
    # 臨時只佔當日;本社審核中 → pending(非 mine)
    assert by_date[thu.isoformat()][str(venue.id)]["3"]["status"] == "pending"
    assert str(venue.id) not in by_date[fri.isoformat()]
    # 固定每週同星期(兩個週四皆佔);自己社的固定借用顯示 mine;其他日不佔
    assert by_date[thu.isoformat()][str(fixed_venue.id)]["5"]["status"] == "mine"
    assert by_date[next_thu.isoformat()][str(fixed_venue.id)]["5"]["status"] == "mine"
    assert str(fixed_venue.id) not in by_date[fri.isoformat()]

    # venue 篩選(單一場地檢視):只回該場地的格
    days = (
        await client.get(
            "/api/v1/club/bookings/availability-range",
            params={"start": wed.isoformat(), "end": next_thu.isoformat(), "venue": fixed_venue.id},
        )
    ).json()["data"]["days"]
    by_date = {d["date"]: d["grid"] for d in days}
    assert str(fixed_venue.id) in by_date[thu.isoformat()]
    assert str(venue.id) not in by_date[thu.isoformat()]

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


async def test_fixed_booking_scoped_to_target_semester(client, db):
    """固定借用僅在目標學期起訖內佔格(2026-07-17:先前無界限,未退回單永久佔格)。"""
    await setup_session(client, db)
    await open_fixed_window(db)
    venue = await make_venue(db)

    resp = await client.post(
        "/api/v1/club/room-bookings",
        json={"venue_id": venue.id, "purpose": "社課", "slots": [{"weekday": 4, "period": "5"}]},
        headers=csrf_headers(client),
    )
    rid = resp.json()["data"]["id"]
    # 申請自動歸屬「下一學期」起訖快照
    sem_start, sem_end = next_semester_range(date.today())
    row = await db.get(RoomBookingRequest, rid)
    assert (row.start_date, row.end_date) == (sem_start, sem_end)

    await db.execute(
        sa.update(RoomBookingRequest).where(RoomBookingRequest.id == rid).values(status="approved")
    )
    await db.commit()

    thu_in = first_thursday(sem_start)  # 學期內的週四 → 佔格
    thu_before = thu_in - timedelta(days=7)  # 學期開始前的週四 → 不佔
    after = sem_end + timedelta(days=1)
    thu_after = first_thursday(after)  # 學期結束後的週四 → 不佔

    async def grid_of(day: date) -> dict:
        resp = await client.get(
            "/api/v1/club/bookings/availability", params={"date": day.isoformat()}
        )
        return resp.json()["data"]["grid"]

    assert (await grid_of(thu_in))[str(venue.id)]["5"]["status"] == "mine"  # 本社已核准
    assert str(venue.id) not in await grid_of(thu_before)
    assert str(venue.id) not in await grid_of(thu_after)


# ---- 器材借用(綁定審核通過活動,區間推導) ----


async def test_equipment_loan_window_derived_from_activity(client, db):
    """借用區間=活動開始日 −2 個工作天 ~ 結束日 +1 個工作天(排除週六日與假日)。"""
    club = await setup_session(client, db)
    eq = await make_equipment(db, total_qty=5)
    # 未來的週二 ~ 週四(相對日期:過去活動已禁止借用)
    tue = future_tuesday()
    thu = tue + timedelta(days=2)
    activity = await make_activity(db, club, day=tue, end_day=thu)

    resp = await client.post(
        "/api/v1/club/equipment-loans",
        json={"equipment_id": eq.id, "activity_id": activity.id, "qty": 2, "purpose": "營隊",
              "phone": "0912000111"},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()["data"]
    assert data["start_date"] == (tue - timedelta(days=4)).isoformat()  # 週二 −2 工作天=上週五
    assert data["end_date"] == (thu + timedelta(days=1)).isoformat()  # 週四 +1 工作天=週五
    assert data["activity_name"] == "迎新宿營"

    # 假日再往前跳:上週五為假日 → 起日再往前一天(週四)
    db.add(Holiday(date=tue - timedelta(days=4), name="補假"))
    await db.commit()
    activity2 = await make_activity(db, club, name="第二活動", day=tue, end_day=thu)
    resp = await client.post(
        "/api/v1/club/equipment-loans",
        json={"equipment_id": eq.id, "activity_id": activity2.id, "qty": 1, "purpose": "x",
              "phone": "0912000111"},
        headers=csrf_headers(client),
    )
    assert resp.json()["data"]["start_date"] == (tue - timedelta(days=5)).isoformat()

    # 未核准活動不可借
    pending = await make_activity(db, club, name="未核准", status=ActivityStatus.DRAFT)
    resp = await client.post(
        "/api/v1/club/equipment-loans",
        json={"equipment_id": eq.id, "activity_id": pending.id, "qty": 1, "purpose": "x",
              "phone": "0912000111"},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 422


async def test_equipment_available_within_window(client, db):
    """可借數依指定活動推導區間動態計算:總數 − 區間重疊之未歸還未退回借用量。"""
    club = await setup_session(client, db)
    eq = await make_equipment(db, total_qty=5)
    tue = future_tuesday()  # 未來的週二(相對日期:過去活動已禁止借用)
    first = await make_activity(db, club, day=tue, end_day=tue + timedelta(days=2))

    resp = await client.post(
        "/api/v1/club/equipment-loans",
        json={"equipment_id": eq.id, "activity_id": first.id, "qty": 3, "purpose": "營隊",
              "phone": "0912000111"},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 201  # 佔用 週五(−4)~ 週五(+3)(pending 亦佔用)

    # 區間重疊的活動(下週一起,窗 週四(+2)– 週三(+8))→ 可借 2
    overlap = await make_activity(
        db, club, name="重疊活動",
        day=tue + timedelta(days=6), end_day=tue + timedelta(days=7),
    )
    listing = await client.get("/api/v1/club/equipment", params={"activity_id": overlap.id})
    body = listing.json()
    assert body["data"][0]["available"] == 2
    assert body["meta"] == {
        "loan_start": (tue + timedelta(days=2)).isoformat(),
        "loan_end": (tue + timedelta(days=8)).isoformat(),
    }

    resp = await client.post(
        "/api/v1/club/equipment-loans",
        json={"equipment_id": eq.id, "activity_id": overlap.id, "qty": 3, "purpose": "x",
              "phone": "0912000111"},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 409  # 超過區間可借數

    # 不重疊的活動(再下週一起,窗自 週四(+9) 起)→ 可借 5
    apart = await make_activity(
        db, club, name="不重疊活動",
        day=tue + timedelta(days=13), end_day=tue + timedelta(days=14),
    )
    listing = (await client.get("/api/v1/club/equipment", params={"activity_id": apart.id})).json()
    assert listing["data"][0]["available"] == 5
    resp = await client.post(
        "/api/v1/club/equipment-loans",
        json={"equipment_id": eq.id, "activity_id": apart.id, "qty": 5, "purpose": "x",
              "phone": "0912000111"},
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
        json={"equipment_id": eq.id, "activity_id": activity.id, "qty": 1, "purpose": "x",
              "phone": "0912000111"},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 403
    assert resp.json()["meta"]["code"] == "CLUB_SUSPENDED"

    venue_body = {
        "venue_id": venue.id,
        "activity_id": activity.id,
        "date": (date_cls.today() + timedelta(days=14)).isoformat(),
        "periods": ["3"],
        "purpose": "x",
        "phone": "0912000111",
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


async def test_overdue_loan_still_occupies_stock(client, db):
    """逾期未還的器材必須照樣佔用可借數。

    只比對區間重疊的話,借出中但原區間已過的單子會被算成沒佔用 —— 東西實體還在
    別人手上,系統卻把同一批再借給下一個社團。
    """
    club = await setup_session(client, db)
    eq = await make_equipment(db, name="投影機", total_qty=2)
    other = await make_club(db, name="吉他社")

    past = date.today() - timedelta(days=30)
    db.add(
        EquipmentLoan(
            club_id=other.id,
            equipment_id=eq.id,
            qty=2,
            start_date=past,
            end_date=past + timedelta(days=1),
            status=LoanStatus.CHECKED_OUT,
            purpose="上個月借走沒還",
        )
    )
    await db.commit()

    activity = await make_activity(db, club)
    resp = await client.get(f"/api/v1/club/equipment?activity_id={activity.id}")
    row = next(e for e in resp.json()["data"] if e["id"] == eq.id)
    assert row["available"] == 0

    resp = await client.post(
        "/api/v1/club/equipment-loans",
        json={"equipment_id": eq.id, "activity_id": activity.id, "qty": 1, "purpose": "營隊",
              "phone": "0912000111"},
        headers=csrf_headers(client),
    )
    assert resp.status_code == 409


async def test_backdated_manual_loan_ignores_todays_checked_out(client, db):
    """補登歷史借用問的是「當時借不借得到」。

    逾期未還者計入佔用是為了防未來超賣;若連過去的區間也算進去,補登歷史資料
    (手動借用的用途之一)就會被今天實體借出中的數量擋死。
    """
    club = await setup_session(client, db)
    eq = await make_equipment(db, name="音響", total_qty=1)
    db.add(
        EquipmentLoan(
            club_id=club.id,
            equipment_id=eq.id,
            qty=1,
            start_date=date.today() - timedelta(days=5),
            end_date=date.today() + timedelta(days=5),
            status=LoanStatus.CHECKED_OUT,
            purpose="現在借出中",
        )
    )
    await db.commit()

    past_start = date.today() - timedelta(days=200)
    past_end = date.today() - timedelta(days=198)
    assert (
        await booking_service.equipment_available_in_window(
            db, eq.id, eq.total_qty, past_start, past_end
        )
        == 1
    )
    # 未來區間照樣被佔用
    assert (
        await booking_service.equipment_available_in_window(
            db, eq.id, eq.total_qty, date.today() + timedelta(days=60),
            date.today() + timedelta(days=61),
        )
        == 0
    )
