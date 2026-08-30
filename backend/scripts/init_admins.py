"""行政帳號初始化:授出權限鍵、建立缺少的帳號、刪掉不該留的帳號(idempotent)。

遷移進來的行政帳號**權限鍵全是空的**(只有 super 看得到頁面),分工由承辦決定後
才授得出去。這支把那份分工寫成程式碼裡的一張表,重跑會收斂到同一個結果。

用法(於 backend/ 下):
    uv run python scripts/init_admins.py          # 預覽,不寫入
    uv run python scripts/init_admins.py --yes    # 實際寫入

`ADMINS` 是**期望狀態**,不在表內的既有管理員不受影響(要停用或刪除請寫進 `DELETE`)。
每次重跑都以表為準覆寫 `permissions` 與 `is_super` —— 在畫面上手動加的鍵會被收回。

**權限用顯示詞而不是鍵**:這張表是給承辦核對分工用的,`areview` 沒有人看得懂。
顯示詞的唯一來源是 `core/permissions.py`,拼錯或改過就在這裡直接中止,
不會靜靜地寫進一把沒有作用的鍵。

`name` 只在**建立**帳號時使用;既有帳號的姓名沿用遷移帶進來的值,不覆寫
(表裡不留姓名的帳號 = 預期由 `migration/cms_import.py` 帶進來,不存在就報錯)。
"""

# ruff: noqa: E402 - sys.path 調整必須先於 app 匯入(同 set_passwords.py)
import argparse
import asyncio
import sys
from pathlib import Path
from typing import NamedTuple

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))  # 讓 scripts/ 可 import app

import sqlalchemy as sa
from sqlalchemy.exc import IntegrityError

from app.core.db import async_session_factory
from app.core.permissions import ADMIN_PAGES, APPROVAL_STAGES, PAGE_KEYS, STAGE_KEYS
from app.core.security import generate_password, hash_password, validate_password_strength
from app.models import Session, User
from app.models.enums import UserRole

# 顯示詞 → 權限鍵。`core/permissions.py` 是唯一來源,這裡只是反查
LABEL_TO_KEY = {p.label: p.key for p in ADMIN_PAGES} | {
    label: key for key, label in APPROVAL_STAGES
}
KEY_TO_LABEL = {key: label for label, key in LABEL_TO_KEY.items()}
# 依 catalogue 順序排,重跑不會因為順序不同而看起來有變動
KEY_ORDER = {p.key: i for i, p in enumerate(ADMIN_PAGES)} | {
    key: len(ADMIN_PAGES) + i for i, (key, _) in enumerate(APPROVAL_STAGES)
}

ALL = ("*",)  # 全給:所有頁面鍵 + 三個簽核關卡鍵


class Admin(NamedTuple):
    username: str
    perms: tuple[str, ...] = ()  # 顯示詞;`ALL` 代表全給
    is_super: bool = False  # super 全通,不必列 perms
    name: str | None = None  # 僅建立時使用;None = 必須已經存在


# ---------------------------------------------------------------------------
# 這張表就是分工本身。改權限請改這裡,不要在畫面上手動加 —— 下次重跑會被收回。
ADMINS: tuple[Admin, ...] = (
    Admin("xinshoutw", is_super=True, name="黃宥維"),
    Admin(
        "900",
        (
            "申請審核",
            "所有活動",
            "社團總覽",
            "成員列表",
            "社團活動列表",
            "社團管理項目",
            "學務長簽核",
        ),
    ),
    Admin(
        "800",
        (
            "申請審核",
            "所有活動",
            "社團總覽",
            "成員列表",
            "社團活動列表",
            "社團管理項目",
            "逾期追蹤與停權",
            "組長簽核",
        ),
    ),
    Admin("taiwanpt", ALL),
    Admin(
        "ntust6131",
        (
            "申請審核",
            "結案審核",
            "所有活動",
            "報名管理",
            "發布系統公告",
            "社團總覽",
            "成員列表",
            "社團活動列表",
            "社團管理項目",
            "幹部證明管理",
            "郵局帳戶管理",
            "違規管理",
            "檔案管理",
            "稽核軌跡",
            "承辦人簽核",
        ),
    ),
)

# 刪掉的帳號:舊系統帶進來的測試與已離職帳號。
# 還有資料引用著的(簽核過、上傳過、建過活動)一律不刪 —— 刪了就讀不出「誰簽的」
DELETE: tuple[str, ...] = ("apitest", "teach", "chin", "101101101", "9000")
# ---------------------------------------------------------------------------


def resolve(admin: Admin) -> list[str]:
    """顯示詞 → 權限鍵;super 不需要鍵(全通)。拼錯就中止。"""
    if admin.is_super:
        return []
    if admin.perms == ALL:
        return sorted(PAGE_KEYS | STAGE_KEYS, key=KEY_ORDER.__getitem__)
    unknown = [label for label in admin.perms if label not in LABEL_TO_KEY]
    if unknown:
        sys.exit(
            f"{admin.username}:認不得的權限顯示詞 {'、'.join(unknown)}。\n"
            f"可用的顯示詞見 app/core/permissions.py:{'、'.join(LABEL_TO_KEY)}"
        )
    keys = {LABEL_TO_KEY[label] for label in admin.perms}
    return sorted(keys, key=KEY_ORDER.__getitem__)


async def apply_admin(db, admin: Admin, wanted: list[str], write: bool) -> str:
    """回傳一行給人看的結果描述。"""
    user = await db.scalar(sa.select(User).where(User.username == admin.username))
    if user is None:
        if admin.name is None:
            sys.exit(
                f"{admin.username}:帳號不存在,而表裡沒有姓名可以建立。\n"
                "這個帳號預期由 migration/cms_import.py 帶進來 —— 請先確認遷移已跑過。"
            )
        password = generate_password()
        validate_password_strength(password)
        if write:
            db.add(
                User(
                    role=UserRole.ADMIN,
                    username=admin.username,
                    password_hash=hash_password(password),
                    name=admin.name,
                    is_super=admin.is_super,
                    permissions=wanted,
                    must_change_password=True,
                )
            )
        return (
            f"  建立 {admin.username}({admin.name})"
            f"{' [最高權限]' if admin.is_super else f' {len(wanted)} 把鍵'}"
            f"　一次性密碼:{password}(首登強制改密)"
        )

    changes = []
    if list(user.permissions or []) != wanted:
        changes.append(f"權限 {len(user.permissions or [])} → {len(wanted)} 把")
    if user.is_super != admin.is_super:
        changes.append(f"is_super {user.is_super} → {admin.is_super}")
    if write:
        user.permissions = wanted
        user.is_super = admin.is_super
    # 由**寫進去的鍵**反查顯示詞,不是印回表裡那串 —— 「全給」才看得出實際授了什麼
    label = "最高權限" if admin.is_super else "、".join(KEY_TO_LABEL[k] for k in wanted) or "無"
    detail = "無變動" if not changes else "、".join(changes)
    return f"  {admin.username}({user.name}) {detail}\n      → {label}"


async def delete_user(db, username: str, write: bool) -> str:
    user = await db.scalar(sa.select(User).where(User.username == username))
    if user is None:
        return f"  {username}:不存在,略過"
    if not write:
        return f"  {username}({user.name}):將刪除"
    # 外鍵是 NO ACTION:簽核過/上傳過/建過活動的帳號刪不掉,而那正是不該刪的情況。
    # 用 savepoint 讓失敗的那一個不會連坐整批
    await db.execute(sa.delete(Session).where(Session.user_id == user.id))
    try:
        async with db.begin_nested():
            await db.delete(user)
            await db.flush()
    except IntegrityError:
        return f"  {username}({user.name}):**未刪除** —— 還有資料引用著(簽核/上傳/建立紀錄)"
    return f"  {username}({user.name}):已刪除"


async def main() -> None:
    parser = argparse.ArgumentParser(
        description="行政帳號初始化(授權限、建帳號、刪帳號)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("--yes", action="store_true", help="實際寫入;不加只列出不寫")
    args = parser.parse_args()

    resolved = [(admin, resolve(admin)) for admin in ADMINS]

    async with async_session_factory() as db:
        print(f"行政帳號({len(ADMINS)} 個):")
        for admin, wanted in resolved:
            print(await apply_admin(db, admin, wanted, args.yes))

        print(f"\n刪除({len(DELETE)} 個):")
        for username in DELETE:
            print(await delete_user(db, username, args.yes))

        # 表外的管理員:沒有列進分工,權限維持原樣。列出來是為了讓人看見有這些帳號
        listed = {a.username for a in ADMINS} | set(DELETE)
        others = list(
            await db.scalars(
                sa.select(User)
                .where(User.role == UserRole.ADMIN, User.username.notin_(listed))
                .order_by(User.username)
            )
        )
        if others:
            print(f"\n不在表內、未更動的管理員({len(others)} 個):")
            for u in others:
                flags = []
                if u.is_super:
                    flags.append("最高權限")
                if not u.is_active:
                    flags.append("已停用")
                n = len(u.permissions or [])
                flags.append(f"{n} 把鍵" if n else "無權限鍵")
                print(f"  {u.username}({u.name}) —— {'、'.join(flags)}")

        if not args.yes:
            await db.rollback()
            print("\n(預覽模式,未寫入。確認無誤後加 --yes)")
            return
        await db.commit()
        print("\n完成。")


if __name__ == "__main__":
    asyncio.run(main())
