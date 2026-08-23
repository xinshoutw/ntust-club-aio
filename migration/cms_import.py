"""舊社團管理系統(cms)→ club-aio 資料遷移(idempotent)。

用法(於 backend/ 下,先 reset_db 再執行;詳見 migration/README.md):
    uv run python ../migration/cms_import.py

idempotent 機制:每寫入一列即記 legacy_id_map(cms, 舊表, 舊id → 新表, 新id),
重跑時已入 map 的列直接跳過;可反覆演練,失敗後重跑會從缺的部分補齊。
"""

# ruff: noqa: E402 - sys.path 調整必須先於 app 匯入(同 scripts/)
import asyncio
import csv
import os
import re
import sys
from datetime import date, datetime, time
from pathlib import Path
from zoneinfo import ZoneInfo

MIGRATION_DIR = Path(__file__).resolve().parent
BACKEND_DIR = MIGRATION_DIR.parent / "backend"
sys.path.insert(0, str(BACKEND_DIR))

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from app.core.config import settings
from app.core.db import async_session_factory
from app.core.security import generate_password, hash_password
from app.core.semesters import semester_bounds
from app.models import (
    Activity,
    ActivityBudgetItem,
    ActivityReport,
    Announcement,
    ApprovalRecord,
    Club,
    ClubMember,
    LegacyIdMap,
    User,
)
from app.models.enums import (
    ActivityStatus,
    ActivityType,
    AnnouncementTarget,
    ApprovalDecision,
    ApprovalSubject,
    ClubAttribute,
    ClubKind,
    LegacySystem,
    MemberKind,
    UserRole,
)
from app.schemas.activities import ActivityIn
from app.schemas.admin import ApproveActivityIn
from app.services.activity_service import APPLY_STAGES


def _max_len(model, field: str) -> int:
    """從 Pydantic schema 讀長度上限 —— 不要在遷移腳本裡再寫死第二份數字。"""
    for meta in model.model_fields[field].metadata:
        limit = getattr(meta, "max_length", None)
        if limit is not None:
            return limit
    raise RuntimeError(f"{model.__name__}.{field} 讀不到 max_length,schema 改過了")


# 舊 Club_activity.Review = 申請表的「活動描述」(templates/viewer/activity_activity_detail.html
# 標籤即為此),不是結案成果。對應新系統的 Activity.content
CONTENT_MAX = _max_len(ActivityIn, "content")


def _actual(n: int | None) -> int:
    """結案回報的實際人數。0 是有效值,只有 NULL 才是沒填。"""
    return 0 if n is None else n

TAIPEI = ZoneInfo("Asia/Taipei")

# 遷移範圍(decisions.md MIG-08):只有活動受這個區間限制;社員名單與公告全遷(MIG-11)。
# 是「頭尾兩個學期」不是「要遷的學期清單」—— 中間的學期本來就含在區間裡,
# 想加學期是把尾端往後挪,不是往裡面塞。換學年只改這兩個標籤。
SCOPE_FIRST_SEMESTER = "114-1"
SCOPE_LAST_SEMESTER = "115-1"


def _scope_bounds() -> tuple[datetime, datetime]:
    """遷移範圍的 timestamptz 半開區間 [start, end);日界推導只有 semesters.py 一份。"""
    return semester_bounds(SCOPE_FIRST_SEMESTER)[0], semester_bounds(SCOPE_LAST_SEMESTER)[1]

# ---------------------------------------------------------------------------
# 對映規則
# ---------------------------------------------------------------------------

# 不遷移的舊社團(行政單位/測試帳號)
# 學務處就輔組:帳號「800」與 staff 侍筱鳳同名,此偽社團不遷
SKIP_CLUBS = {"國際事務處", "testclub", "學務處就輔組"}

# 名稱結尾推導不到時的手動指定;未列出者預設 社團
KIND_OVERRIDES = {
    "全校不分系": ClubKind.ASSOCIATION,
    "國際親善大使團": ClubKind.CLUB,
    "山斧羅浮群": ClubKind.CLUB,
    "搖滾實驗室": ClubKind.CLUB,
    "新世紀合唱團": ClubKind.CLUB,
    "根與芽": ClubKind.CLUB,
    "社會服務團": ClubKind.CLUB,
}

# 舊 activity.status → 新狀態:
# 0 審核中、1 退回申請、4 等待回報中(已核准)、5 核銷中(結案送審)、
# 11 退回核銷(回到可重新結案)、6 已完成
STATUS_MAP = {
    0: ActivityStatus.PENDING_ADVISOR,
    1: ActivityStatus.REJECTED,
    4: ActivityStatus.APPROVED,
    5: ActivityStatus.CLOSING_PENDING_ADVISOR,
    11: ActivityStatus.APPROVED,
    6: ActivityStatus.CLOSED,
}

# 已簽關數 → 下一關(與 APPLY_STAGES 的 advisor/chief/dean 同一組順序)
PENDING_BY_SIGNED = (
    ActivityStatus.PENDING_ADVISOR,
    ActivityStatus.PENDING_CHIEF,
    ActivityStatus.PENDING_DEAN,
)

TYPE_MAP = {
    "course": ActivityType.COURSE_MEETING,
    "conference": ActivityType.COURSE_MEETING,
    "extra": ActivityType.EVENT,
}

LEADER_TITLES = {"社長", "會長"}

# 舊系統自動附在審核意見後面的結報提醒;新系統由 pdf._APPLY_NOTE 自己產一份,
# 原文照搬會在申請表的「意見回饋」印兩次
# 有 9 筆的提醒沒有 ※ 開頭,直接從標題起頭 —— 只認 ※ 會把整段樣板留成審核意見
_OPINION_BOILERPLATE = re.compile(r"(?:※|活動結報提醒).*", re.S)
# 舊 status 1=退回申請:意見殘留是退件理由,不是經費認定。11(退回核銷)不算 ——
# 舊系統的 withdraw 分支只改 status、完全沒碰 Opinions(legacy views.py:2396-2407),
# 殘留仍是申請期的經費認定
REJECTED_LEGACY_STATUS = frozenset({1})
FUND_SOURCE_MAX = next(
    m.max_length for m in ApproveActivityIn.model_fields["fund_source"].metadata
    if hasattr(m, "max_length")
)


def opinion_residual(raw: str | None) -> str:
    """去掉自動附的結報提醒,留承辦人真正寫的那句(沒寫就是空字串)。"""
    return _OPINION_BOILERPLATE.sub("", raw or "").strip()
VICE_TITLES = {"副社長", "副會長"}


# 校內指導老師只有「分機」一格(校外才有完整電話),舊系統那格存的是完整號碼:
# 「(02)2737-6135  2737-6277」這種 23 字會超過 advisor_ext 的 20 字上限,讓該社連
# 改社團簡介都被 422 擋下,而且畫面會把整串號碼顯示成「分機 …」
_EXT_RE = re.compile(r"(?:轉接|轉|分機|#|ext\.?)\s*(\d{2,10})", re.I)
_BARE_EXT_RE = re.compile(r"^\d{3,5}$")


# 舊系統那格的標籤是「職位」,新系統校內那格是「系所」。純職稱寫進去畫面會顯示
# 「系所:教授」;校內沒有職稱欄位可以收留它,只能不遷
_TITLE_ONLY = frozenset(
    {
        "教授", "副教授", "助理教授", "專技副教授", "講師", "兼任講師", "兼任教師",
        "老師", "指導老師", "社團指導老師", "校內指導", "校外指導老師", "校外聘請老師",
        "通識老師", "韓文老師", "僑輔老師", "教官", "中校教官", "教練", "助理教練",
        "組長", "主任", "護理師", "諮商心理師", "行政組員", "學校教授",
    }
)


def advisor_dept(position: str | None) -> str | None:
    """只有看得出單位的才寫進「系所」;純職稱不遷(校內沒有職稱欄位)。"""
    raw = (position or "").strip()
    return None if not raw or raw in _TITLE_ONLY else raw


def advisor_ext(phone: str | None) -> str | None:
    """從完整電話抽分機碼;抽不出來就留空 —— 校內沒有欄位可放整串號碼。"""
    raw = (phone or "").strip()
    m = _EXT_RE.search(raw)
    if m:
        return m.group(1)
    return raw if _BARE_EXT_RE.match(raw) else None


def derive_club_kind(name: str) -> ClubKind:
    if name in KIND_OVERRIDES:
        return KIND_OVERRIDES[name]
    if name.endswith("會"):
        return ClubKind.ASSOCIATION
    return ClubKind.CLUB


def to_semester(raw: str | None) -> str | None:
    """舊「104 1」→ 新「104-1」;不合格式回 None(該列跳過並記數)。"""
    if not raw:
        return None
    parts = raw.split()
    if len(parts) == 2 and parts[0].isdigit() and parts[1] in ("1", "2"):
        return f"{parts[0]}-{parts[1]}"
    return None


def _aware(dt: datetime) -> datetime:
    # 防護:naive 值(timestamp without time zone 的 dump)一律視為台北時間,
    # 避免 astimezone 靜默用主機時區解讀造成日期位移
    return dt.replace(tzinfo=TAIPEI) if dt.tzinfo is None else dt


def local_date(dt: datetime | None) -> date | None:
    return _aware(dt).astimezone(TAIPEI).date() if dt else None


def local_time(dt: datetime | None) -> time | None:
    return _aware(dt).astimezone(TAIPEI).time().replace(second=0, microsecond=0) if dt else None


def local_dt(dt: datetime | None) -> datetime | None:
    return _aware(dt) if dt else None


# ---------------------------------------------------------------------------
# legacy_id_map 快取
# ---------------------------------------------------------------------------
class IdMap:
    """舊表+舊id → 新id;啟動時整批載入,寫入時同步記錄(隨同交易 commit)。"""

    def __init__(self, system: LegacySystem = LegacySystem.CMS) -> None:
        self.system = system
        self._map: dict[tuple[str, str], str] = {}

    async def load(self, db: AsyncSession) -> None:
        rows = await db.execute(
            sa.select(
                LegacyIdMap.legacy_table, LegacyIdMap.legacy_id, LegacyIdMap.new_id
            ).where(LegacyIdMap.legacy_system == self.system)
        )
        for table, legacy_id, new_id in rows:
            self._map[(table, legacy_id)] = new_id

    def get(self, table: str, legacy_id: object) -> str | None:
        return self._map.get((table, str(legacy_id)))

    def record(
        self, db: AsyncSession, table: str, legacy_id: object, new_table: str, new_id: object
    ) -> None:
        self._map[(table, str(legacy_id))] = str(new_id)
        db.add(
            LegacyIdMap(
                legacy_system=self.system,
                legacy_table=table,
                legacy_id=str(legacy_id),
                new_table=new_table,
                new_id=str(new_id),
                migrated_at=datetime.now(TAIPEI),
            )
        )


# ---------------------------------------------------------------------------
# 匯入步驟
# ---------------------------------------------------------------------------
async def import_clubs(
    legacy, db: AsyncSession, ids: IdMap, passwords: list[tuple[str, str, str]]
) -> dict[int, tuple[int, int]]:
    """社團 + 一社一帳號。回傳 {舊 club id: (新 club id, 新 user id)}。"""
    props = dict(
        (await legacy.execute(sa.text('SELECT id, "Name" FROM "Club_clubproperty"'))).all()
    )
    contents = {
        r.FK_Club_id: r
        for r in (
            await legacy.execute(
                sa.text(
                    'SELECT "FK_Club_id" AS "FK_Club_id", "Introduction", "Url"'
                    ' FROM "Club_clubcontent"'
                )
            )
        ).all()
    }
    rows = (
        await legacy.execute(
            sa.text(
                'SELECT id, "Name", "Username", "EN_Name", "FK_ClubProperty_id"'
                ' FROM "Club_club" ORDER BY id'
            )
        )
    ).all()

    valid_attrs = {a.value for a in ClubAttribute}
    result: dict[int, tuple[int, int]] = {}
    skipped = 0
    unmapped_attr: list[str] = []
    for row in rows:
        if row.Name in SKIP_CLUBS:
            skipped += 1
            continue
        prop = props.get(row.FK_ClubProperty_id)
        defunct = prop == "停社"
        # 停社(原性質不可考)與未映射性質皆為 NULL;後者記數回報而非中止
        if not defunct and prop not in valid_attrs:
            unmapped_attr.append(f"{row.Name}({prop})")
        attribute = ClubAttribute(prop) if not defunct and prop in valid_attrs else None
        mapped_club = ids.get("Club_club", row.id)
        if mapped_club is None:
            content = contents.get(row.id)
            club = Club(
                name=row.Name,
                kind=derive_club_kind(row.Name),
                en_name=(row.EN_Name or None),
                attribute=attribute,
                intro=(content.Introduction or "") if content else "",
                website_url=(content.Url or None) if content else None,
                is_active=not defunct,
            )
            db.add(club)
            await db.flush()
            ids.record(db, "Club_club", row.id, "clubs", club.id)
            club_id = club.id
        else:
            club_id = int(mapped_club)

        mapped_user = ids.get("Club_club:user", row.id)
        if mapped_user is None:
            password = generate_password()
            user = User(
                role=UserRole.CLUB,
                username=row.Username,
                password_hash=hash_password(password),
                name=row.Name,
                club_id=club_id,
                must_change_password=True,
                is_active=not defunct,
            )
            db.add(user)
            await db.flush()
            ids.record(db, "Club_club:user", row.id, "users", user.id)
            if not defunct:
                passwords.append(("club", row.Username, password))
            user_id = user.id
        else:
            user_id = int(mapped_user)
        result[row.id] = (club_id, user_id)

    print(f"clubs: {len(result)} 社(含既有)、跳過 {skipped}(行政單位/測試)")
    if unmapped_attr:
        print(f"  性質未映射 → NULL:{unmapped_attr}")
    return result


async def import_staff(
    legacy, db: AsyncSession, ids: IdMap, passwords: list[tuple[str, str, str]]
) -> dict[int, int]:
    """舊行政帳號:admin→admin(權限鍵之後由承辦配)、observer→viewer。"""
    rows = (
        await legacy.execute(
            sa.text(
                'SELECT id, "Name", "Email", "Username", position, "Status"'
                ' FROM "Club_staff" ORDER BY id'
            )
        )
    ).all()
    existing = set((await db.scalars(sa.select(User.username))).all())
    result: dict[int, int] = {}
    skipped: list[str] = []
    for row in rows:
        mapped = ids.get("Club_staff", row.id)
        if mapped is not None:
            result[row.id] = int(mapped)
            continue
        if row.Username in existing:
            skipped.append(row.Username)
            continue
        is_viewer = row.position == "observer"
        password = generate_password()
        user = User(
            role=UserRole.VIEWER if is_viewer else UserRole.ADMIN,
            username=row.Username,
            password_hash=hash_password(password),
            name=row.Name,
            email=row.Email or None,
            can_view_eval=is_viewer,  # 舊 observer=評鑑委員
            must_change_password=True,
        )
        db.add(user)
        await db.flush()
        ids.record(db, "Club_staff", row.id, "users", user.id)
        passwords.append((user.role.value, row.Username, password))
        existing.add(row.Username)
        result[row.id] = user.id
    print(f"staff: {len(result)} 帳號;帳號名衝突跳過 {skipped or '無'}")
    return result


async def import_teachers(legacy, db: AsyncSession, clubs: dict[int, tuple[int, int]]) -> None:
    """指導老師:校內(school)/校外(extra)各取最新一位寫入 clubs 欄位。

    非 id map 型:直接覆寫社團欄位(重跑結果相同,仍 idempotent)。
    """
    rows = (
        await legacy.execute(
            sa.text(
                'SELECT id, "Name", "Position", "Email", "Phone", "Identity",'
                ' "FK_Club_id" FROM "Club_teacher" ORDER BY id'
            )
        )
    ).all()
    latest: dict[tuple[int, str], object] = {}
    for row in rows:
        if row.FK_Club_id in clubs:
            latest[(row.FK_Club_id, row.Identity)] = row  # id 遞增,後者即最新
    count = 0
    for (legacy_club_id, identity), row in latest.items():
        club_id = clubs[legacy_club_id][0]
        club = await db.get(Club, club_id)
        if club is None:
            continue
        if identity == "school":
            club.advisor_name = row.Name
            club.advisor_dept = advisor_dept(row.Position)
            club.advisor_email = row.Email or None
            club.advisor_ext = advisor_ext(row.Phone)
        else:
            club.advisor_out_name = row.Name
            club.advisor_out_dept = row.Position or None
            club.advisor_out_email = row.Email or None
            club.advisor_out_phone = row.Phone or None
        count += 1
    print(f"teachers: 寫入 {count} 位(校內/校外各取最新)")


def staff_line(item: str | None, owner: str | None) -> str:
    """工作分配一行。

    前端約定的格式是每列「項目:負責人」一行(api/activities.ts `staffTextToWorks`);
    舊碼寫的是 `項目>負責人` + `;`,整份工作分配會顯示成一行亂碼。
    兩欄都空的列不產生行。
    """
    item, owner = (item or "").strip(), (owner or "").strip()
    return f"{item}:{owner}" if item or owner else ""


def member_kind(identity: str | None, title: str | None) -> tuple[MemberKind, str | None]:
    """舊 Identity+Title → 新標準身份;職稱各身份皆保留(幹部缺職稱補「幹部」)。"""
    t = (title or "").strip()
    if t in LEADER_TITLES:
        return MemberKind.PRESIDENT, None
    if t in VICE_TITLES:
        return MemberKind.VICE_PRESIDENT, None
    if identity == "幹部":
        return MemberKind.OFFICER, (t or "幹部")
    return MemberKind.MEMBER, (t if t and t != "社員" else None)


async def import_members(legacy, db: AsyncSession, ids: IdMap, clubs) -> None:
    rows = (
        await legacy.execute(
            sa.text(
                'SELECT id, "Name", "StudentID", "Phone", "Title", "Date", "Semester",'
                ' "FK_Club_id", "Identity" FROM "Club_student" ORDER BY id'
            )
        )
    ).all()
    # 同(社團,學期,學號)取 id 最大者(最新);UNIQUE(club_id, student_id, semester)
    dedup: dict[tuple[int, str, str], object] = {}
    bad_semester = foreign = 0
    for row in rows:
        if row.FK_Club_id not in clubs:
            foreign += 1  # 不遷移社團的成員
            continue
        semester = to_semester(row.Semester)
        if semester is None or not row.StudentID:
            bad_semester += 1
            continue
        dedup[(row.FK_Club_id, semester, row.StudentID.strip())] = row

    created = 0
    for (legacy_club_id, semester, student_id), row in dedup.items():
        if ids.get("Club_student", row.id) is not None:
            continue
        kind, title = member_kind(row.Identity, row.Title)
        joined = row.Date  # 入社日期 → created_at(列表的「入社時間」)與 updated_at
        stamp = datetime.combine(joined, time(12, 0), tzinfo=TAIPEI) if joined else None
        member = ClubMember(
            club_id=clubs[legacy_club_id][0],
            name=(row.Name or "").strip() or "(未填)",
            student_id=student_id,
            kind=kind,
            title=title,
            phone=(row.Phone or "").strip() or None,
            semester=semester,
            **({"created_at": stamp, "updated_at": stamp} if stamp else {}),
        )
        db.add(member)
        created += 1
        if created % 1000 == 0:
            await db.flush()
    await db.flush()
    # 大表逐列 flush 拿 id 太慢:flush 後補 map(同交易,一致性不變)
    if created:
        inserted = await db.execute(
            sa.select(ClubMember.id, ClubMember.club_id, ClubMember.student_id, ClubMember.semester)
        )
        by_key = {(c, s, st): i for i, c, st, s in inserted}
        for (legacy_club_id, semester, student_id), row in dedup.items():
            if ids.get("Club_student", row.id) is None:
                new_id = by_key.get((clubs[legacy_club_id][0], semester, student_id))
                if new_id is not None:
                    ids.record(db, "Club_student", row.id, "club_members", new_id)
    dropped = len(rows) - len(dedup) - bad_semester - foreign
    print(
        f"members: 新增 {created}(重複學期學號覆蓋 {dropped}、"
        f"學期不合格式 {bad_semester}、不遷社團 {foreign})"
    )


async def import_activities(legacy, db: AsyncSession, ids: IdMap, clubs) -> None:
    scope_start, scope_end = _scope_bounds()
    acts = (
        await legacy.execute(
            sa.text(
                'SELECT id, "Name", "Type", "ExpectedMemberNumber", "ActuallyMemberNumber",'
                ' "ExpectedNotMemberNumber", "ActuallyNotMemberNumber", "StartTime", "EndTime",'
                ' "ActuallyStartTime", "ActuallyEndTime", "Location", "Review", "SetupTime",'
                ' "FinishTime", status, "FK_Club_id" FROM "Club_activity"'
                ' WHERE "StartTime" >= :start AND "StartTime" < :end ORDER BY id'
            ),
            {"start": scope_start, "end": scope_end},
        )
    ).all()
    total = await legacy.scalar(sa.text('SELECT count(*) FROM "Club_activity"'))
    funds_rows = (
        await legacy.execute(
            sa.text(
                'SELECT "FK_Activity_id" AS aid, "Name", "Content", "MatchingFund",'
                ' "Subsidy", "ApprovedGrant", "TotalExpense" FROM "Club_activityfund" ORDER BY id'
            )
        )
    ).all()
    staff_rows = (
        await legacy.execute(
            sa.text(
                'SELECT "FK_Activity_id" AS aid, "Item", "Supervisor"'
                ' FROM "Club_activitystaff" ORDER BY id'
            )
        )
    ).all()
    meta_rows = (
        await legacy.execute(
            sa.text('SELECT "FK_Activity_id" AS aid, key, value FROM "Club_activitymeta"')
        )
    ).all()
    # 舊 status 只說「還在審」,說不出停在哪一關 —— 關卡看已簽的列數
    signed = {
        r.aid: r.n
        for r in await legacy.execute(
            sa.text(
                'SELECT "FK_Activity_id" AS aid, count(*) AS n'
                ' FROM "Club_auditactivityrecord" GROUP BY "FK_Activity_id"'
            )
        )
    }

    funds: dict[int, list] = {}
    for r in funds_rows:
        funds.setdefault(r.aid, []).append(r)
    staffs: dict[int, list[str]] = {}
    for r in staff_rows:
        line = staff_line(r.Item, r.Supervisor)
        if line:
            staffs.setdefault(r.aid, []).append(line)
    metas: dict[int, dict[str, bool]] = {}
    for r in meta_rows:
        metas.setdefault(r.aid, {})[r.key] = r.value == "True"

    created = skipped = 0
    truncated: list[int] = []
    no_duration: list[int] = []
    for a in acts:
        if a.FK_Club_id not in clubs or ids.get("Club_activity", a.id) is not None:
            skipped += 1
            continue
        club_id, user_id = clubs[a.FK_Club_id]
        status = STATUS_MAP.get(a.status)
        if status is None:  # 未知狀態(不在舊 choices):跳過並記數
            skipped += 1
            continue
        if status is ActivityStatus.PENDING_ADVISOR:
            # 承辦人簽過了才會停在下一關;只看 status 會叫他把同一件再簽一次
            status = PENDING_BY_SIGNED[min(signed.get(a.id, 0), len(PENDING_BY_SIGNED) - 1)]
        # Review 是申請表的「活動描述」;超過 schema 上限就截斷,否則社團一按儲存就 422
        content = (a.Review or "").strip()
        if len(content) > CONTENT_MAX:
            truncated.append(a.id)
            content = content[:CONTENT_MAX]
        start_d = local_date(a.StartTime) or local_date(a.SetupTime) or date(1970, 1, 1)
        end_d = local_date(a.EndTime) or start_d
        if end_d < start_d:
            end_d = start_d
        start_t, end_t = local_time(a.StartTime), local_time(a.EndTime)
        if end_d == start_d and start_t is not None and end_t is not None and end_t <= start_t:
            # 34 筆的結束時刻等於開始時刻 —— 舊表單沒擋,實際上是「沒記時長」。
            # 照搬會過不了 end_time > start_time 的檢核,退回件連暫存都存不了
            no_duration.append(a.id)
            end_t = None
        activity = Activity(
            club_id=club_id,
            name=(a.Name or "").strip() or "(未命名)",
            content=content,
            # 舊系統結案送出時把申請地點覆寫成實際地點(legacy views.py:1163),所以已結案
            # 的 956 件這裡拿到的其實是實際地點,申請時填的原值舊庫已不存在、無從還原
            location=(a.Location or "").strip() or "(未填)",
            type=TYPE_MAP.get(a.Type, ActivityType.COURSE_MEETING),
            date=start_d,
            end_date=end_d,
            start_time=start_t,
            end_time=end_t,
            # 舊制即為 社員/非社員 人數,語彙已統一
            participants_in=a.ExpectedMemberNumber or 0,
            participants_out=a.ExpectedNotMemberNumber or 0,
            # 送審必填項在遷移件也要有值,否則退回件連暫存都會被 422 擋住
            staff_text="\n".join(staffs.get(a.id, [])) or "(未填)",
            status=status,
            # 退回核銷 = 已在期限內送過結案,補件往返不該再被鎖(同 close_reject 的行為)
            close_unlocked=(a.status == 11),
            created_by=user_id,
            **({"created_at": local_dt(a.SetupTime)} if a.SetupTime else {}),
        )
        db.add(activity)
        await db.flush()
        ids.record(db, "Club_activity", a.id, "activities", activity.id)

        for f in funds.get(a.id, []):
            db.add(
                ActivityBudgetItem(
                    activity_id=activity.id,
                    category=(f.Name or "").strip() or "其他",
                    description=(f.Content or "").strip(),
                    self_fund=f.MatchingFund or 0,
                    requested_subsidy=f.Subsidy or 0,
                    approved_subsidy=f.ApprovedGrant,
                )
            )

        # 結案(核銷中/已完成/退回核銷):舊制僅有 實際人數/時間 + 繳交旗標,寬鬆匯入 —
        # 缺欄留空。11(退回核銷)舊系統只改 status、不清實際人數(legacy views.py:2396),
        # 不建 report 會讓社團打開結案表單是一張白紙,已送出的資料整份消失
        if a.status in (5, 6, 11):
            meta = metas.get(a.id, {})
            db.add(
                ActivityReport(
                    activity_id=activity.id,
                    # 舊結案表單把空白明確存成 0(legacy views.py:976-982),所以 0 是社團
                    # 真的回報的實際人數。用 `or` 串接會把它當沒填、拿申請期的預估頂替
                    member_count=_actual(a.ActuallyMemberNumber),
                    non_member_count=_actual(a.ActuallyNotMemberNumber),
                    actual_start=local_time(a.ActuallyStartTime)
                    or local_time(a.StartTime)
                    or time(0, 0),
                    actual_end=local_time(a.ActuallyEndTime)
                    or local_time(a.EndTime)
                    or time(0, 0),
                    actual_location=(a.Location or "").strip() or "(未填)",
                    # 舊制沒有成果三欄(Review 是申請期的活動描述,已寫進 Activity.content),
                    # 留空待 text_fields.py 的人工轉錄 CSV 補
                    highlights="",
                    goals="",
                    others="",
                    review_meeting=False,
                    expense=sum(f.TotalExpense or 0 for f in funds.get(a.id, [])),
                    submitted_at=local_dt(a.FinishTime)
                    or local_dt(a.EndTime)
                    or datetime.now(TAIPEI),
                    # 缺 meta = 沒有「已繳交」的證據。預設 True 是白送競賽行政分,
                    # 模型註解本來就寫「未確認之項目評鑑以 0 分計」
                    photos_confirmed=meta.get("photo", False),
                    report_confirmed=meta.get("performance_report", False),
                    reflections_confirmed=meta.get("experience_feedback", False),
                )
            )
        created += 1
        if created % 500 == 0:
            await db.flush()
            print(f"  activities … {created}/{len(acts)}")
    if no_duration:
        print(
            f"  結束時刻等於開始時刻已改為留空 {len(no_duration)} 筆(舊 id:"
            f"{'、'.join(map(str, no_duration[:20]))}{' …' if len(no_duration) > 20 else ''})"
        )
    if truncated:
        print(
            f"  活動內容超過 {CONTENT_MAX} 字已截斷 {len(truncated)} 筆(舊 id:"
            f"{'、'.join(map(str, truncated[:20]))}{' …' if len(truncated) > 20 else ''});"
            "全文仍在舊庫 Club_activity.Review"
        )
    print(
        f"activities: 新增 {created}、跳過 {skipped}(已遷/不遷社團/未知狀態)"
        f";範圍外未讀取 {(total or 0) - len(acts)}"
        f"({SCOPE_FIRST_SEMESTER}~{SCOPE_LAST_SEMESTER} 之外)"
    )


async def import_approvals(legacy, db: AsyncSession, ids: IdMap) -> None:
    """舊系統的簽核者 → approval_records:申請表要印 初核/複核/決行 三位的姓名。

    舊 `Club_auditactivityrecord` 只有「誰、什麼時候簽的」,**沒有決議欄** —— 退回不入
    這張表,所以每一列都是核准,同一活動的第 1/2/3 列即 承辦人/組長/學務長 三關
    (`AuditActivity.AllowCode` 就是這張表的列數)。關卡由列序決定,不是由狀態推導。

    `AuditActivity.Opinions` 先**去掉舊系統自動附的「※…結報提醒」**再處理:那段樣板
    佔了 1,387 / 1,518 筆的全部內容,而新系統的申請表由 `pdf._APPLY_NOTE` 自己產一份,
    原文照搬只會在「意見回饋」那格印兩次。剩下的殘留才是承辦人真正寫的那句:

    - 退回件(舊 status 1/11)的殘留是退件理由 → 只寫 `reason`
    - 其餘的殘留是經費認定(「本案由三校文化基金會補助經費支應一萬元。」)
      → 同時寫 `activities.fund_source`,申請表的「意見回饋」才印得出來
    - 殘留超過 `ApproveActivityIn.fund_source` 的上限(100 字)就只寫 `reason`:
      塞進去等於承辦一開審核視窗按儲存就 422,而且自己改不掉
    """
    scope_start, scope_end = _scope_bounds()
    rows = (
        await legacy.execute(
            sa.text(
                'SELECT r.id, r."Staff_id" AS staff_id, r."AuditTime" AS audit_time,'
                ' au."FK_Activity_id" AS aid, au."Opinions" AS opinions, a.status'
                ' FROM "Club_auditactivityrecord" r'
                ' JOIN "Club_auditactivity" au ON au.id = r."FK_AuditActivity_id"'
                ' JOIN "Club_activity" a ON a.id = au."FK_Activity_id"'
                ' WHERE a."StartTime" >= :start AND a."StartTime" < :end'
                ' ORDER BY au."FK_Activity_id", r.id'
            ),
            {"start": scope_start, "end": scope_end},
        )
    ).all()

    # 先算好每一列在該活動裡的關卡序:重跑時已遷入的列會被跳過,
    # 邊跑邊數會讓補跑的那幾列關卡整個位移
    stage_of: dict[int, int] = {}
    counter: dict[int, int] = {}
    for r in rows:
        stage_of[r.id] = counter.get(r.aid, 0)
        counter[r.aid] = stage_of[r.id] + 1

    created = no_activity = no_actor = over_stages = 0
    notes = sources = too_long = 0
    for r in rows:
        if ids.get("Club_auditactivityrecord", r.id) is not None:
            continue
        new_aid = ids.get("Club_activity", r.aid)
        if new_aid is None:
            no_activity += 1  # 不遷的社團或未知狀態
            continue
        actor = ids.get("Club_staff", r.staff_id)
        if actor is None:
            no_actor += 1  # 帳號名衝突而未遷入的 staff;actor_id 非空,補不出來
            continue
        nth = stage_of[r.id]
        if nth >= len(APPLY_STAGES):
            over_stages += 1  # 舊資料最多三關,超過的不知道該掛哪一格
            continue
        # Opinions 每一關都被覆寫(legacy views.py:2228/2266/2381),留下的是最後一位
        # 簽核者寫的。舊庫只有一格文字還原不出各關,掛最後一列比掛承辦人接近事實
        last = min(counter[r.aid], len(APPLY_STAGES)) - 1
        note = opinion_residual(r.opinions) if nth == last else ""
        if note and r.status not in REJECTED_LEGACY_STATUS:
            # 非退回件的殘留是經費認定,申請表「意見回饋」那格讀的就是 fund_source
            if len(note) <= FUND_SOURCE_MAX:
                await db.execute(
                    sa.update(Activity)
                    .where(Activity.id == int(new_aid))
                    .values(fund_source=note)
                )
                sources += 1
            else:
                too_long += 1
        record = ApprovalRecord(
            subject_type=ApprovalSubject.ACTIVITY,
            subject_id=int(new_aid),
            stage=APPLY_STAGES[nth],
            decision=ApprovalDecision.APPROVE,
            actor_id=int(actor),
            reason=note or None,
            **({"created_at": local_dt(r.audit_time)} if r.audit_time else {}),
        )
        db.add(record)
        await db.flush()
        ids.record(db, "Club_auditactivityrecord", r.id, "approval_records", record.id)
        created += 1
        notes += bool(note)
    # 一筆簽核都沒有的活動(全是沒人簽就退回的),意見掛不上任何一列 —— 明講,不要靜靜丟掉
    orphan_notes = sum(
        1
        for (raw,) in await legacy.execute(
            sa.text(
                'SELECT au."Opinions" FROM "Club_auditactivity" au'
                ' JOIN "Club_activity" a ON a.id = au."FK_Activity_id"'
                ' WHERE a."StartTime" >= :start AND a."StartTime" < :end'
                ' AND NOT EXISTS (SELECT 1 FROM "Club_auditactivityrecord" r'
                '                 WHERE r."FK_AuditActivity_id" = au.id)'
            ),
            {"start": scope_start, "end": scope_end},
        )
        if opinion_residual(raw)
    )
    print(
        f"approvals: 新增 {created} 筆簽核(去樣板後仍有審核意見 {notes} 筆,"
        f"其中 {sources} 筆寫入 fund_source、{too_long} 筆超過 {FUND_SOURCE_MAX} 字只留 reason)"
        f";活動未遷 {no_activity}、簽核者未遷 {no_actor}、超過三關 {over_stages}"
    )
    if orphan_notes:
        print(
            f"  另有 {orphan_notes} 筆退件理由掛不上簽核列(沒人簽就退回,舊表沒有 actor)"
            f",未遷入"
        )


async def import_news(legacy, db: AsyncSession, ids: IdMap) -> None:
    # 公告不套 SCOPE_*:`create_date` 是 Django auto_now_add(貼出來的時刻),
    # 不是公告的有效期間。舊庫 8 則全在 2017–2023,套學期軸會 100% 濾光,
    # 而其中「照片請直接上傳」「教育優先區活動須上傳系統」這幾則今天仍然有效。
    # 8 列也不是量的問題(活動是 14,239→1,495)—— 範圍是為了活動的量而定的。
    rows = (
        await legacy.execute(
            sa.text('SELECT id, title, url, create_date FROM "Club_news" ORDER BY id')
        )
    ).all()
    creator = await db.scalar(
        sa.select(User.id).where(User.is_super.is_(True)).order_by(User.id).limit(1)
    )
    if creator is None:
        print("news: 找不到 superadmin,跳過(先跑 reset_db seed)")
        return
    created = 0
    for row in rows:
        if ids.get("Club_news", row.id) is not None:
            continue
        ann = Announcement(
            title=row.title,
            content=f"[{row.title}]({row.url})" if row.url else row.title,
            target_type=AnnouncementTarget.ALL,
            created_by=creator,
            **({"created_at": local_dt(row.create_date)} if row.create_date else {}),
        )
        db.add(ann)
        await db.flush()
        ids.record(db, "Club_news", row.id, "announcements", ann.id)
        created += 1
    print(f"news: 新增 {created} 則公告")


# ---------------------------------------------------------------------------
# id-map 的舊表名 → 要清掉的新表(reset 用;順序即刪除順序,子表在前)
_RESET_ORDER = (
    ("Club_auditactivityrecord", ApprovalRecord),
    ("Club_news", Announcement),
    ("Club_activity", Activity),
    ("Club_student", ClubMember),
    ("Club_staff", User),
    ("Club_club:user", User),
    ("Club_club", Club),
)


async def reset(db: AsyncSession) -> None:
    """清掉本腳本匯入過的資料,讓換一份新 dump 之後可以從乾淨狀態重跑
    (decisions.md MIG-04)。

    只刪自己 id-map 記過的列 —— 新系統上線後自己產生的社團、活動與公告不受影響。
    先跑 `media_import.py --reset`(照片)與 `cc_import.py --reset`(借用單掛在活動
    與社團上),再跑這支。
    """
    # 收尾那一刀是「刪光 system=cms 的所有 id-map」,media_import 的照片對照也在裡面。
    # 先跑這支的話,4,000 列 files 與盤上 4.9 GB 就再也沒有腳本找得到 —— 擋下來。
    photos = await db.scalar(
        sa.select(sa.func.count())
        .select_from(LegacyIdMap)
        .where(
            LegacyIdMap.legacy_system == LegacySystem.CMS,
            LegacyIdMap.legacy_table == "Club_activityimages",
        )
    )
    if photos:
        sys.exit(
            f"拒絕執行:legacy_id_map 還有 {photos} 列照片對照。\n"
            "本腳本的 reset 會刪光 system=cms 的所有對照,照片就變成清不掉的孤兒。\n"
            "請先跑:uv run python ../migration/media_import.py --reset"
        )

    ids = IdMap()
    await ids.load(db)
    for table, model in _RESET_ORDER:
        target = [
            int(new_id)
            for (t, _lid), new_id in ids._map.items()  # noqa: SLF001 - 同一套腳本的內部結構
            if t == table
        ]
        if not target:
            continue
        await db.execute(sa.delete(model).where(model.id.in_(target)))
        print(f"  清除 {table}: {len(target)} 列")
    await db.execute(sa.delete(LegacyIdMap).where(LegacyIdMap.legacy_system == LegacySystem.CMS))
    await db.commit()
    print("已清除 CMS 匯入結果;指導老師欄位不還原(非 id-map 型,重跑會覆寫)")


async def main() -> None:
    legacy_db = os.environ.get("LEGACY_DB", "legacy_clubs")
    legacy_url = settings.sqlalchemy_url.set(database=legacy_db)
    legacy_engine = create_async_engine(legacy_url)

    passwords: list[tuple[str, str, str]] = []
    async with async_session_factory() as db, legacy_engine.connect() as legacy:
        if "--reset" in sys.argv:
            await reset(db)
            return  # 只清不匯:借用單掛在活動與社團上,清完立刻重匯會擋住下一支的刪除
        ids = IdMap()
        await ids.load(db)

        clubs = await import_clubs(legacy, db, ids, passwords)
        await import_staff(legacy, db, ids, passwords)
        await import_teachers(legacy, db, clubs)
        await import_members(legacy, db, ids, clubs)
        await import_activities(legacy, db, ids, clubs)
        await import_approvals(legacy, db, ids)
        await import_news(legacy, db, ids)
        await db.commit()

    await legacy_engine.dispose()

    if passwords:
        out_dir = MIGRATION_DIR / "out"
        out_dir.mkdir(exist_ok=True)
        out = out_dir / f"one_time_passwords_{date.today().isoformat()}.csv"
        with out.open("w", newline="") as fh:
            writer = csv.writer(fh)
            writer.writerow(["role", "username", "one_time_password"])
            writer.writerows(passwords)
        print(f"\n一次性密碼 {len(passwords)} 筆 → {out}(交承辦發放後銷毀;首登強制改密)")
    print("完成。")


if __name__ == "__main__":
    asyncio.run(main())
