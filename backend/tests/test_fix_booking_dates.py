"""scripts/fix_booking_dates.py:舊系統遷入、打錯年份的臨時場地借用。"""

import sys
from datetime import UTC, date, datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

import fix_booking_dates  # noqa: E402

from app.models import Venue, VenueBooking  # noqa: E402
from app.models.enums import VenueCategory  # noqa: E402
from tests.conftest import make_club  # noqa: E402


def test_intended_date_keeps_month_day_and_picks_first_year_after_creation():
    fix = fix_booking_dates.intended_date
    assert fix(date(2004, 3, 17), date(2020, 3, 16)) == date(2020, 3, 17)
    assert fix(date(2030, 1, 30), date(2022, 12, 22)) == date(2023, 1, 30)
    assert fix(date(110, 9, 30), date(2021, 9, 27)) == date(2021, 9, 30)
    # 月日早於建單日 → 推到下一年
    assert fix(date(2005, 2, 16), date(2021, 2, 26)) == date(2022, 2, 16)
    # 2/29:建單那年是平年就找下一年;兩年都不是就放棄
    assert fix(date(2000, 2, 29), date(2023, 3, 1)) == date(2024, 2, 29)
    assert fix(date(2000, 2, 29), date(2025, 3, 1)) is None


async def test_run_rewrites_only_bookings_more_than_a_year_from_creation(db):
    club = await make_club(db)
    venue = Venue(name="S311", capacity=40, category=VenueCategory.OUTDOOR,
                  allow_fixed=False, allow_temp=True)
    db.add(venue)
    await db.commit()
    await db.refresh(venue)
    created = datetime(2022, 12, 22, 10, 0, tzinfo=UTC)
    typo = VenueBooking(club_id=club.id, venue_id=venue.id, activity_id=None,
                        date=date(2030, 1, 30), periods=["3"], purpose="營隊練習",
                        status="approved", created_at=created)
    fine = VenueBooking(club_id=club.id, venue_id=venue.id, activity_id=None,
                        date=date(2023, 1, 30), periods=["4"], purpose="正常",
                        status="rejected", created_at=created)
    db.add_all([typo, fine])
    await db.commit()

    # 預覽:列出但不寫
    changes = await fix_booking_dates.run(db, write=False)
    assert [(c.booking.id, c.fixed) for c in changes] == [(typo.id, date(2023, 1, 30))]
    await db.refresh(typo)
    assert typo.date == date(2030, 1, 30)

    await fix_booking_dates.run(db, write=True)
    await db.refresh(typo)
    await db.refresh(fine)
    assert typo.date == date(2023, 1, 30)
    assert fine.date == date(2023, 1, 30)  # 正常的列不動
    assert await fix_booking_dates.run(db, write=True) == []  # 冪等
