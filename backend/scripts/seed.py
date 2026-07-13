"""初始資料:五獎項 + 最高權限管理員。

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
from app.models import Award, User
from app.models.enums import AwardKind, UserRole

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


async def seed(admin_username: str | None, admin_password: str | None) -> None:
    async with async_session_factory() as db:
        for award in AWARDS:
            if await db.get(Award, award.id) is None:
                db.add(award)
                print(f"award created: {award.id}")

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
