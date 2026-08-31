"""`/public/*`:未登入首頁、社團端借用總覽、行政端場況圖共用的同一份色格資料。

四支都不必登入;登入中的社團仍拿得到 `mine`(自己已核准的借用另外上色)。
"""

from datetime import date, timedelta

from app.models import Equipment, Venue, VenueBooking
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


async def test_public_endpoints_need_no_login(client, db):
    venue, equipment = await seed(db)
    iso = DAY.isoformat()

    periods = (await client.get("/api/v1/public/periods")).json()["data"]
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
