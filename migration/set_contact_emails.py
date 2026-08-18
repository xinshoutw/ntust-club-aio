"""MIG-05:由各社最新學期的負責人學號推出社團聯絡 Email(idempotent)。

遷移完成後跑一次。舊系統沒有社團聯絡信箱,不補的話公告的 Email 通知會寄給 0 個收件人。

規則:每社取「有負責人的最新學期」那一筆,`學號@mail.ntust.edu.tw` 寫入 `clubs.contact_emails`。
Discord webhook 維持空值(社團自行於管理項目設定)。

用法(於 backend/ 下):
    uv run python ../migration/set_contact_emails.py          # 試跑,只印不寫
    uv run python ../migration/set_contact_emails.py --yes    # 實際寫入

預設只填「目前為空」的社團,不動已設定的值(社團可能已自行改過)。
--overwrite 才會覆寫既有值。

**輸出分三組**:當學期或上學期的名單(位址應可用)、更早學期的名單
(負責人多半已畢業,學號信箱可能已停用)、無法推得的社團。第二組要人工確認。
"""

# ruff: noqa: E402 - sys.path 調整必須先於 app 匯入(同 cms_import.py)
import argparse
import asyncio
import re
import sys
from datetime import datetime
from pathlib import Path

MIGRATION_DIR = Path(__file__).resolve().parent
BACKEND_DIR = MIGRATION_DIR.parent / "backend"
sys.path.insert(0, str(BACKEND_DIR))

import sqlalchemy as sa

from app.core.db import async_session_factory
from app.core.semesters import TAIPEI, semester_of
from app.models import Club, ClubMember
from app.models.enums import MemberKind

MAIL_DOMAIN = "@mail.ntust.edu.tw"
# 臺科大學號:一碼英文 + 8 碼數字(如 B11315009)。放寬到 7–9 碼容納舊制,
# 對不上的一律列為例外而不是硬拼一個寄不出去的位址。
STUDENT_ID_RE = re.compile(r"^[A-Za-z]\d{7,9}$")
# 距今幾個學期內的名單視為「位址應可用」;更早的負責人多半已畢業
FRESH_WITHIN_SEMESTERS = 1


def semester_key(label: str) -> tuple[int, int]:
    """'114-2' → (114, 2)。字典序在學年碼位數不一致時會錯,一律轉數值比較。"""
    year, _, term = label.partition("-")
    try:
        return int(year), int(term)
    except ValueError:
        return (0, 0)  # 格式異常者排到最舊,自然落入需人工確認那組


def semesters_between(older: str, newer: str) -> int:
    (y1, t1), (y2, t2) = semester_key(older), semester_key(newer)
    return (y2 - y1) * 2 + (t2 - t1)


def email_of(student_id: str) -> str:
    return student_id.strip().upper() + MAIL_DOMAIN


async def collect() -> tuple[list[tuple[Club, str, str]], list[tuple[Club, str]]]:
    """回傳 (可設定的 [社團, 學期, email],例外的 [社團, 原因])。"""
    async with async_session_factory() as db:
        clubs = (await db.scalars(sa.select(Club).order_by(Club.id))).all()
        rows = (
            await db.execute(
                sa.select(
                    ClubMember.club_id,
                    ClubMember.semester,
                    ClubMember.student_id,
                    ClubMember.name,
                ).where(ClubMember.kind == MemberKind.PRESIDENT)
            )
        ).mappings().all()

    # 每社取最新學期;同學期多筆負責人取名單中第一筆
    latest: dict[int, dict] = {}
    for row in rows:
        best = latest.get(row["club_id"])
        if best is None or semester_key(row["semester"]) > semester_key(best["semester"]):
            latest[row["club_id"]] = dict(row)

    ready: list[tuple[Club, str, str]] = []
    problems: list[tuple[Club, str]] = []
    for club in clubs:
        row = latest.get(club.id)
        if row is None:
            problems.append((club, "名單中查無任何學期的負責人"))
            continue
        sid = (row["student_id"] or "").strip()
        if not STUDENT_ID_RE.match(sid):
            problems.append(
                (club, f"負責人 {row['name']} 的學號格式無法辨識:{sid!r}({row['semester']})")
            )
            continue
        ready.append((club, row["semester"], email_of(sid)))
    return ready, problems


async def apply(ready: list[tuple[Club, str, str]], overwrite: bool) -> int:
    changed = 0
    async with async_session_factory() as db:
        for club, _semester, email in ready:
            row = await db.get(Club, club.id)
            if row is None or row.contact_emails == [email]:
                continue
            if row.contact_emails and not overwrite:
                continue
            row.contact_emails = [email]
            changed += 1
        await db.commit()
    return changed


def report(
    title: str, items: list[tuple[Club, str, str]], overwrite: bool
) -> None:
    if not items:
        return
    print(f"\n=== {title}({len(items)} 社)===")
    for club, semester, email in items:
        mark = "略過" if (club.contact_emails and not overwrite) else "設定"
        print(f"  [{mark}] {club.name}({semester}) → {email}")


async def main() -> None:
    parser = argparse.ArgumentParser(description="由負責人學號設定社團聯絡 Email")
    parser.add_argument("--yes", action="store_true", help="實際寫入(未給則只試跑)")
    parser.add_argument(
        "--overwrite", action="store_true", help="連已設定的社團一併覆寫"
    )
    args = parser.parse_args()

    now = semester_of(datetime.now(TAIPEI).date())
    ready, problems = await collect()
    fresh = [r for r in ready if semesters_between(r[1], now) <= FRESH_WITHIN_SEMESTERS]
    stale = [r for r in ready if semesters_between(r[1], now) > FRESH_WITHIN_SEMESTERS]

    print(f"當學期:{now}　推得 Email:{len(ready)} 社;無法推得:{len(problems)} 社")

    report("位址應可用", fresh, args.overwrite)
    report("名單較舊,負責人可能已畢業(請人工確認)", stale, args.overwrite)

    if problems:
        print(f"\n=== 無法推得,需要人工處理({len(problems)} 社)===")
        for club, why in problems:
            print(f"  {club.name}:{why}")

    if not args.yes:
        print("\n(試跑,未寫入。確認無誤後加 --yes 實際執行)")
        return

    changed = await apply(ready, args.overwrite)
    print(f"\n已寫入 {changed} 社的聯絡 Email。Discord webhook 一律維持空值。")


if __name__ == "__main__":
    asyncio.run(main())
