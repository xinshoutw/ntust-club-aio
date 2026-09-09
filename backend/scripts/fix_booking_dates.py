"""一次性:把舊系統遷入、日期打錯年的臨時場地借用改回合理的年份。

clubclass 讓人手打日期,遷入的 15,152 筆臨時場地借用裡有 89 筆的借用日離建單時間超過一年
(2004、0110、2030 這種年),全部是打錯的年;除了一筆已核准,其餘都被承辦退回。它們讓
「所有場地借用」的學期下拉多出 90-1、-1909-1 這種學期,而且點下去查不到東西。

規則只有一條:**月日照舊,年份改成建單之後最先遇到的那一年** —— 借用日不可能早於建單日,
社團最多提前一學期申請,距建單超過一年的日期一定是打錯的。器材借用一筆都沒有這種列。
少數列的月日八成也打錯了(建單 2020-10-22、借用日 2024-10-20 這種),規則會把它們推到
下一年;都是退回件,只求年份不再污染學期下拉,不追求還原。

    cd backend
    uv run python scripts/fix_booking_dates.py          # 先看會改哪些(不寫入)
    uv run python scripts/fix_booking_dates.py --yes    # 實際寫入

正式機在容器內跑:

    docker compose exec -T backend uv run --no-dev python scripts/fix_booking_dates.py --yes

規則本身冪等:跑過一次之後再跑就是 0 筆。2 月 29 日改到平年會不存在,那種列跳過並列出,
人工處理。
"""

# ruff: noqa: E402 - sys.path 調整必須先於 app 匯入(同 scripts/import_holidays.py)
import argparse
import asyncio
import sys
from dataclasses import dataclass
from datetime import date
from pathlib import Path

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.db import async_session_factory
from app.core.semesters import TAIPEI
from app.models import Club, VenueBooking

# 借用日與建單日相差超過這個天數就當打錯年(正式資料裡正常列的最大差距是 ±361 天)
MAX_GAP_DAYS = 366


def intended_date(wrong: date, created: date) -> date | None:
    """月日照舊,年份改成建單之後最先遇到的那一年;2/29 兩年都不存在時回 None。"""
    for year in (created.year, created.year + 1):
        try:
            candidate = wrong.replace(year=year)
        except ValueError:  # 2/29 落在平年
            continue
        if candidate >= created:
            return candidate
    return None


@dataclass
class Change:
    booking: VenueBooking
    club: str
    created: date
    fixed: date | None


async def find_changes(db: AsyncSession) -> list[Change]:
    gap = sa.func.abs(VenueBooking.date - sa.cast(VenueBooking.created_at, sa.Date))
    rows = await db.execute(
        sa.select(VenueBooking, Club.name)
        .outerjoin(Club, VenueBooking.club_id == Club.id)
        .where(gap > MAX_GAP_DAYS)
        .order_by(VenueBooking.date, VenueBooking.id)
    )
    out: list[Change] = []
    for booking, club in rows:
        created = booking.created_at.astimezone(TAIPEI).date()
        out.append(Change(booking, club or "學務處", created, intended_date(booking.date, created)))
    return out


async def run(db: AsyncSession, *, write: bool) -> list[Change]:
    changes = await find_changes(db)
    for c in changes:
        arrow = f"→ {c.fixed}" if c.fixed else "→ 跳過(2/29)"
        print(
            f"{c.booking.id:>6}  {c.booking.date} {arrow}  建單 {c.created}  "
            f"{str(c.booking.status):<9} {c.club} · {c.booking.purpose[:16]}"
        )
    fixable = [c for c in changes if c.fixed]
    print(f"\n共 {len(changes)} 筆,可改 {len(fixable)} 筆")
    if write:
        for c in fixable:
            c.booking.date = c.fixed
        await db.commit()
        print(f"已寫入 {len(fixable)} 筆")
    elif changes:
        print("以上為預覽,加 --yes 才會寫入")
    return changes


async def main(write: bool) -> None:
    async with async_session_factory() as db:
        await run(db, write=write)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="修正舊系統遷入、日期打錯年的臨時場地借用")
    parser.add_argument("--yes", action="store_true", help="實際寫入;不加只列出不寫")
    asyncio.run(main(parser.parse_args().yes))
