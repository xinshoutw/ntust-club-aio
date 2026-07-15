"""初始資料:五獎項 + 19 處場地主檔 + 最高權限管理員。

用法:
  uv run python scripts/seed.py --admin-username super --admin-password '...'
密碼須符合政策(≥10 碼含大小寫+數字+特殊符號);重跑 idempotent(已存在即跳過)。
"""

import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # 讓 scripts/ 可 import app

import sqlalchemy as sa

from app.core.db import async_session_factory
from app.core.security import hash_password, validate_password_strength
from app.models import Award, User, Venue
from app.models.enums import AwardKind, UserRole, VenueCategory

# 五獎項(原型 AWARDS;rubric 逐年由行政建立/複製)
AWARDS = [
    Award(id="club", name="最佳社團獎", kind=AwardKind.GROUP, is_weighted=True, sort=1),
    Award(id="finance", name="最佳財務獎", kind=AwardKind.GROUP, has_presentation=True, sort=2),
    Award(id="activity", name="最佳活動獎", kind=AwardKind.GROUP, has_presentation=True, sort=3),
    Award(id="result", name="最佳成果發表獎", kind=AwardKind.GROUP, sort=4),
    Award(
        id="leader",
        name="最佳社團負責人獎",
        kind=AwardKind.INDIVIDUAL,
        has_presentation=True,
        sort=5,
    ),
]

# 場地主檔(2026-07-15 需求方定案 19 處,與 frontend/src/features/bookings/mock.ts VENUES 對齊;
# 之後由管理員後台維護,數量/容納人數可調)
# (名稱, 類別, 容納人數, allow_fixed, allow_temp)
VENUES: list[tuple[str, VenueCategory, int, bool, bool]] = [
    ("S204 共享食堂", VenueCategory.CLASSROOM, 60, True, True),
    ("S207", VenueCategory.CLASSROOM, 60, True, True),
    ("S209", VenueCategory.CLASSROOM, 60, True, True),
    ("S301", VenueCategory.CLASSROOM, 50, True, True),
    ("S302/S303", VenueCategory.CLASSROOM, 90, True, True),
    ("S304 音樂教室", VenueCategory.CLASSROOM, 50, True, True),
    ("S311", VenueCategory.CLASSROOM, 50, True, True),
    ("S312/S313", VenueCategory.CLASSROOM, 90, True, True),
    ("S314", VenueCategory.CLASSROOM, 50, True, True),
    ("練團室", VenueCategory.PRACTICE, 15, True, True),
    ("T4 舞蹈區", VenueCategory.PRACTICE, 15, True, True),
    ("3F 戶外廣場", VenueCategory.OUTDOOR, 200, False, True),
    ("戶外精誠廣場 1", VenueCategory.OUTDOOR, 150, False, True),
    ("戶外精誠廣場 2", VenueCategory.OUTDOOR, 150, False, True),
    ("戶外精誠廣場 3", VenueCategory.OUTDOOR, 150, False, True),
    ("戶外精誠廣場 4", VenueCategory.OUTDOOR, 150, False, True),
    ("戶外精誠廣場 5", VenueCategory.OUTDOOR, 150, False, True),
    ("一宿 B2 樓梯", VenueCategory.DORM, 120, False, True),
    ("一宿 B2 白板", VenueCategory.DORM, 120, False, True),
]


async def seed(admin_username: str | None, admin_password: str | None) -> None:
    async with async_session_factory() as db:
        for award in AWARDS:
            if await db.get(Award, award.id) is None:
                db.add(award)
                print(f"award created: {award.id}")

        for sort, (name, category, capacity, allow_fixed, allow_temp) in enumerate(VENUES, 1):
            exists = await db.scalar(sa.select(Venue.id).where(Venue.name == name))
            if exists is None:
                db.add(
                    Venue(
                        name=name,
                        category=category,
                        capacity=capacity,
                        allow_fixed=allow_fixed,
                        allow_temp=allow_temp,
                        sort=sort,
                    )
                )
                print(f"venue created: {name}")

        if admin_username and admin_password:
            exists = await db.scalar(sa.select(User.id).where(User.username == admin_username))
            if exists:
                print(f"admin exists: {admin_username}")
            else:
                validate_password_strength(admin_password)
                db.add(
                    User(
                        role=UserRole.ADMIN,
                        username=admin_username,
                        password_hash=hash_password(admin_password),
                        name="系統管理員",
                        is_super=True,
                        must_change_password=True,
                    )
                )
                print(f"super admin created: {admin_username}(首登需改密)")
        await db.commit()
    print("seed done")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--admin-username")
    parser.add_argument("--admin-password")
    args = parser.parse_args()
    asyncio.run(seed(args.admin_username, args.admin_password))
