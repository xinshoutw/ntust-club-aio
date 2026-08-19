"""將資料庫還原到最初始狀態(危險操作:清空所有資料)。

流程:DROP SCHEMA public → alembic upgrade head → 基礎主檔 seed(五獎項、19 場地)
→ 建立 superadmin。除此之外全部清空。

用法:
  uv run python scripts/reset_db.py --yes [--admin-username super] [--admin-password '...']
未給 --admin-password 時自動產生一組符合密碼政策的一次性密碼並印出;
superadmin 首登一律強制改密。未給 --yes 時需互動輸入 YES 確認。
"""

# ruff: noqa: E402 - sys.path 調整必須先於 app 匯入(同 tests/conftest.py)
import argparse
import asyncio
import secrets
import string
import subprocess
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))  # 讓 scripts/ 可 import app

import sqlalchemy as sa

from app.core.db import engine
from scripts._safety import refuse_on_prod
from scripts.seed import seed


def generate_password(length: int = 14) -> str:
    """產生符合政策的密碼(≥10 碼含大小寫+數字+特殊符號)。"""
    specials = "!@#$%^&*"
    pools = (string.ascii_uppercase, string.ascii_lowercase, string.digits, specials)
    chars = [secrets.choice(pool) for pool in pools]
    everything = "".join(pools)
    chars += [secrets.choice(everything) for _ in range(length - len(chars))]
    secrets.SystemRandom().shuffle(chars)
    return "".join(chars)


async def drop_all() -> None:
    async with engine.begin() as conn:
        await conn.execute(sa.text("DROP SCHEMA public CASCADE"))
        await conn.execute(sa.text("CREATE SCHEMA public"))
    await engine.dispose()
    print("schema dropped and recreated")


def upgrade_head() -> None:
    subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"], cwd=BACKEND_DIR, check=True
    )
    print("alembic upgraded to head")


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--yes", action="store_true", help="跳過互動確認")
    parser.add_argument("--admin-username", default="super")
    parser.add_argument("--admin-password", default=None)
    args = parser.parse_args()

    refuse_on_prod("還原資料庫")

    if not args.yes:
        answer = input("此操作會刪除資料庫全部資料,輸入 YES 繼續:")
        if answer.strip() != "YES":
            print("已取消")
            return

    password = args.admin_password or generate_password()
    await drop_all()
    upgrade_head()
    await seed(args.admin_username, password)

    print("---")
    print(f"superadmin 帳號:{args.admin_username}")
    if args.admin_password is None:
        print(f"superadmin 一次性密碼:{password}(首登強制改密,請立即保存)")
    else:
        print("superadmin 密碼:使用 --admin-password 指定值(首登強制改密)")


if __name__ == "__main__":
    asyncio.run(main())
