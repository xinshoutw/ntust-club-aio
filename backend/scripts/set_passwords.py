"""批次設定帳號密碼(開發與展示環境用;ENV=prod 拒絕執行)。

**不加 `--yes` 只列出會影響哪些帳號,不寫入** —— 先看清楚再動手。

用法:
  # 全部帳號設成 Demo@12345,並關掉首登強制改密
  uv run python scripts/set_passwords.py --all --password 'Demo@12345' --no-change-required --yes

  # 只動社團與管理員
  uv run python scripts/set_passwords.py --club --admin --password 'Demo@12345' --yes

  # 只動指定帳號(可重複);與角色條件是聯集
  uv run python scripts/set_passwords.py --username 502 --username 702 \
      --password 'Demo@12345' --no-change-required --yes

選取條件(至少要給一個,彼此為聯集):
  --all / --club / --admin / --staff / --viewer / --super / --username NAME

每個被改到的帳號同時:
- **清掉登入失敗次數與鎖定** —— 不然「密碼改好了卻還是登不進去」
- **刪掉既有 session**(與 app 的改密流程一致:改密即登出所有裝置)
- **不寫 password_history**:這是管理端的強制覆寫,不是使用者自己改密;
  記進歷史會平白吃掉「3 代不重用」的額度

SSO 帳號(`auth_provider=sso`)一律略過:它們沒有本地密碼可設。
"""

# ruff: noqa: E402 - sys.path 調整必須先於 app 匯入(同 reset_db.py)
import argparse
import asyncio
import sys
from collections import Counter
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))  # 讓 scripts/ 可 import app

import sqlalchemy as sa

from app.core.db import async_session_factory
from app.core.security import hash_password, validate_password_strength
from app.models import Session, User
from app.models.enums import AuthProvider, UserRole
from scripts._safety import refuse_on_prod

# CLI 旗標 → 角色;要加角色只改這裡
ROLE_FLAGS = {
    "club": UserRole.CLUB,
    "admin": UserRole.ADMIN,
    "staff": UserRole.STAFF,
    "viewer": UserRole.VIEWER,
}
PREVIEW_LIMIT = 20  # 預覽時最多列幾個帳號名


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="批次設定帳號密碼(開發用)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("--password", required=True, help="要設定的密碼(須符合密碼政策)")
    parser.add_argument("--all", action="store_true", help="全部本地帳號")
    for flag, role in ROLE_FLAGS.items():
        parser.add_argument(f"--{flag}", action="store_true", help=f"role={role.value} 的帳號")
    parser.add_argument("--super", action="store_true", dest="is_super", help="is_super 的帳號")
    parser.add_argument(
        "--username", action="append", default=[], metavar="NAME", help="指定帳號(可重複)"
    )
    parser.add_argument(
        "--no-change-required", action="store_true", help="關掉首登強制改密(預設會強制)"
    )
    parser.add_argument("--yes", action="store_true", help="實際寫入;不加只列出不寫")
    return parser


def selection(args: argparse.Namespace) -> list:
    """把 CLI 旗標翻成 where 條件(聯集);沒給任何條件回空 list。"""
    roles = [role for flag, role in ROLE_FLAGS.items() if getattr(args, flag)]
    conditions = []
    if args.all:
        conditions.append(sa.true())
    if roles:
        conditions.append(User.role.in_(roles))
    if args.is_super:
        conditions.append(User.is_super.is_(True))
    if args.username:
        conditions.append(User.username.in_(args.username))
    return conditions


async def main() -> None:
    parser = build_parser()
    args = parser.parse_args()

    refuse_on_prod("批次設定密碼", "會覆寫一整批帳號的密碼")

    conditions = selection(args)
    if not conditions:
        parser.error(
            "至少要指定一個選取條件:--all / "
            + " / ".join(f"--{flag}" for flag in ROLE_FLAGS)
            + " / --super / --username"
        )
    try:
        validate_password_strength(args.password)
    except Exception as exc:  # noqa: BLE001 - AppError 在腳本裡只需要印訊息
        sys.exit(f"密碼不符政策:{getattr(exc, 'message', exc)}")

    async with async_session_factory() as db:
        users = list(
            await db.scalars(
                # SSO 帳號沒有本地密碼可設,不列入
                sa.select(User)
                .where(sa.or_(*conditions), User.auth_provider == AuthProvider.LOCAL)
                .order_by(User.id)
            )
        )
        if not users:
            print("沒有符合條件的帳號")
            return

        # 打錯帳號名時要看得見:靜靜地少改幾個比報錯還糟
        missing = sorted(set(args.username) - {u.username for u in users})
        if missing:
            print(f"找不到(或非本地帳號)的帳號名:{'、'.join(missing)}")

        by_role = Counter(u.role.value for u in users)
        names = [u.username for u in users]
        preview = "、".join(names[:PREVIEW_LIMIT])
        if len(names) > PREVIEW_LIMIT:
            preview += f" …等 {len(names)} 個"
        print(f"符合 {len(users)} 個帳號:{dict(by_role)}")
        print(f"  {preview}")
        print(f"  首登強制改密:{'關閉' if args.no_change_required else '開啟'}")

        if not args.yes:
            print("\n(預覽模式,未寫入。確認無誤後加 --yes)")
            return

        for user in users:
            user.password_hash = hash_password(args.password)
            user.must_change_password = not args.no_change_required
            # 沿用舊密碼鎖住的帳號,不清這兩欄就是「改了密碼還是登不進去」
            user.failed_login_attempts = 0
            user.locked_until = None
        killed = await db.execute(
            sa.delete(Session).where(Session.user_id.in_([u.id for u in users]))
        )
        await db.commit()
        print(f"\n已更新 {len(users)} 個帳號、登出 {killed.rowcount} 個 session")


if __name__ == "__main__":
    asyncio.run(main())
