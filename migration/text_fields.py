"""舊系統 PDF/Word 裡的文字 → club-aio 結構化欄位,經人工轉錄的 CSV 中轉。

舊系統把「活動內容」放在企劃書 PDF、「成果」與「學習心得」放在結案上傳的
Word/PDF 附件裡,只有檔案沒有欄位,機器讀不出可信的結構。因此分兩步:

    uv run python ../migration/text_fields.py --export   # 產生待填 CSV
    (人工開檔對照 PDF 填寫)
    uv run python ../migration/text_fields.py --import migration/out/activity_texts_*.csv

CSV 規則:
- `legacy_id` 是唯一的對照鍵(舊系統 activity id),**不要改動、不要有重複列**;
  其餘無 `填_` 前綴的欄位都是唯讀參考(社團、活動名稱、日期、來源檔案路徑)
- `填_` 開頭的欄位才會寫入。**留白 = 不動**(不會清掉既有值),有值 = 覆寫
- `填_活動內容` 預先帶入舊系統的「活動描述」(`Club_activity.Review`,遷移時已寫進
  `Activity.content`),照著改即可;企劃書寫得更完整就以企劃書為準。**成果三欄舊制
  完全沒有**,只能從結案附件轉錄
- 心得欄位以 `填_心得N_姓名 / _系級 / _內容` 三件一組;要多寫幾篇就自己往後加
  `填_心得4_*` 欄,匯入端依欄名自動辨識。**同一活動只要有任一篇填了,就整批取代**
  該活動既有的心得(避免重跑時越加越多);但只要該列的心得有任何一組不完整或超長,
  **整列心得一律不動** —— 否則一個手滑會把已經填好的三篇砍成兩篇
- **每一欄都有長度上限**(取自 `app/schemas/activities.py`,與社團自己填的同一套)。
  超長不是小事:這些活動有 60 筆是 `rejected`、21 筆 `pending_advisor`,社團本來
  就要改完重送,欄位塞了 300 字進去會讓他們一按儲存就 422,而且自己改不掉
- 匯入可重跑;有問題的列會逐列列出並跳過該項,其餘照常寫入,修好 CSV 再跑一次即可
"""

# ruff: noqa: E402 - sys.path 調整必須先於 app 匯入(同 cms_import.py)
import argparse
import asyncio
import csv
import os
import re
import sys
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path

MIGRATION_DIR = Path(__file__).resolve().parent
BACKEND_DIR = MIGRATION_DIR.parent / "backend"
sys.path.insert(0, str(BACKEND_DIR))
sys.path.insert(0, str(MIGRATION_DIR))

import sqlalchemy as sa
from cms_import import _max_len, _scope_bounds, local_date
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from app.core.config import settings
from app.core.db import async_session_factory
from app.models import Activity, ActivityReflection, ActivityReport, LegacyIdMap
from app.models.enums import LegacySystem
from app.schemas.activities import ActivityIn, CloseSubmitIn, ReflectionIn

# 舊 Club_activity.status → 顯示用中文(僅供人工對照,不參與匯入)
STATUS_LABELS = {
    0: "審核中",
    1: "退回申請",
    4: "等待回報中",
    5: "核銷中",
    6: "已完成",
    11: "退回核銷",
}

# 成果三欄:CSV 欄名 → ActivityReport 屬性
REPORT_FIELDS = {
    "填_成果_執行成效": "highlights",
    "填_成果_目標達成": "goals",
    "填_成果_其他": "others",
}
CONTENT_FIELD = "填_活動內容"
REFLECTION_SLOTS = 3  # 預先開的心得欄組數(送審門檻 MIN_REFLECTIONS=3);可自行加欄
_REFLECTION_RE = re.compile(r"^填_心得(\d+)_(姓名|系級|內容)$")
_REFLECTION_ATTRS = {"姓名": "student_name", "系級": "dept", "內容": "body"}

READONLY_HEADER = ["legacy_id", "社團", "活動名稱", "活動日期", "狀態", "企劃書", "結案文件"]


CONTENT_MAX = _max_len(ActivityIn, "content")
REPORT_MAX = {attr: _max_len(CloseSubmitIn, attr) for attr in REPORT_FIELDS.values()}
REFLECTION_MAX = {attr: _max_len(ReflectionIn, attr) for attr in _REFLECTION_ATTRS.values()}
REFLECTIONS_MAX = _max_len(CloseSubmitIn, "reflections")


def _reflection_header() -> list[str]:
    return [
        f"填_心得{n}_{part}"
        for n in range(1, REFLECTION_SLOTS + 1)
        for part in _REFLECTION_ATTRS
    ]


def _date_label(start: date | None, end: date | None) -> str:
    if start is None:
        return ""
    return start.isoformat() if end in (None, start) else f"{start.isoformat()}~{end.isoformat()}"


# ---------------------------------------------------------------------------
# 匯出
# ---------------------------------------------------------------------------
async def export(legacy, db: AsyncSession) -> Path:
    out_dir = MIGRATION_DIR / "out"
    out_dir.mkdir(exist_ok=True)
    out = out_dir / f"activity_texts_{date.today().isoformat()}.csv"
    # 同一天再跑一次就會把手工填到一半的內容整份截斷,幾天的轉錄工作無聲歸零
    if out.exists():
        sys.exit(
            f"{out} 已存在,拒絕覆寫(裡面可能是填到一半的轉錄內容)。\n"
            "要重新產生請先改名或刪除該檔。"
        )

    scope_start, scope_end = _scope_bounds()
    acts = (
        await legacy.execute(
            sa.text(
                'SELECT a.id, c."Name" AS club, a."Name" AS name, a."StartTime", a."EndTime",'
                ' a.status, a."PlanFile", a."Review"'
                ' FROM "Club_activity" a JOIN "Club_club" c ON c.id = a."FK_Club_id"'
                ' WHERE a."StartTime" >= :start AND a."StartTime" < :end ORDER BY a.id'
            ),
            {"start": scope_start, "end": scope_end},
        )
    ).all()
    docs: dict[int, list[str]] = defaultdict(list)
    for row in await legacy.execute(
        sa.text('SELECT "FK_Activity_id" AS aid, file FROM "Club_activityfiles" ORDER BY id')
    ):
        docs[row.aid].append(row.file)

    migrated = {
        int(legacy_id)
        for (legacy_id,) in await db.execute(
            sa.select(LegacyIdMap.legacy_id).where(
                LegacyIdMap.legacy_system == LegacySystem.CMS,
                LegacyIdMap.legacy_table == "Club_activity",
            )
        )
    }

    header = [*READONLY_HEADER, CONTENT_FIELD, *REPORT_FIELDS, *_reflection_header()]
    written = no_source = not_migrated = 0
    # utf-8-sig:Excel 沒有 BOM 會把中文讀成亂碼
    with out.open("w", newline="", encoding="utf-8-sig") as fh:
        writer = csv.writer(fh)
        writer.writerow(header)
        for a in acts:
            if a.id not in migrated:
                not_migrated += 1  # 不遷的社團或未知狀態,cms_import 已跳過
                continue
            plan = (a.PlanFile or "").strip()
            attachments = docs.get(a.id, [])
            if not plan and not attachments:
                no_source += 1  # 沒有來源檔可轉錄,列出來只是徒增空白列
                continue
            # Review = 申請表的「活動描述」,cms_import 已寫進 Activity.content;
            # 這裡帶出來只是讓轉錄者對照企劃書時知道舊系統原本寫了什麼
            prefill = {CONTENT_FIELD: (a.Review or "").strip()}
            writer.writerow(
                [
                    a.id,
                    a.club,
                    a.name,
                    _date_label(local_date(a.StartTime), local_date(a.EndTime)),
                    STATUS_LABELS.get(a.status, str(a.status)),
                    plan,
                    ";".join(attachments),
                    # 預帶舊系統的「活動描述」(遷移時已寫進 Activity.content);
                    # 企劃書有更完整的敘述就照企劃書改寫
                    prefill.get(CONTENT_FIELD, ""),
                    *["" for _col in REPORT_FIELDS],  # 成果三欄舊制沒有,全靠轉錄
                    *[""] * (REFLECTION_SLOTS * len(_REFLECTION_ATTRS)),
                ]
            )
            written += 1
    print(
        f"匯出 {written} 列 → {out}"
        f"\n  略過:無來源檔 {no_source}、未遷入 {not_migrated}"
        f"\n  檔案路徑相對於 club_media/,例:open legacy/club_media/<路徑>"
    )
    return out


# ---------------------------------------------------------------------------
# 匯入
# ---------------------------------------------------------------------------
def parse_reflections(row: dict[str, str], header: list[str]) -> tuple[list[dict], list[str]]:
    """把 `填_心得N_*` 欄位收成一組組心得;回傳 (完整的組, 該列的問題敘述)。

    有任何問題時呼叫端一律整列不動心得 —— 半套取代會把既有的砍掉。
    """
    slots: dict[int, dict[str, str]] = defaultdict(dict)
    for col in header:
        m = _REFLECTION_RE.match(col)
        if m:
            slots[int(m.group(1))][m.group(2)] = (row.get(col) or "").strip()
    out: list[dict] = []
    problems: list[str] = []
    for n in sorted(slots):
        parts = slots[n]
        filled = {k: v for k, v in parts.items() if v}
        if not filled:
            continue
        if len(filled) < len(_REFLECTION_ATTRS):
            problems.append(f"心得{n} 只填了 {'、'.join(sorted(filled))},三欄要一起填")
            continue
        over = [
            f"{part} {len(parts[part])} 字 > {REFLECTION_MAX[attr]}"
            for part, attr in _REFLECTION_ATTRS.items()
            if len(parts[part]) > REFLECTION_MAX[attr]
        ]
        if over:
            problems.append(f"心得{n} 超過上限({'、'.join(over)})")
            continue
        out.append({attr: parts[part] for part, attr in _REFLECTION_ATTRS.items()})
    if len(out) > REFLECTIONS_MAX:
        problems.append(f"心得 {len(out)} 篇,超過上限 {REFLECTIONS_MAX} 篇")
    return out, problems


async def apply_csv(db: AsyncSession, path: Path) -> None:
    with path.open(newline="", encoding="utf-8-sig") as fh:
        reader = csv.DictReader(fh)
        header = reader.fieldnames or []
        rows = list(reader)
    if "legacy_id" not in header:
        sys.exit(f"CSV 缺少 legacy_id 欄:{path}")
    # 同一活動兩列會互相覆蓋(心得還會先寫再刪),1,185 列手工編輯很容易貼出重複列
    seen_ids = Counter(filter(None, ((r.get("legacy_id") or "").strip() for r in rows)))
    dupes = [lid for lid, n in seen_ids.items() if n > 1]
    if dupes:
        sys.exit(
            f"CSV 有 {len(dupes)} 個重複的 legacy_id:{'、'.join(dupes[:10])}"
            + (" …" if len(dupes) > 10 else "")
            + "\n同一活動出現兩列會互相覆蓋,請先合併再匯入。"
        )

    id_map = {
        int(legacy_id): int(new_id)
        for legacy_id, new_id in await db.execute(
            sa.select(LegacyIdMap.legacy_id, LegacyIdMap.new_id).where(
                LegacyIdMap.legacy_system == LegacySystem.CMS,
                LegacyIdMap.legacy_table == "Club_activity",
            )
        )
    }
    reports = {aid for (aid,) in await db.execute(sa.select(ActivityReport.activity_id))}

    problems: list[str] = []
    contents = updated_reports = replaced_reflections = 0
    for line, row in enumerate(rows, start=2):  # 2 = 表頭之後的第一列
        raw_id = (row.get("legacy_id") or "").strip()
        if not raw_id:
            continue
        if not raw_id.isdigit() or int(raw_id) not in id_map:
            problems.append(f"第 {line} 列:legacy_id={raw_id!r} 對不到已遷入的活動")
            continue
        activity_id = id_map[int(raw_id)]

        content = (row.get(CONTENT_FIELD) or "").strip()
        if content and len(content) > CONTENT_MAX:
            problems.append(
                f"第 {line} 列:活動內容 {len(content)} 字 > 上限 {CONTENT_MAX},該欄跳過"
            )
        elif content:
            await db.execute(
                sa.update(Activity).where(Activity.id == activity_id).values(content=content)
            )
            contents += 1

        report_values = {
            attr: value
            for col, attr in REPORT_FIELDS.items()
            if (value := (row.get(col) or "").strip())
        }
        over = [
            f"{col} {len(report_values[attr])} 字 > {REPORT_MAX[attr]}"
            for col, attr in REPORT_FIELDS.items()
            if attr in report_values and len(report_values[attr]) > REPORT_MAX[attr]
        ]
        if over:
            problems.append(f"第 {line} 列:{'、'.join(over)},成果三欄整組跳過")
            report_values = {}

        reflections, row_problems = parse_reflections(row, header)
        if row_problems:
            problems += [f"第 {line} 列:{p}" for p in row_problems]
            reflections = []  # 整列不動:半套取代會把既有的心得砍掉

        if not report_values and not reflections:
            continue
        if activity_id not in reports:
            problems.append(f"第 {line} 列:活動未結案(沒有成果表),成果與心得無處可寫,已跳過")
            continue
        if report_values:
            await db.execute(
                sa.update(ActivityReport)
                .where(ActivityReport.activity_id == activity_id)
                .values(**report_values)
            )
            updated_reports += 1
        if reflections:
            # 整批取代:重跑同一份 CSV 不會越加越多
            await db.execute(
                sa.delete(ActivityReflection).where(ActivityReflection.report_id == activity_id)
            )
            db.add_all(ActivityReflection(report_id=activity_id, **r) for r in reflections)
            replaced_reflections += len(reflections)
    await db.commit()

    print(
        f"匯入完成:活動內容 {contents} 筆、成果 {updated_reports} 筆、"
        f"心得 {replaced_reflections} 篇"
    )
    if problems:
        print(f"\n有 {len(problems)} 項問題(該項已跳過,修好 CSV 再跑一次即可):")
        for p in problems[:50]:
            print(f"  {p}")
        if len(problems) > 50:
            print(f"  …另有 {len(problems) - 50} 項")


async def main() -> None:
    parser = argparse.ArgumentParser(
        description="舊系統企劃書/結案文字的人工轉錄 CSV",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--export", action="store_true", help="產生待填 CSV")
    group.add_argument("--import", dest="csv_path", metavar="CSV", help="把填好的 CSV 寫回")
    args = parser.parse_args()

    async with async_session_factory() as db:
        if args.export:
            legacy_engine = create_async_engine(
                settings.sqlalchemy_url.set(database=os.environ.get("LEGACY_DB", "legacy_clubs"))
            )
            async with legacy_engine.connect() as legacy:
                await export(legacy, db)
            await legacy_engine.dispose()
            return
        path = Path(args.csv_path)
        if not path.is_file():
            sys.exit(f"找不到 CSV:{path}")
        await apply_csv(db, path)


if __name__ == "__main__":
    asyncio.run(main())
