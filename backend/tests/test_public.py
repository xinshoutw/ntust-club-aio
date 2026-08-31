"""`/public/*`:未登入首頁、社團端借用總覽、行政端場況圖共用的同一份色格資料。

四支都不必登入;登入中的社團仍拿得到 `mine`(自己已核准的借用另外上色),
審這一關的承辦(`abooking`)另外拿得到每格的待審單清單。
"""

from datetime import date, timedelta

import sqlalchemy as sa

from app.models import (
    Equipment,
    RoomBookingRequest,
    RoomBookingSlot,
    User,
    Venue,
    VenueBlockRule,
    VenueBooking,
)
from app.models.enums import VenueCategory
from tests.conftest import login, make_club, make_user

DAY = date.today() + timedelta(days=7)


async def seed(db) -> tuple[Venue, Equipment]:
    club = await make_club(db, name="熱舞社")
    await make_user(db, username="club01", club_id=club.id)
    venue = Venue(
        name="精誠廣場",
        capacity=200,
        category=VenueCategory.OUTDOOR,
        allow_fixed=False,
        allow_temp=True,
    )
    equipment = Equipment(name="無線麥克風", total_qty=4)
    db.add_all([venue, equipment])
    await db.commit()
    await db.refresh(venue)
    await db.refresh(equipment)
    db.add(
        VenueBooking(
            club_id=club.id,
            venue_id=venue.id,
            activity_id=None,
            date=DAY,
            periods=["3"],
            purpose="社課",
            status="approved",
        )
    )
    await db.commit()
    return venue, equipment


async def test_manual_booking_is_never_mine(client, db):
    """行政手動借用的 club_id 是 NULL —— 匿名(own_club_id 也是 None)不得標成 mine。"""
    venue, _ = await seed(db)
    db.add(
        VenueBooking(
            club_id=None,
            venue_id=venue.id,
            activity_id=None,
            date=DAY,
            periods=["5"],
            purpose="場地整理",
            status="approved",
        )
    )
    await db.commit()
    grid = (
        await client.get("/api/v1/public/bookings/availability", params={"date": DAY.isoformat()})
    ).json()["data"]["grid"]
    assert grid[str(venue.id)]["5"] == {"status": "temp", "club": "學務處"}


async def test_stale_session_cookie_still_gets_the_public_grid(client, db):
    """壞掉/過期的 session 當訪客處理,不是 401 —— 公開頁不該因為舊 cookie 打不開。"""
    await seed(db)
    client.cookies.set("session_id", "not-a-uuid")
    resp = await client.get(
        "/api/v1/public/bookings/availability", params={"date": DAY.isoformat()}
    )
    client.cookies.clear()
    assert resp.status_code == 200


async def test_block_reasons_are_admin_free_text_and_stay_private(client, db):
    """不開放原因是承辦自己打的字,匿名只看得到格色;登入的社團看得到原因。"""
    venue, _ = await seed(db)
    admin_id = await db.scalar(sa.select(User.id).order_by(User.id).limit(1))
    db.add(
        VenueBlockRule(
            venue_id=venue.id,
            start_date=DAY,
            end_date=DAY,
            weekdays=[],
            periods=["7"],
            reason="熱舞社違規停用",
            created_by=admin_id,
        )
    )
    await db.commit()
    iso = DAY.isoformat()

    def blocked(payload: dict) -> dict:
        return payload["data"]["grid"][str(venue.id)]["7"]

    anon = await client.get("/api/v1/public/bookings/availability", params={"date": iso})
    assert blocked(anon.json()) == {"status": "blocked", "club": None}
    anon_range = await client.get(
        "/api/v1/public/bookings/availability-range", params={"start": iso, "end": iso}
    )
    assert anon_range.json()["data"]["days"][0]["grid"][str(venue.id)]["7"]["club"] is None

    await login(client, "club01")
    signed_in = await client.get("/api/v1/public/bookings/availability", params={"date": iso})
    assert blocked(signed_in.json()) == {"status": "blocked", "club": "熱舞社違規停用"}


async def test_pending_list_is_for_the_officer_who_reviews_them(client, db):
    """待審單清單只給 `abooking`:已核准或不開放蓋掉格色,底下壓著誰的申請仍看得見。"""
    venue, _ = await seed(db)
    other = await make_club(db, name="吉他社")
    await make_user(db, username="bookadmin", role="admin", permissions=["abooking"])
    await make_user(db, username="viol", role="admin", permissions=["aviol"])
    admin_id = await db.scalar(sa.select(User.id).order_by(User.id).limit(1))

    def booking(club_id, periods, status="pending"):
        return VenueBooking(
            club_id=club_id, venue_id=venue.id, activity_id=None, date=DAY,
            periods=periods, purpose="彩排", status=status,
        )

    # "3" 已有本社已核准的借用(seed),再壓一張他社待審 → 格色是已核准,待審單仍在
    covered = booking(other.id, ["3"])
    # "9" 兩社搶同一格,兩筆都要在;"7" 被不開放規則蓋掉,待審單同樣要留著
    first, second = booking(other.id, ["9", "7"]), booking(None, ["9"])
    # "9" 另有一張待審的固定借用:標示得到但沒有申請 id(要到固定場地借用審核才審得了)
    fixed = RoomBookingRequest(
        club_id=other.id, venue_id=venue.id, purpose="社課",
        start_date=DAY - timedelta(days=30), end_date=DAY + timedelta(days=30),
    )
    fixed.slots = [RoomBookingSlot(weekday=DAY.isoweekday(), period="9")]
    db.add_all([covered, first, second, fixed])
    db.add(
        VenueBlockRule(
            venue_id=venue.id, start_date=DAY, end_date=DAY, weekdays=[],
            periods=["7"], reason="行政徵用", created_by=admin_id,
        )
    )
    await db.commit()
    await db.refresh(covered)
    await db.refresh(first)
    await db.refresh(second)
    iso = DAY.isoformat()

    async def grid(username: str | None) -> dict:
        if username:
            await login(client, username)
        resp = await client.get("/api/v1/public/bookings/availability", params={"date": iso})
        return resp.json()["data"]["grid"][str(venue.id)]

    # 匿名、社團、沒有這把鍵的管理員:整個 pending 欄位都不存在
    for who in (None, "club01", "viol"):
        cells = await grid(who)
        assert all("pending" not in c for c in cells.values()), who
        client.cookies.clear()

    cells = await grid("bookadmin")
    assert cells["3"]["status"] == "temp"  # 已核准蓋過審核中
    assert cells["3"]["pending"] == [{"id": covered.id, "club": "吉他社", "kind": "temp"}]
    assert cells["7"]["status"] == "blocked"  # 不開放蓋過一切
    assert cells["7"]["pending"] == [{"id": first.id, "club": "吉他社", "kind": "temp"}]
    # 同一格多筆:臨時借用在前(依申請 id 即送件序),固定借用在後且沒有申請 id;
    # 行政手動借用顯示「學務處」
    assert cells["9"]["pending"] == [
        {"id": first.id, "club": "吉他社", "kind": "temp"},
        {"id": second.id, "club": "學務處", "kind": "temp"},
        {"id": None, "club": "吉他社", "kind": "fixed"},
    ]
    # 沒有待審單的格子不掛空清單(區間端點一次可回 31 天 × 全校)
    assert "pending" not in cells["3"] or cells["3"]["pending"]

    # super 不必顯式持鍵;首登未改密的帳號則一律看不到(那不是公開資料)
    client.cookies.clear()
    await make_user(db, username="boss", role="admin", is_super=True)
    assert "pending" in (await grid("boss"))["9"]
    client.cookies.clear()
    await make_user(
        db, username="newadmin", role="admin", permissions=["abooking"],
        must_change_password=True,
    )
    assert "pending" not in (await grid("newadmin"))["9"]
    client.cookies.clear()
    await login(client, "bookadmin")
    # 區間端點同一份判定
    days = (
        await client.get(
            "/api/v1/public/bookings/availability-range", params={"start": iso, "end": iso}
        )
    ).json()["data"]["days"]
    assert days[0]["grid"][str(venue.id)]["7"]["pending"][0]["id"] == first.id


async def test_public_endpoints_need_no_login(client, db):
    venue, equipment = await seed(db)
    iso = DAY.isoformat()

    resp = await client.get("/api/v1/public/periods")
    assert resp.status_code == 200
    periods = resp.json()["data"]
    assert [p["key"] for p in periods][:3] == ["1", "2", "3"]
    assert periods[0]["start"] and periods[0]["end"]

    venues = (await client.get("/api/v1/public/venues")).json()["data"]
    assert [v["name"] for v in venues] == ["精誠廣場"]

    # 匿名看得到佔用與借用單位,但沒有「我的借用」—— 那要有 club_id 才判定得出來
    grid = (
        await client.get("/api/v1/public/bookings/availability", params={"date": iso})
    ).json()["data"]["grid"]
    assert grid[str(venue.id)]["3"] == {"status": "temp", "club": "熱舞社"}

    days = (
        await client.get(
            "/api/v1/public/bookings/availability-range", params={"start": iso, "end": iso}
        )
    ).json()["data"]["days"]
    assert days[0]["grid"][str(venue.id)]["3"]["status"] == "temp"

    usage = (
        await client.get("/api/v1/public/equipment/usage", params={"start": iso, "end": iso})
    ).json()["data"]
    assert usage == [{"id": equipment.id, "name": "無線麥克風", "total_qty": 4, "used": {}}]


async def test_public_grid_marks_mine_for_the_logged_in_club(client, db):
    """同一支端點、同一格:登入自己的社團帳號才會標 mine。"""
    venue, _ = await seed(db)
    await login(client, "club01")
    grid = (
        await client.get(
            "/api/v1/public/bookings/availability", params={"date": DAY.isoformat()}
        )
    ).json()["data"]["grid"]
    assert grid[str(venue.id)]["3"] == {"status": "mine", "club": "熱舞社"}
