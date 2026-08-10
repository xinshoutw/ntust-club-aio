"""clubclass(教室與器材借用)→ club-aio 資料遷移(idempotent)。

用法(於 backend/ 下;dump 先還原到本機 MySQL,預設 127.0.0.1:3307 root/root cc):
    docker run -d --name cc-legacy -p 127.0.0.1:3307:3306 \
        -e MYSQL_ROOT_PASSWORD=root -e MYSQL_DATABASE=cc mysql:8.0
    docker exec -i cc-legacy mysql -uroot -proot cc < cc_YYYY-MM-DD.sql
    uv run python ../migration/cc_import.py

前置:cms_import.py 已跑完(club/activity 對照仰賴 legacy_id_map system=cms)。
對映規則見 migration/README.md。
"""

# ruff: noqa: E402 - sys.path 調整必須先於 app 匯入(同 cms_import.py)
import asyncio
import os
import sys
from datetime import UTC, date, datetime
from pathlib import Path
from zoneinfo import ZoneInfo

MIGRATION_DIR = Path(__file__).resolve().parent
BACKEND_DIR = MIGRATION_DIR.parent / "backend"
sys.path.insert(0, str(BACKEND_DIR))
sys.path.insert(0, str(MIGRATION_DIR))

import pymysql
import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import async_session_factory
from app.models import Equipment, EquipmentLoan, LegacyIdMap, User, Venue, VenueBooking
from app.models.enums import (
    BookingStatus,
    LegacySystem,
    LoanStatus,
    UserRole,
    VenueCategory,
)
from cms_import import IdMap

TAIPEI = ZoneInfo("Asia/Taipei")
PERIOD_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "A", "B", "C", "D"]

# 舊 Classroom.id → 新場地名稱(seed 19 處);一舍 B2 一律拆成 樓梯+白板 兩筆
VENUE_MAP: dict[int, list[str]] = {
    1: ["S301"],
    2: ["S302/S303"],
    3: ["S304 音樂教室"],
    4: ["S311"],
    5: ["S312/S313"],
    6: ["S314"],
    7: ["戶外精誠廣場 1"],
    8: ["戶外精誠廣場 2"],
    9: ["戶外精誠廣場 3"],
    10: ["戶外精誠廣場 4"],
    11: ["戶外精誠廣場 5"],
    12: ["練團室"],
    13: ["3F 戶外廣場"],
    17: ["S204 共享食堂"],
    18: ["S209"],
    19: ["S207"],
    20: ["T4 舞蹈區"],
    22: ["一宿 B2 樓梯", "一宿 B2 白板"],
}
# 新版已無的舊場地:建 is_active=false 承接歷史申請(名稱沿用舊系統)
LEGACY_VENUES: dict[int, tuple[str, VenueCategory]] = {
    15: ("305", VenueCategory.CLASSROOM),
    14: ("2F廣場-戶外", VenueCategory.OUTDOOR),
    16: ("精誠廣場6", VenueCategory.OUTDOOR),
    21: ("學生活動中心1F走廊（摩斯漢堡對面）", VenueCategory.OUTDOOR),
}

# 舊 Device 名稱正規化,對到現行 17 項主檔名稱
DEVICE_RENAME = {
    "10M  延長線": "10M 延長線",
    "15M 延長線總數目": "15M 延長線",
}

BOOKING_STATUS_MAP = {
    0: BookingStatus.PENDING,
    1: BookingStatus.APPROVED,
    4: BookingStatus.REJECTED,
    2: BookingStatus.CANCELLED,
}
LOAN_STATUS_MAP = {
    0: LoanStatus.PENDING,
    1: LoanStatus.APPROVED,
    4: LoanStatus.REJECTED,
    2: LoanStatus.CANCELLED,
}


def epoch_dt(ts: object) -> datetime | None:
    return datetime.fromtimestamp(int(ts), tz=UTC) if ts else None


def valid_date(v: object) -> date | None:
    """pymysql 對 0000-00-00 會回原始字串:僅接受真正的 date。"""
    return v if isinstance(v, date) else None


def periods_of(row: dict) -> list[str]:
    return [k for k in PERIOD_KEYS if row.get(f"time{k}")]


async def build_club_lookup(db: AsyncSession) -> dict[str, int]:
    """CMS Username(=clubclass club_id)→ 新 club id。"""
    rows = await db.execute(
        sa.select(User.username, User.club_id).where(
            User.role == UserRole.CLUB, User.club_id.isnot(None)
        )
    )
    return dict(rows.all())


async def build_activity_lookup(db: AsyncSession) -> dict[str, int]:
    rows = await db.execute(
        sa.select(LegacyIdMap.legacy_id, LegacyIdMap.new_id).where(
            LegacyIdMap.legacy_system == LegacySystem.CMS,
            LegacyIdMap.legacy_table == "Club_activity",
        )
    )
    return {legacy: int(new) for legacy, new in rows.all()}


def resolve_club(
    club_lookup: dict[str, int], raw: str | None
) -> tuple[bool, int | None]:
    """回 (可遷, club_id);行政借用=(True, None)、無法識別=(False, None)。"""
    if not raw:
        return False, None
    if raw in club_lookup:
        return True, club_lookup[raw]
    if raw == "admin" or raw.startswith("8"):
        return True, None  # 行政借用(含已移除的偽社團帳號):club NULL
    return False, None


async def ensure_masters(
    legacy, db: AsyncSession, ids: IdMap
) -> tuple[dict[int, list[int]], dict[int, int]]:
    """場地/器材主檔對照;新版已無者建 inactive 列。回 (classroom→venue ids, device→equipment id)。"""
    venues = {v.name: v for v in (await db.scalars(sa.select(Venue))).all()}

    venue_ids: dict[int, list[int]] = {}
    for cid, names in VENUE_MAP.items():
        missing = [n for n in names if n not in venues]
        if missing:
            raise RuntimeError(f"seed 場地缺 {missing},先跑 reset_db 基礎 seed")
        venue_ids[cid] = [venues[n].id for n in names]
    for cid, (name, category) in LEGACY_VENUES.items():
        if name not in venues:
            venue = Venue(
                name=name, category=category, allow_fixed=False, allow_temp=False,
                sort=900 + cid, is_active=False,
            )
            db.add(venue)
            await db.flush()
            venues[name] = venue
        venue_ids[cid] = [venues[name].id]

    with legacy.cursor() as cur:
        cur.execute(
            "SELECT id, `name_zh-TW` AS name, total_count, max_lease_count,"
            " disabled, sort FROM Device ORDER BY sort"
        )
        devices = cur.fetchall()
    equipment = {e.name: e for e in (await db.scalars(sa.select(Equipment))).all()}
    device_ids: dict[int, int] = {}
    for d in devices:
        name = DEVICE_RENAME.get(d["name"], d["name"]).strip()
        row = equipment.get(name)
        if row is None:
            row = Equipment(
                name=name,
                total_qty=d["total_count"] or 0,
                max_lease_count=d["max_lease_count"] or None,
                needs_serial=False,  # 依序點交項目由行政後台再標(舊系統無此概念)
                sort=d["sort"] or 0,
                is_active=not d["disabled"],
            )
            db.add(row)
            await db.flush()
            equipment[name] = row
        elif row.max_lease_count is None and d["max_lease_count"]:
            row.max_lease_count = d["max_lease_count"]  # 既有主檔補單次上限
        device_ids[d["id"]] = row.id
        if ids.get("Device", d["id"]) is None:
            ids.record(db, "Device", d["id"], "equipment", row.id)
    print(f"masters: 場地對照 {len(venue_ids)} 處、器材 {len(device_ids)} 項")
    return venue_ids, device_ids


async def import_applies(
    legacy, db: AsyncSession, ids: IdMap,
    venue_ids: dict[int, list[int]], club_lookup: dict[str, int], act_lookup: dict[str, int],
) -> None:
    with legacy.cursor() as cur:
        cur.execute("SELECT * FROM Apply ORDER BY id")
        rows = cur.fetchall()
    created = skipped = 0
    for r in rows:
        status = BOOKING_STATUS_MAP.get(r["status"])
        targets = venue_ids.get(r["classroom_id"])
        ok, club_id = resolve_club(club_lookup, r["club_id"])
        day = valid_date(r["date"])
        periods = periods_of(r)
        if status is None or targets is None or day is None or not ok or not periods:
            skipped += 1  # 壞日期/未知狀態/未知場地/無法識別的申請單位/無節次
            continue
        activity_id = act_lookup.get(r["activity_id"])
        purpose = (r["purpose"] or "").strip() or (r["activity"] or "").strip() or "(未填)"
        created_at = epoch_dt(r["created_at"])
        for seq, venue_id in enumerate(targets):
            key = f"Apply:{seq}" if seq else "Apply"  # 一舍 B2 拆兩筆:第二筆掛 :1
            if ids.get(key, r["id"]) is not None:
                continue
            booking = VenueBooking(
                club_id=club_id,
                venue_id=venue_id,
                activity_id=activity_id,
                date=day,
                periods=periods,
                purpose=purpose,
                phone=(r["phone"] or "").strip() or None,
                status=status,
                **({"created_at": created_at} if created_at else {}),
            )
            db.add(booking)
            await db.flush()
            ids.record(db, key, r["id"], "venue_bookings", booking.id)
            created += 1
        if created and created % 2000 == 0:
            print(f"  applies … {created}")
    print(f"applies: 新增 {created} 筆場地借用、跳過 {skipped} 單(髒資料/無法識別)")


async def import_device_loans(
    legacy, db: AsyncSession, ids: IdMap,
    device_ids: dict[int, int], club_lookup: dict[str, int], act_lookup: dict[str, int],
) -> None:
    with legacy.cursor() as cur:
        cur.execute("SELECT * FROM DeviceApply ORDER BY id")
        headers = {r["id"]: r for r in cur.fetchall()}
        cur.execute("SELECT * FROM DeviceLog ORDER BY id")
        logs = cur.fetchall()
    today = datetime.now(TAIPEI).date()
    created = skipped = 0
    for log in logs:
        if ids.get("DeviceLog", log["id"]) is not None:
            continue
        head = headers.get(log["device_apply_id"])
        equipment_id = device_ids.get(log["device_id"])
        if head is None or equipment_id is None:  # 孤兒明細/未知器材
            skipped += 1
            continue
        status = LOAN_STATUS_MAP.get(head["status"])
        ok, club_id = resolve_club(club_lookup, head["club_id"])
        start = valid_date(head["date"])
        end = valid_date(head["end_date"]) or start
        if status is None or start is None or not ok:
            skipped += 1
            continue
        if end < start:
            end = start
        # 舊系統無點交:已核准且區間已過 → 視為已歸還
        if status == LoanStatus.APPROVED and end < today:
            status = LoanStatus.RETURNED
        created_at = epoch_dt(head["created_at"])
        loan = EquipmentLoan(
            club_id=club_id,
            equipment_id=equipment_id,
            activity_id=act_lookup.get(head["activity_id"]),
            qty=log["lease_count"] or 1,
            start_date=start,
            end_date=end,
            purpose=(head["purpose"] or "").strip()
            or (head["activity"] or "").strip()
            or "(未填)",
            phone=(head["phone"] or "").strip() or None,
            status=status,
            **({"created_at": created_at} if created_at else {}),
        )
        db.add(loan)
        await db.flush()
        ids.record(db, "DeviceLog", log["id"], "equipment_loans", loan.id)
        created += 1
    print(f"device loans: 新增 {created} 筆器材借用、跳過 {skipped}(孤兒/髒資料/無法識別)")


async def main() -> None:
    legacy = pymysql.connect(
        host=os.environ.get("CC_MYSQL_HOST", "127.0.0.1"),
        port=int(os.environ.get("CC_MYSQL_PORT", "3307")),
        user=os.environ.get("CC_MYSQL_USER", "root"),
        password=os.environ.get("CC_MYSQL_PASSWORD", "root"),
        database=os.environ.get("CC_MYSQL_DB", "cc"),
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,
    )
    try:
        async with async_session_factory() as db:
            ids = IdMap(LegacySystem.CLUBCLASS)
            await ids.load(db)
            club_lookup = await build_club_lookup(db)
            act_lookup = await build_activity_lookup(db)
            venue_ids, device_ids = await ensure_masters(legacy, db, ids)
            await import_applies(legacy, db, ids, venue_ids, club_lookup, act_lookup)
            await import_device_loans(legacy, db, ids, device_ids, club_lookup, act_lookup)
            await db.commit()
    finally:
        legacy.close()
    print("完成。")


if __name__ == "__main__":
    asyncio.run(main())
