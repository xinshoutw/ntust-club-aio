"""建立「含 mock 資料的資料庫」(開發/展示用;每次執行=整庫重灌,非 idempotent)。

流程:等同 reset_db(DROP SCHEMA → alembic head → 基礎 seed:五獎項+19 場地+superadmin)
後,再灌全模組 mock 資料。時空背景以 2026-07-16 為「今天」(114 學年度下學期),
所有資料 deterministic(含檔案 UUID,以 uuid5 生成)。

用法:
  uv run python scripts/seed_mock.py --yes [--admin-password 'Super@12345']

涵蓋:14 社團(各一帳號)、資工系學會為資料最豐富的示範社(成員兩學期名單、
全狀態活動、借用、線上申請、違規、報名、評鑑調整)、管理端各權限帳號、
公告四型、器材主檔、實體檔案(合法 PNG 照片/佐證與單頁 PDF 企劃書,
GET /files/{id} 可直接取用)。

結尾印出各表筆數摘要與全部帳號密碼表(僅供開發環境)。
"""

# ruff: noqa: E402 - sys.path 調整必須先於 app 匯入(同 reset_db.py)
import argparse
import asyncio
import hashlib
import io
import shutil
import struct
import sys
import uuid
import zlib
from datetime import date, datetime, time
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))  # 讓 scripts/ 可 import app

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.db import async_session_factory
from app.core.security import hash_password
from app.core.semesters import TAIPEI, semester_of, semester_range
from app.models import (
    Activity,
    ActivityBudgetItem,
    ActivityReflection,
    ActivityReport,
    Announcement,
    ApprovalRecord,
    Base,
    Club,
    ClubMember,
    Equipment,
    EquipmentLoan,
    EvalAdjustment,
    File,
    MaintenanceRequest,
    OfficerCertificate,
    PostalAccountChange,
    RoomBookingRequest,
    RoomBookingSlot,
    SessionAttendance,
    Signup,
    SignupDraft,
    SignupEntry,
    SignupItem,
    SignupItemSession,
    SystemSetting,
    User,
    Venue,
    VenueBooking,
    Violation,
)
from app.models.enums import (
    ActivityStatus,
    ActivityType,
    AdjustmentKind,
    AnnouncementTarget,
    ApplicationStatus,
    ApprovalDecision,
    ApprovalSubject,
    BookingStatus,
    CertPosition,
    ClubAttribute,
    LoanStatus,
    MaintenanceStatus,
    MemberKind,
    PostalReason,
    SignupKind,
    UserRole,
    ViolationStatus,
)
from scripts.reset_db import drop_all, upgrade_head
from scripts.seed import seed

# ---------------------------------------------------------------------------
# 常數:密碼(僅開發環境;結尾集中印出)
# ---------------------------------------------------------------------------
DEFAULT_SUPER_PASSWORD = "Super@12345"
CLUB_PASSWORD = "Club@12345"
ADMIN_PASSWORD = "Admin@12345"
STAFF_PASSWORD = "Staff@12345"
VIEWER_PASSWORD = "Viewer@12345"

# mock 資料的時空基準:今天=2026-07-16(114-2 學期;僅作設計標註,不做動態推導)
TODAY = date(2026, 7, 16)

# ---------------------------------------------------------------------------
# 社團主檔(比照 frontend/src/features/admin/clubsMock.ts;名稱皆以社/會結尾)
# (名稱, 性質, 帳號, 啟用)
# ---------------------------------------------------------------------------
CLUBS: list[tuple[str, ClubAttribute, str, bool]] = [
    ("學生會", ClubAttribute.AUTONOMOUS, "su_main", True),
    ("資工系學會", ClubAttribute.ACADEMIC, "csie_club", True),
    ("電機系學會", ClubAttribute.ACADEMIC, "ee_club", True),
    ("機械系學會", ClubAttribute.ACADEMIC, "me_club", False),
    ("機器人研究社", ClubAttribute.ACADEMIC, "robot_club", True),
    ("國際志工社", ClubAttribute.SERVICE, "volunteer", True),
    ("吉他社", ClubAttribute.SOCIAL, "guitar", True),
    ("美術社", ClubAttribute.ART, "art_club", True),
    ("熱音社", ClubAttribute.ART, "rockband", True),
    ("熱舞社", ClubAttribute.ART, "dance_club", True),
    ("Cosplay社", ClubAttribute.ART, "cosplay", True),
    ("攝影社", ClubAttribute.ART, "photo_club", True),
    ("登山社", ClubAttribute.SPORTS, "hiking", True),
    ("網球社", ClubAttribute.SPORTS, "tennis", True),
]

# 資工系學會成員名單(參考 frontend/src/features/members/mock.ts;學期各一份快照)
# {學期: [(姓名, 學號, 身份, 職稱)]}
CSIE_MEMBERS: dict[str, list[tuple[str, str, MemberKind, str | None]]] = {
    "114-1": [
        ("顏志明", "B11200001", MemberKind.PRESIDENT, None),
        ("林小芳", "B11200002", MemberKind.VICE_PRESIDENT, None),
        ("陳大文", "B11200003", MemberKind.OFFICER, "總務"),
        ("蔡佳蓉", "B11100031", MemberKind.OFFICER, "活動"),
        ("張晉安", "B11200104", MemberKind.MEMBER, None),
        ("王思晴", "B11200105", MemberKind.MEMBER, None),
        ("周家豪", "B11100032", MemberKind.MEMBER, None),
        ("劉宥廷", "B11100033", MemberKind.MEMBER, None),
    ],
    "114-2": [
        ("顏志明", "B11200001", MemberKind.PRESIDENT, None),
        ("林小芳", "B11200002", MemberKind.VICE_PRESIDENT, None),
        ("陳大文", "B11200003", MemberKind.OFFICER, "總務"),
        ("黃冠宇", "B11200004", MemberKind.OFFICER, "活動"),
        ("吳佩珊", "B11200005", MemberKind.OFFICER, "文書"),
        ("張晉安", "B11200104", MemberKind.MEMBER, None),
        ("王思晴", "B11200105", MemberKind.MEMBER, None),
        ("李承翰", "B11300021", MemberKind.MEMBER, None),
        ("郭子瑜", "B11300022", MemberKind.MEMBER, None),
        ("許維倫", "B11300023", MemberKind.MEMBER, None),
    ],
}

# 器材主檔(2026-07-17 需求方提供 17 項總數;數量與點交方式由管理員後台維護)
# (名稱, 總數, 依序點交);依序點交=需登記序號逐台清點
EQUIPMENT_MASTER: list[tuple[str, int, bool]] = [
    ("帳篷", 6, True),
    ("摺疊桌", 25, False),
    ("椅子", 80, False),
    ("紅龍", 6, False),
    ("電腦單槍投影機", 5, True),
    ("麥克風架", 6, False),
    ("擴音機MA101", 2, True),
    ("各式音源線", 20, False),
    ("投影銀幕", 5, True),
    ("旗桿/旗座組", 10, False),
    ("擴音器 tw-Hi92", 3, True),
    ("TRUSS", 3, False),
    ("酒精", 2, False),
    ("溫度計", 3, False),
    ("5M 延長線", 5, False),
    ("10M 延長線", 2, False),
    ("15M 延長線", 1, False),
]


def _dt(y: int, m: int, d: int, hh: int = 0, mm: int = 0) -> datetime:
    """台北時區 datetime(所有 timestamptz 欄位一律帶時區)。"""
    return datetime(y, m, d, hh, mm, tzinfo=TAIPEI)


# ---------------------------------------------------------------------------
# 實體檔案:極小但合法的 PNG / 單頁 PDF(GET /files/{id} 可直接預覽)
# ---------------------------------------------------------------------------
def _png_bytes(rgb: tuple[int, int, int], size: int = 64) -> bytes:
    """產生 size×size 單色 PNG(標準 chunk + CRC,瀏覽器可顯示);顏色不同→sha256 不同。"""

    def chunk(tag: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)  # 8-bit RGB
    raw = (b"\x00" + bytes(rgb) * size) * size  # 每列前綴 filter type 0
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", zlib.compress(raw))
        + chunk(b"IEND", b"")
    )


def _pdf_bytes(title: str, lines: list[str]) -> bytes:
    """單頁 PDF;借用 app.services.pdf 已註冊的 NotoSansTC 才能渲染中文。"""
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen.canvas import Canvas

    import app.services.pdf  # noqa: F401 - import 副作用:註冊 NotoSansTC 字型

    buf = io.BytesIO()
    canvas = Canvas(buf, pagesize=A4)
    canvas.setTitle(title)
    canvas.setFont("NotoSansTC", 16)
    canvas.drawString(60, 780, title)
    canvas.setFont("NotoSansTC", 11)
    for i, line in enumerate(lines):
        canvas.drawString(60, 750 - i * 20, line)
    canvas.showPage()
    canvas.save()
    return buf.getvalue()


def _upload_root() -> Path:
    root = Path(settings.upload_dir)
    return root if root.is_absolute() else BACKEND_DIR / root


class MockFiles:
    """檔案落盤 + files 列建立;UUID 以 uuid5(label) 生成,重跑結果相同。"""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.root = _upload_root()

    def add(
        self,
        label: str,
        data: bytes,
        *,
        module: str,
        slot: str,
        subject_type: str,
        subject_id: int,
        club_id: int,
        uploaded_by: int,
        original_name: str,
        mime: str,
    ) -> File:
        file_id = uuid.uuid5(uuid.NAMESPACE_URL, f"club-aio-mock/{label}")
        rel_path = f"{module}/2026/07/{file_id}"  # 佈局 {module}/{YYYY}/{MM}/{uuid}
        dest = self.root / rel_path
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(data)
        row = File(
            id=file_id,
            club_id=club_id,
            uploaded_by=uploaded_by,
            subject_type=subject_type,
            subject_id=subject_id,
            slot=slot,
            original_name=original_name,
            size=len(data),
            mime=mime,
            sha256=hashlib.sha256(data).hexdigest(),
            path=rel_path,
        )
        self.db.add(row)
        return row


# ---------------------------------------------------------------------------
# 各模組 mock 資料
# ---------------------------------------------------------------------------
async def _create_clubs_and_users(db: AsyncSession) -> tuple[dict[str, Club], dict[str, User]]:
    clubs: dict[str, Club] = {}
    for name, attribute, account, active in CLUBS:
        club = Club(name=name, attribute=attribute, intro=f"{name}(示範資料)", is_active=active)
        clubs[account] = club
        db.add(club)

    # 示範社:資工系學會補齊管理項目欄位(指導老師/簡介/網頁=行政分 ad6 依據/聯絡 Email)
    csie = clubs["csie_club"]
    csie.intro = "以程式設計與資訊技術交流為核心的系學會,定期舉辦社課、工作坊與跨校活動。"
    csie.website_url = "https://csie-club.ntust.edu.tw"
    csie.contact_emails = ["csie.club@mail.ntust.edu.tw", "csie.president@mail.ntust.edu.tw"]
    csie.advisor_name = "張明哲"
    csie.advisor_dept = "資訊工程系"
    csie.advisor_email = "mjchang@mail.ntust.edu.tw"
    csie.advisor_ext = "3271"
    await db.flush()  # 取得 club id

    users: dict[str, User] = {}
    club_hash = hash_password(CLUB_PASSWORD)  # 同密碼只雜湊一次(argon2 較慢)
    for name, _attr, account, _active in CLUBS:
        # 開發用帳號一律 must_change_password=False,登入後免走首登改密流程
        users[account] = User(
            role=UserRole.CLUB,
            username=account,
            password_hash=club_hash,
            name=name,
            club_id=clubs[account].id,
            must_change_password=False,
        )

    admin_hash = hash_password(ADMIN_PASSWORD)
    # 一般管理員:依頁面權限鍵分權(勿與簽核關卡鍵混淆)
    users["admin_lee"] = User(
        role=UserRole.ADMIN,
        username="admin_lee",
        password_hash=admin_hash,
        name="李承辦",
        permissions=["areview", "aclose", "asignup"],
        must_change_password=False,
    )
    users["admin_chen"] = User(
        role=UserRole.ADMIN,
        username="admin_chen",
        password_hash=admin_hash,
        name="陳承辦",
        permissions=["abooking", "aroom", "amaint", "aviol", "amember"],
        must_change_password=False,
    )
    # 學務長=受限帳號僅簽核:學務長關卡即使 super 也必須明確持有 approve_dean
    # (admin_activities._require_stage_key),故 permissions 只放這一鍵、不給任何頁面鍵
    users["dean"] = User(
        role=UserRole.ADMIN,
        username="dean",
        password_hash=admin_hash,
        name="學務長",
        permissions=["approve_dean"],
        must_change_password=False,
    )
    users["staff_lee"] = User(
        role=UserRole.STAFF,
        username="staff_lee",
        password_hash=hash_password(STAFF_PASSWORD),
        name="李工讀",
        must_change_password=False,
    )
    users["viewer01"] = User(
        role=UserRole.VIEWER,
        username="viewer01",
        password_hash=hash_password(VIEWER_PASSWORD),
        name="評審 01",
        can_view_eval=True,
        must_change_password=False,
    )
    for user in users.values():
        db.add(user)
    await db.flush()
    return clubs, users


def _create_members(db: AsyncSession, csie: Club) -> None:
    for semester, roster in CSIE_MEMBERS.items():
        for name, sid, kind, title in roster:
            db.add(
                ClubMember(
                    club_id=csie.id,
                    name=name,
                    student_id=sid,
                    kind=kind,
                    title=title,
                    semester=semester,
                )
            )


def _create_equipment(db: AsyncSession) -> dict[str, Equipment]:
    rows = {
        name: Equipment(name=name, total_qty=qty, needs_serial=serial, sort=i)
        for i, (name, qty, serial) in enumerate(EQUIPMENT_MASTER, 1)
    }
    for row in rows.values():
        db.add(row)
    return rows


def _add_activity(
    db: AsyncSession,
    club: Club,
    creator: User,
    *,
    name: str,
    type_: ActivityType,
    status: ActivityStatus,
    date_: date,
    end_date: date | None = None,
    start_time: time | None = None,
    end_time: time | None = None,
    location: str,
    content: str = "",
    staff_text: str = "",
    participants: tuple[int, int] = (0, 0),
    is_large: bool = False,
    is_large_approved: bool | None = None,
    fund_source: str | None = None,
    # (科目, 說明, 自籌, 擬請補助, 核定補助|None)
    budget: tuple[tuple[str, str, int, int, int | None], ...] = (),
    close_draft: dict | None = None,
) -> Activity:
    activity = Activity(
        club_id=club.id,
        created_by=creator.id,
        name=name,
        type=type_,
        status=status,
        date=date_,
        end_date=end_date or date_,
        start_time=start_time,
        end_time=end_time,
        location=location,
        content=content,
        staff_text=staff_text,
        participants_in=participants[0],
        participants_out=participants[1],
        is_large=is_large,
        is_large_approved=is_large_approved,
        fund_source=fund_source,
        close_draft=close_draft,
    )
    approved = [b[4] for b in budget if b[4] is not None]
    activity.school_approved = sum(approved) if approved else None
    for category, description, self_fund, requested, appr in budget:
        activity.budget_items.append(
            ActivityBudgetItem(
                category=category,
                description=description,
                self_fund=self_fund,
                requested_subsidy=requested,
                approved_subsidy=appr,
            )
        )
    db.add(activity)
    return activity


def _approve_records(
    db: AsyncSession, activity: Activity, stages: tuple[str, ...], super_user: User, dean: User
) -> None:
    """活動申請簽核軌跡:advisor/chief 由 super 代簽(dev 環境唯二可簽帳號),dean 本人。"""
    for stage in stages:
        db.add(
            ApprovalRecord(
                subject_type=ApprovalSubject.ACTIVITY,
                subject_id=activity.id,
                stage=stage,
                decision=ApprovalDecision.APPROVE,
                actor_id=(dean if stage == "dean" else super_user).id,
            )
        )


def _add_report(
    db: AsyncSession,
    activity: Activity,
    *,
    submitted_at: datetime,
    member_count: int,
    non_member_count: int,
    actual_start: time,
    actual_end: time,
    actual_location: str,
    highlights: str,
    goals: str,
    others: str,
    expense: int,
    review: tuple[date, int, str, str] | None = None,  # (日期, 與會人數, 討論事項, 決議)
    video_url: str | None = None,
    reflections: tuple[tuple[str, str, str], ...] = (),  # (姓名, 系級, 心得)
) -> ActivityReport:
    report = ActivityReport(
        activity_id=activity.id,
        member_count=member_count,
        non_member_count=non_member_count,
        actual_start=actual_start,
        actual_end=actual_end,
        actual_location=actual_location,
        highlights=highlights,
        goals=goals,
        others=others,
        review_meeting=review is not None,
        review_date=review[0] if review else None,
        review_attendees=review[1] if review else None,
        review_topics=review[2] if review else None,
        review_conclusion=review[3] if review else None,
        video_url=video_url,
        expense=expense,
        submitted_at=submitted_at,
    )
    report.reflections = [
        ActivityReflection(student_name=n, dept=d, body=b) for n, d, b in reflections
    ]
    db.add(report)
    return report


async def _create_activities(
    db: AsyncSession,
    files: MockFiles,
    clubs: dict[str, Club],
    users: dict[str, User],
    super_user: User,
) -> dict[str, Activity]:
    csie, csie_user = clubs["csie_club"], users["csie_club"]
    dean = users["dean"]
    acts: dict[str, Activity] = {}

    # 1. 草稿
    acts["draft"] = _add_activity(
        db, csie, csie_user,
        name="AI 程式設計社課", type_=ActivityType.COURSE,
        status=ActivityStatus.DRAFT,
        date_=date(2026, 7, 22), start_time=time(19, 0), end_time=time(21, 0),
        location="S207", content="Python 與生成式 AI 入門,含實作練習。",
        staff_text="講師:張明哲 教授", participants=(30, 0),
        budget=(("印刷費", "講義印製", 500, 0, None),),
    )
    # 2. 待輔導老師審(無補助)
    acts["pending_advisor"] = _add_activity(
        db, csie, csie_user,
        name="Python 入門社課", type_=ActivityType.COURSE,
        status=ActivityStatus.PENDING_ADVISOR,
        date_=date(2026, 7, 23), start_time=time(19, 0), end_time=time(21, 0),
        location="S207", content="基礎語法與資料處理,適合零基礎社員。",
        staff_text="講師:顏志明", participants=(25, 0),
        budget=(("印刷費", "教材影印", 300, 0, None),),
    )
    # 3. 待組長審(有補助:第一關已認定經費來源與逐項核定)
    acts["pending_chief"] = _add_activity(
        db, csie, csie_user,
        name="校際程式競賽", type_=ActivityType.EVENT,
        status=ActivityStatus.PENDING_CHIEF,
        date_=date(2026, 7, 28), end_date=date(2026, 7, 29),
        start_time=time(9, 0), end_time=time(17, 0),
        location="國際大樓 IB 廳", content="邀請北區大專院校組隊參賽,推廣程式教育。",
        staff_text="總召:顏志明;裁判:張明哲 教授", participants=(60, 40),
        fund_source="課指組補助+自籌",
        budget=(
            ("比賽獎勵品", "前三名獎品", 0, 8000, 6000),
            ("膳食費", "工作人員與裁判便當", 2000, 4000, 3000),
        ),
    )
    # 4. 待學務長審
    acts["pending_dean"] = _add_activity(
        db, csie, csie_user,
        name="資安工作坊", type_=ActivityType.EVENT,
        status=ActivityStatus.PENDING_DEAN,
        date_=date(2026, 7, 30), start_time=time(9, 0), end_time=time(16, 0),
        location="S302/S303", content="CTF 入門與網站滲透測試實作。",
        staff_text="講師:業界資安顧問", participants=(50, 10),
        fund_source="課指組補助",
        budget=(
            ("指導老師、教練費", "外聘講師鐘點", 0, 6000, 6000),
            ("印刷費", "教材與海報", 200, 1000, 800),
        ),
    )
    # 5. 已核准・未開始(三關全簽)
    acts["approved_future"] = _add_activity(
        db, csie, csie_user,
        name="新生迎新博覽會", type_=ActivityType.EVENT,
        status=ActivityStatus.APPROVED,
        date_=date(2026, 7, 25), start_time=time(10, 0), end_time=time(16, 0),
        location="戶外精誠廣場", content="新生社團博覽會攤位,展示系學會年度活動成果。",
        staff_text="攤位:黃冠宇;文宣:吳佩珊", participants=(40, 200),
        fund_source="課指組補助",
        budget=(
            ("雜支", "攤位佈置材料", 500, 2000, 1500),
            ("印刷費", "招生文宣", 0, 3000, 2500),
        ),
    )
    # 6. 已核准・已結束(無補助單關;可進結案流程)
    acts["approved_ended"] = _add_activity(
        db, csie, csie_user,
        name="期末社員大會", type_=ActivityType.MEETING,
        status=ActivityStatus.APPROVED,
        date_=date(2026, 6, 24), start_time=time(18, 30), end_time=time(20, 30),
        location="S302/S303", content="本學期成果回顧與下學期幹部交接說明。",
        staff_text="主持:顏志明", participants=(45, 0),
        budget=(("膳食費", "茶點", 1200, 0, None),),
    )
    # 7. 大型活動・待認可(申請時勾選,第一關尚未認定)
    acts["large_pending"] = _add_activity(
        db, csie, csie_user,
        name="聯合黑客松", type_=ActivityType.EVENT,
        status=ActivityStatus.PENDING_ADVISOR,
        date_=date(2026, 7, 26), end_date=date(2026, 7, 27),
        start_time=time(9, 0), end_time=time(18, 0),
        location="國際大樓 IB 廳", content="與北科、台大聯合舉辦 24 小時黑客松。",
        staff_text="總召:林小芳", participants=(80, 120),
        is_large=True, is_large_approved=None,  # 空心=待認可
        budget=(("雜支", "場地佈置與獎品", 3000, 5000, None),),
    )
    # 8. 退回件(附退回原因)
    acts["rejected"] = _add_activity(
        db, csie, csie_user,
        name="春季登山健行聯誼", type_=ActivityType.EVENT,
        status=ActivityStatus.REJECTED,
        date_=date(2026, 5, 10), start_time=time(7, 0), end_time=time(17, 0),
        location="陽明山國家公園", content="與登山社聯合舉辦的健行聯誼活動。",
        staff_text="領隊:陳大文", participants=(20, 5),
        budget=(("交通費", "遊覽車租借", 0, 3000, None),),
    )
    # 9. 已結案(大型・已認可;完整 report+心得+經費核定+簽核軌跡+照片+企劃書)
    acts["closed"] = _add_activity(
        db, csie, csie_user,
        name="迎新宿營", type_=ActivityType.EVENT,
        status=ActivityStatus.CLOSED,
        date_=date(2026, 4, 25), end_date=date(2026, 4, 26),
        start_time=time(9, 0), end_time=time(17, 0),
        location="新竹尖石露營區", content="兩天一夜迎新宿營,含團康、營火晚會與小組競賽。",
        staff_text="總召:顏志明;活動:黃冠宇;總務:陳大文", participants=(42, 8),
        is_large=True, is_large_approved=True,  # 實心=已認可(行政分 ×3)
        fund_source="課指組補助+自籌",
        budget=(
            ("交通費", "遊覽車兩日租借", 5000, 10000, 8000),
            ("保險費", "全員平安保險", 0, 3000, 3000),
            ("膳食費", "五餐伙食", 8000, 0, 0),
        ),
    )
    # 10. 結案待審(report 已送出,輔導老師未簽)
    acts["closing"] = _add_activity(
        db, csie, csie_user,
        name="社員迎新茶會", type_=ActivityType.EVENT,
        status=ActivityStatus.CLOSING_PENDING_ADVISOR,
        date_=date(2026, 6, 10), start_time=time(15, 0), end_time=time(17, 0),
        location="S204 共享食堂", content="下學期新進社員交流茶會。",
        staff_text="主持:林小芳", participants=(35, 5),
        budget=(("膳食費", "茶點與飲料", 1500, 0, None),),
    )
    # 11. 已核准・已結束・存有結案草稿(照片不隨草稿)。
    # close_draft 為前端 opaque JSON,鍵名須與前端 buildDraftReport() 的 camelCase 一致
    # (曾誤用 snake_case,導致結案頁讀 reflections.name 為 undefined 而整頁白畫面)
    acts["close_draft"] = _add_activity(
        db, csie, csie_user,
        name="暑期程式馬拉松", type_=ActivityType.EVENT,
        status=ActivityStatus.APPROVED,
        date_=date(2026, 7, 4), end_date=date(2026, 7, 5),
        start_time=time(9, 0), end_time=time(18, 0),
        location="國際大樓 IB-505", content="兩日集訓式程式馬拉松,分組完成專題雛形。",
        staff_text="總召:黃冠宇", participants=(36, 4),
        budget=(("膳食費", "兩日午餐", 4000, 0, None),),
        close_draft={
            "memberCount": 33,
            "nonMemberCount": 4,
            "actualStart": "09:10",
            "actualEnd": "17:40",
            "actualLocation": "國際大樓 IB-505",
            "highlights": "六組皆完成可展示的專題雛形,含兩組 AI 應用。",
            "goals": "",
            "others": "",
            "reviewMeeting": False,
            "videoLink": "",
            "expense": 3860,
            "reflections": [
                {
                    "name": "李承翰",
                    "dept": "資工二",
                    "text": "首次完整跑完開發流程,收穫很多。",
                }
            ],
        },
    )
    # 12. 已核准・進行中(跨越今天;供器材借出中示範)
    acts["ongoing"] = _add_activity(
        db, csie, csie_user,
        name="社辦器材整備週", type_=ActivityType.EVENT,
        status=ActivityStatus.APPROVED,
        date_=date(2026, 7, 14), end_date=date(2026, 7, 18),
        start_time=time(9, 0), end_time=time(17, 0),
        location="社辦 A203", content="暑期社辦與器材盤點整備。",
        staff_text="總務:陳大文", participants=(10, 0),
        budget=(("雜支", "收納與標籤耗材", 800, 0, None),),
    )
    # 13. 其他社團:電機系學會已核准社課(多社資料示意)
    acts["ee_approved"] = _add_activity(
        db, clubs["ee_club"], users["ee_club"],
        name="電路實作工作坊", type_=ActivityType.COURSE,
        status=ActivityStatus.APPROVED,
        date_=date(2026, 7, 8), start_time=time(14, 0), end_time=time(17, 0),
        location="S209", content="麵包板電路與焊接基礎。",
        staff_text="講師:電機系助教", participants=(28, 0),
        budget=(("雜支", "電子零件材料包", 2000, 0, None),),
    )
    await db.flush()  # 取得 activity id(簽核/報告/檔案 FK 需要)

    # 簽核軌跡(狀態欄只是快照,軌跡才是依據)
    _approve_records(db, acts["pending_chief"], ("advisor",), super_user, dean)
    _approve_records(db, acts["pending_dean"], ("advisor", "chief"), super_user, dean)
    _approve_records(db, acts["approved_future"], ("advisor", "chief", "dean"), super_user, dean)
    _approve_records(db, acts["approved_ended"], ("advisor",), super_user, dean)
    _approve_records(db, acts["closed"], ("advisor", "chief", "dean"), super_user, dean)
    _approve_records(db, acts["closing"], ("advisor",), super_user, dean)
    _approve_records(db, acts["close_draft"], ("advisor",), super_user, dean)
    _approve_records(db, acts["ongoing"], ("advisor",), super_user, dean)
    _approve_records(db, acts["ee_approved"], ("advisor",), super_user, dean)
    db.add(  # 退回件:退回必填原因
        ApprovalRecord(
            subject_type=ApprovalSubject.ACTIVITY,
            subject_id=acts["rejected"].id,
            stage="advisor",
            decision=ApprovalDecision.REJECT,
            actor_id=super_user.id,
            reason="交通與保險規劃不完整,請補充承租車行資訊與投保明細後重送。",
        )
    )

    # 已結案:成果調查 + 檢討會議 + 心得 ×3 + 結案簽核
    _add_report(
        db, acts["closed"],
        submitted_at=_dt(2026, 5, 4, 10, 0),
        member_count=42, non_member_count=8,
        actual_start=time(9, 30), actual_end=time(16, 30),
        actual_location="新竹尖石露營區",
        highlights="兩日課程與團康皆順利完成,新生參與度高,營火晚會為本屆亮點。",
        goals="透過分組任務讓新生快速認識系上與學會運作,達成招募新幹部 8 名的目標。",
        others="與熱舞社合作開場表演;天候良好,無安全事件。",
        expense=25400,
        review=(
            date(2026, 4, 29), 12,
            "交通集合動線混亂、第二日行程過於緊湊",
            "下屆改為分批集合並預留彈性時段;保險名冊提前一週確認。",
        ),
        video_url="https://youtu.be/club-aio-mock-camp",
        reflections=(
            ("張晉安", "資工三", "第一次以工作人員身分參與宿營,學會了活動流程控管與臨場應變。"),
            ("王思晴", "資工三", "帶小隊的過程讓我更了解如何照顧新生情緒,團隊合作默契大增。"),
            ("李承翰", "資工二", "從器材搬運到營火晚會執行,體會到幕後籌備的辛苦與成就感。"),
        ),
    )
    db.add(
        ApprovalRecord(
            subject_type=ApprovalSubject.ACTIVITY_CLOSE,
            subject_id=acts["closed"].id,
            stage="advisor",
            decision=ApprovalDecision.APPROVE,
            actor_id=super_user.id,
        )
    )
    # 結案待審:report 已送出、無結案簽核
    _add_report(
        db, acts["closing"],
        submitted_at=_dt(2026, 6, 15, 14, 0),
        member_count=32, non_member_count=6,
        actual_start=time(15, 10), actual_end=time(17, 0),
        actual_location="S204 共享食堂",
        highlights="新進社員自我介紹與分組交流,氣氛熱絡。",
        goals="促進新舊社員認識,會後即有 5 位新社員加入專題小組。",
        others="茶點準備量恰當,無剩食。",
        expense=1450,
        reflections=(
            ("郭子瑜", "資工二", "透過茶會認識了許多學長姊,對系學會活動更有參與感。"),
            ("許維倫", "資工二", "第一次協助辦活動,學會了場地佈置與流程掌控。"),
            ("黃冠宇", "資工三", "主持分組交流讓我練習帶動氣氛,收穫很大。"),
        ),
    )

    # 檔案:已結案照片 ×5(單色 PNG,顏色不同→sha256 不同,過 report_photo 去重索引)
    photo_colors = [(196, 88, 66), (88, 148, 96), (72, 108, 176), (208, 168, 72), (128, 96, 160)]
    for i, rgb in enumerate(photo_colors, 1):
        files.add(
            f"closed-photo-{i}", _png_bytes(rgb),
            module="reports", slot="report_photo",
            subject_type="activity", subject_id=acts["closed"].id,
            club_id=csie.id, uploaded_by=csie_user.id,
            original_name=f"迎新宿營_{i:02d}.png", mime="image/png",
        )
    files.add(  # 申請附件:企劃書 PDF
        "closed-proposal",
        _pdf_bytes(
            "迎新宿營 活動企劃書",
            ["主辦單位:資工系學會", "活動日期:2026-04-25 ~ 2026-04-26",
             "地點:新竹尖石露營區", "(mock 示範檔案)"],
        ),
        module="activities", slot="proposal",
        subject_type="activity", subject_id=acts["closed"].id,
        club_id=csie.id, uploaded_by=csie_user.id,
        original_name="迎新宿營企劃書.pdf", mime="application/pdf",
    )
    # 結案待審照片 ×3
    for i, rgb in enumerate([(120, 170, 200), (200, 140, 120), (150, 180, 110)], 1):
        files.add(
            f"closing-photo-{i}", _png_bytes(rgb),
            module="reports", slot="report_photo",
            subject_type="activity", subject_id=acts["closing"].id,
            club_id=csie.id, uploaded_by=csie_user.id,
            original_name=f"迎新茶會_{i:02d}.png", mime="image/png",
        )
    return acts


async def _create_bookings(
    db: AsyncSession,
    clubs: dict[str, Club],
    users: dict[str, User],
    acts: dict[str, Activity],
    equipment: dict[str, Equipment],
) -> None:
    csie = clubs["csie_club"]
    staff = users["staff_lee"]
    venue_ids = {
        name: vid
        for vid, name in await db.execute(sa.select(Venue.id, Venue.name))
    }

    # 臨時場地借用(綁定審核通過活動)
    db.add(
        VenueBooking(
            club_id=csie.id, venue_id=venue_ids["戶外精誠廣場 1"],
            activity_id=acts["approved_future"].id,
            date=date(2026, 7, 25), periods=["5", "6", "7"],
            purpose="新生迎新博覽會攤位", status=BookingStatus.PENDING,
        )
    )
    db.add(
        VenueBooking(
            club_id=csie.id, venue_id=venue_ids["S302/S303"],
            activity_id=acts["approved_ended"].id,
            date=date(2026, 6, 24), periods=["A", "B"],
            purpose="期末社員大會", status=BookingStatus.APPROVED,
        )
    )

    # 固定借用(整學期每週固定時段)。真實申請歸屬「下一學期」;
    # 展示資料用當前學期起訖,場況圖今天就看得到固定借用格
    sem_start, sem_end = semester_range(semester_of(date.today()))
    pending_room = RoomBookingRequest(
        club_id=csie.id, venue_id=venue_ids["S304 音樂教室"],
        purpose="每週社課固定教室", status=BookingStatus.PENDING,
        start_date=sem_start, end_date=sem_end,
    )
    pending_room.slots = [  # 週二 3-4 節
        RoomBookingSlot(weekday=2, period="3"),
        RoomBookingSlot(weekday=2, period="4"),
    ]
    db.add(pending_room)
    approved_room = RoomBookingRequest(
        club_id=clubs["guitar"].id, venue_id=venue_ids["練團室"],
        purpose="樂團團練", status=BookingStatus.APPROVED,
        start_date=sem_start, end_date=sem_end,
    )
    approved_room.slots = [  # 週四 8-10 節(含第 10 節,滿足連續 3 節規則)
        RoomBookingSlot(weekday=4, period="8"),
        RoomBookingSlot(weekday=4, period="9"),
        RoomBookingSlot(weekday=4, period="10"),
    ]
    db.add(approved_room)

    # 器材借用(區間=活動起訖 ± 工作天緩衝的快照)
    loans = [
        EquipmentLoan(  # 待審
            club_id=csie.id, equipment_id=equipment["電腦單槍投影機"].id,
            activity_id=acts["approved_future"].id, qty=1,
            start_date=date(2026, 7, 23), end_date=date(2026, 7, 27),
            purpose="博覽會攤位展示影片", status=LoanStatus.PENDING,
        ),
        EquipmentLoan(  # 已核准(未借出)
            club_id=csie.id, equipment_id=equipment["摺疊桌"].id,
            activity_id=acts["approved_future"].id, qty=10,
            start_date=date(2026, 7, 23), end_date=date(2026, 7, 27),
            purpose="攤位桌面佈置", status=LoanStatus.APPROVED,
        ),
        EquipmentLoan(  # 借出中(未逾期:區間跨越今天)
            club_id=csie.id, equipment_id=equipment["帳篷"].id,
            activity_id=acts["ongoing"].id, qty=2,
            start_date=date(2026, 7, 10), end_date=date(2026, 7, 20),
            purpose="整備週戶外器材點檢遮陽", status=LoanStatus.CHECKED_OUT,
            checkout_by=staff.id, checkout_at=_dt(2026, 7, 10, 9, 30),
            serials=["TENT-01", "TENT-02"], borrower_name="顏志明",
        ),
        EquipmentLoan(  # 已歸還(完整借出+歸還點交)
            club_id=csie.id, equipment_id=equipment["擴音機MA101"].id,
            activity_id=acts["closed"].id, qty=1,
            start_date=date(2026, 4, 23), end_date=date(2026, 4, 27),
            purpose="宿營團康與營火晚會擴音", status=LoanStatus.RETURNED,
            checkout_by=staff.id, checkout_at=_dt(2026, 4, 23, 10, 0),
            serials=["MA101-1"], borrower_name="顏志明",
            checkin_by=staff.id, checkin_at=_dt(2026, 4, 27, 9, 50),
            checkin_note="功能正常,附件齊全", returner_name="林小芳",
        ),
        EquipmentLoan(  # 逾期:借出中且 end_date 已過(隔天上班日 10:30 判定為推導)
            club_id=csie.id, equipment_id=equipment["摺疊桌"].id,
            activity_id=acts["close_draft"].id, qty=5,
            start_date=date(2026, 7, 2), end_date=date(2026, 7, 6),
            purpose="程式馬拉松工作桌", status=LoanStatus.CHECKED_OUT,
            checkout_by=staff.id, checkout_at=_dt(2026, 7, 2, 14, 0),
            borrower_name="陳大文",
        ),
    ]
    for loan in loans:
        db.add(loan)


async def _create_applications(
    db: AsyncSession, files: MockFiles, clubs: dict[str, Club], users: dict[str, User]
) -> None:
    csie, csie_user = clubs["csie_club"], users["csie_club"]

    # 空間報修:待處理/處理中/已完成
    pending_maint = MaintenanceRequest(
        club_id=csie.id, location="社辦 A203",
        items="冷氣不冷、日光燈閃爍", status=MaintenanceStatus.PENDING,
    )
    db.add(pending_maint)
    db.add(
        MaintenanceRequest(
            club_id=csie.id, location="社辦 A203", items="天花板漏水",
            status=MaintenanceStatus.IN_PROGRESS, handle_note="已通知總務處,待廠商報價。",
        )
    )
    db.add(
        MaintenanceRequest(
            club_id=csie.id, location="器材室 B1", items="門鎖損壞",
            status=MaintenanceStatus.DONE, handle_note="已於 7/10 更換鎖芯完成。",
        )
    )
    await db.flush()
    files.add(  # 報修佐證照片(slot=evidence)
        "maint-evidence-1", _png_bytes((90, 90, 96)),
        module="maintenance", slot="evidence",
        subject_type="maintenance", subject_id=pending_maint.id,
        club_id=csie.id, uploaded_by=csie_user.id,
        original_name="冷氣故障照片.png", mime="image/png",
    )

    # 郵局帳戶異動(事由複選;避開互斥組合)+ 存簿封面照
    postal = PostalAccountChange(
        club_id=csie.id,
        reasons=[PostalReason.CHANGE_AGENT.value, PostalReason.SEAL_CHANGE.value],
        account_name="國立臺灣科技大學資工系學會",
        account_number="0031234-0567890",
        new_agent_name="林小芳", new_agent_phone="0912345678",
        status=ApplicationStatus.PENDING,
    )
    db.add(postal)
    await db.flush()
    files.add(
        "postal-passbook", _png_bytes((60, 120, 60)),
        module="postal", slot="passbook",
        subject_type="postal_change", subject_id=postal.id,
        club_id=csie.id, uploaded_by=csie_user.id,
        original_name="存簿封面.png", mime="image/png",
    )

    # 幹部證明(姓名依 114-2 名單負責人)
    db.add(
        OfficerCertificate(
            club_id=csie.id, term="114-2", position=CertPosition.LEADER,
            applicant_name="顏志明", status=ApplicationStatus.PENDING,
        )
    )


def _create_violations(db: AsyncSession, clubs: dict[str, Club], users: dict[str, User]) -> None:
    staff = users["staff_lee"]
    # 未銷案・期限內(銷案期限=開立日 +1 個月,推導不儲存)
    db.add(
        Violation(
            club_id=clubs["csie_club"].id, occurred_on=date(2026, 7, 1),
            location="學生活動中心走廊", items=["張貼未核可文宣"],
            filler_id=staff.id, status=ViolationStatus.OPEN,
        )
    )
    # 未銷案・已逾期(2026-05-20 +1 個月 < 今天,不再受理銷案、−1 成立)
    db.add(
        Violation(
            club_id=clubs["rockband"].id, occurred_on=date(2026, 5, 20),
            location="練團室", items=["噪音影響他人", "場地使用後未復原"],
            other="夜間 22 時後仍持續練團", filler_id=staff.id, status=ViolationStatus.OPEN,
        )
    )
    # 已銷案
    db.add(
        Violation(
            club_id=clubs["csie_club"].id, occurred_on=date(2026, 4, 10),
            location="戶外精誠廣場 2", items=["未經申請使用場地"],
            filler_id=staff.id, status=ViolationStatus.RESOLVED,
            resolve_note="已完成場地復原並補辦申請說明。",
        )
    )


def _create_announcements(
    db: AsyncSession, clubs: dict[str, Club], super_user: User
) -> None:
    # 全校(markdown 內容)
    db.add(
        Announcement(
            title="114-2 學期活動結案作業時程公告",
            content=(
                "## 結案期限\n\n"
                "本學期活動請於 **活動結束後 1 個月內** 完成結案,逾期系統將自動鎖定。\n\n"
                "### 應繳資料\n\n"
                "1. 成果調查表(系統填寫)\n"
                "2. 活動照片 **5 張以上** 或成果影片連結\n"
                "3. 學習心得 3 篇以上\n\n"
                "> 未如期結案將影響社團評鑑行政分,請各社團負責人留意。"
            ),
            target_type=AnnouncementTarget.ALL,
            created_by=super_user.id,
        )
    )
    # 依性質(可多選)
    db.add(
        Announcement(
            title="藝術性、體育性社團期末成果展報名開始",
            content="成果展將於 9 月第三週舉行,請於 8/15 前至線上報名頁完成登記。",
            target_type=AnnouncementTarget.ATTR,
            attrs=[ClubAttribute.ART.value, ClubAttribute.SPORTS.value],
            created_by=super_user.id,
        )
    )
    # 單一社團
    db.add(
        Announcement(
            title="迎新宿營結案已核准",
            content="貴社「迎新宿營」結案審核已通過,核銷單據請於 7/31 前送學務處。",
            target_type=AnnouncementTarget.CLUB,
            club_id=clubs["csie_club"].id,
            created_by=super_user.id,
        )
    )
    # 蓋板(takeover_until 未來日期:期限內社團每次登入全版顯示)
    db.add(
        Announcement(
            title="系統暑期維護公告",
            content=(
                "本系統將於 **2026/07/28(二)00:00–06:00** 進行年度維護,"
                "期間暫停服務。\n\n造成不便敬請見諒。"
            ),
            target_type=AnnouncementTarget.ALL,
            takeover_until=date(2026, 7, 31),
            created_by=super_user.id,
        )
    )


async def _create_signups(
    db: AsyncSession, clubs: dict[str, Club], users: dict[str, User]
) -> None:
    admin_lee = users["admin_lee"]
    csie = clubs["csie_club"]

    # A. 普通・開放中(審核制:報名後待管理員確認)
    expo = SignupItem(
        name="社團博覽會攤位報名", kind=SignupKind.NORMAL,
        description="新生社團博覽會攤位登記,每社至多 3 名工作人員,含攤位抽籤說明會。",
        place="戶外精誠廣場", event_at=_dt(2026, 7, 31, 10, 0),
        signup_start=_dt(2026, 7, 1, 9, 0), signup_end=_dt(2026, 7, 28, 23, 59),
        max_participants=3, requires_confirmation=True,
        fields=[
            {"key": "f1", "label": "攤位負責人姓名", "type": "text", "required": True},
            {"key": "f2", "label": "用餐", "type": "radio", "options": ["葷", "素"],
             "required": True},
            {"key": "f3", "label": "備註", "type": "textarea", "required": False},
        ],
        created_by=admin_lee.id,
    )
    # B. 幹訓・已截止(非場次制;簽到餵 ad8)
    training = SignupItem(
        name="114 學年度社團幹部研習營", kind=SignupKind.CADRE_TRAINING,
        description="全日幹部研習,含活動企劃、經費核銷與風險管理課程。",
        place="國際大樓 IB-202", event_at=_dt(2026, 3, 14, 9, 0),
        signup_start=_dt(2026, 2, 1, 9, 0), signup_end=_dt(2026, 3, 1, 23, 59),
        max_participants=5,
        fields=[
            {"key": "f1", "label": "姓名", "type": "text", "required": True},
            {"key": "f2", "label": "學號", "type": "text", "required": True},
        ],
        created_by=admin_lee.id,
    )
    # C. 社團負責人會議(場次制,4 場;出席餵 ad7)
    meeting = SignupItem(
        name="114 學年度社團負責人會議", kind=SignupKind.LEADER_MEETING,
        description="每學期兩次,全學年共 4 場;請各社負責人出席。",
        place="學生活動中心 3F", session_based=True,
        signup_start=_dt(2025, 9, 1, 9, 0), signup_end=_dt(2026, 6, 30, 23, 59),
        max_participants=2,
        fields=[{"key": "f1", "label": "出席負責人姓名", "type": "text", "required": True}],
        created_by=admin_lee.id,
    )
    db.add_all([expo, training, meeting])
    await db.flush()

    sessions = [
        SignupItemSession(item_id=meeting.id, name="第 1 次會議",
                          date=date(2025, 9, 24), semester="114-1"),
        SignupItemSession(item_id=meeting.id, name="第 2 次會議",
                          date=date(2025, 12, 10), semester="114-1"),
        SignupItemSession(item_id=meeting.id, name="第 3 次會議",
                          date=date(2026, 3, 18), semester="114-2"),
        SignupItemSession(item_id=meeting.id, name="第 4 次會議",
                          date=date(2026, 5, 27), semester="114-2"),
    ]
    # 幹訓為非場次制:簽到落在單一預設場次(比照 admin_signups._default_session)
    training_session = SignupItemSession(
        item_id=training.id, name=training.name, date=date(2026, 3, 14), semester="114-2"
    )
    db.add_all([*sessions, training_session])

    # 資工系學會:博覽會存草稿(未送出)、幹訓/負責人會議已報名
    db.add(
        SignupDraft(
            item_id=expo.id, club_id=csie.id,
            participants=[{"f1": "顏志明", "f2": "葷", "f3": "需要電源插座"}],
        )
    )
    guitar_signup = Signup(item_id=expo.id, club_id=clubs["guitar"].id, confirmed=False)
    guitar_signup.entries = [SignupEntry(answers={"f1": "吳映潔", "f2": "素", "f3": ""})]
    db.add(guitar_signup)

    csie_training = Signup(item_id=training.id, club_id=csie.id, confirmed=True)
    csie_training.entries = [
        SignupEntry(answers={"f1": "顏志明", "f2": "B11200001"}),
        SignupEntry(answers={"f1": "林小芳", "f2": "B11200002"}),
    ]
    db.add(csie_training)

    csie_meeting = Signup(item_id=meeting.id, club_id=csie.id, confirmed=True)
    csie_meeting.entries = [SignupEntry(answers={"f1": "顏志明"})]
    ee_meeting = Signup(item_id=meeting.id, club_id=clubs["ee_club"].id, confirmed=True)
    ee_meeting.entries = [SignupEntry(answers={"f1": "電機系學會負責人"})]
    db.add_all([csie_meeting, ee_meeting])
    await db.flush()

    # 簽到登錄(部分已簽到:csie 出席前 3 場、缺席第 4 場 → ad7 3×1.25)
    attendance_plan = [
        (sessions[0], csie.id, True), (sessions[1], csie.id, True),
        (sessions[2], csie.id, True), (sessions[3], csie.id, False),
        (sessions[0], clubs["ee_club"].id, True),
        (training_session, csie.id, True),  # 幹訓出席 → ad8
    ]
    for session, club_id, attended in attendance_plan:
        db.add(
            SessionAttendance(
                session_id=session.id, club_id=club_id, attended=attended,
                marked_by=admin_lee.id,
                marked_at=_dt(session.date.year, session.date.month, session.date.day, 17, 0),
            )
        )


def _create_eval(db: AsyncSession, clubs: dict[str, Club], super_user: User) -> None:
    """評鑑:AwardRubricItem 逐年由行政建立(基礎 seed 未建),故略過 rubric/上傳;
    僅登錄一筆表現優良加分(行政分屬最佳社團獎;評鑑視窗預設 116 年)。"""
    db.add(
        EvalAdjustment(
            year=116, award_id="club", club_id=clubs["csie_club"].id,
            kind=AdjustmentKind.MERIT_BONUS, value={"score": 5},
            reason="協助本處辦理新生定向輔導,表現優良。",
            actor_id=super_user.id,
        )
    )


def _create_settings(db: AsyncSession) -> None:
    """營運參數:固定借用開放窗設為涵蓋「今天」,固定借用頁面才可操作。"""
    db.add(
        SystemSetting(
            key="fixed_booking_window",
            value={"open_from": "2026-07-01", "open_until": "2026-07-31"},
        )
    )


# ---------------------------------------------------------------------------
# 主流程與輸出
# ---------------------------------------------------------------------------
async def seed_mock(super_username: str) -> None:
    # 整庫已重灌,同步清空上傳目錄(舊實體檔案已成孤兒)
    upload_root = _upload_root()
    shutil.rmtree(upload_root, ignore_errors=True)
    upload_root.mkdir(parents=True, exist_ok=True)

    async with async_session_factory() as db:
        super_user = await db.scalar(sa.select(User).where(User.username == super_username))
        if super_user is None:  # 基礎 seed 必定已建;防禦性檢查
            raise RuntimeError(f"找不到 superadmin:{super_username}")
        # 開發環境免首登改密(正式環境請用 reset_db.py,維持強制改密)
        super_user.must_change_password = False

        files = MockFiles(db)
        clubs, users = await _create_clubs_and_users(db)
        _create_members(db, clubs["csie_club"])
        equipment = _create_equipment(db)
        await db.flush()
        acts = await _create_activities(db, files, clubs, users, super_user)
        await _create_bookings(db, clubs, users, acts, equipment)
        await _create_applications(db, files, clubs, users)
        _create_violations(db, clubs, users)
        _create_announcements(db, clubs, super_user)
        await _create_signups(db, clubs, users)
        _create_eval(db, clubs, super_user)
        _create_settings(db)
        await db.commit()

    await _print_summary()


async def _print_summary() -> None:
    print("\n=== 各表筆數 ===")
    async with async_session_factory() as db:
        for table in Base.metadata.sorted_tables:
            count = await db.scalar(sa.select(sa.func.count()).select_from(table))
            if count:
                print(f"{table.name:28s} {count}")


def _print_accounts(super_username: str, super_password: str) -> None:
    print("\n=== 帳號密碼一覽(僅開發環境,全部免首登改密)===")
    rows: list[tuple[str, str, str, str]] = [
        ("admin", super_username, super_password, "superadmin(最高權限)"),
        ("admin", "admin_lee", ADMIN_PASSWORD, "權限:areview/aclose/asignup"),
        ("admin", "admin_chen", ADMIN_PASSWORD, "權限:abooking/aroom/amaint/aviol/amember"),
        ("admin", "dean", ADMIN_PASSWORD, "學務長(僅 approve_dean 簽核)"),
        ("staff", "staff_lee", STAFF_PASSWORD, "工讀生"),
        ("viewer", "viewer01", VIEWER_PASSWORD, "評審"),
    ]
    rows += [
        ("club", account, CLUB_PASSWORD, name + ("(停用)" if not active else ""))
        for name, _attr, account, active in CLUBS
    ]
    print(f"{'角色':6s} {'帳號':12s} {'密碼':14s} 說明")
    for role, username, password, note in rows:
        print(f"{role:6s} {username:12s} {password:14s} {note}")


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--yes", action="store_true", help="跳過互動確認")
    parser.add_argument("--admin-username", default="super")
    parser.add_argument("--admin-password", default=DEFAULT_SUPER_PASSWORD)
    args = parser.parse_args()

    if not args.yes:
        answer = input("此操作會刪除資料庫全部資料並重灌 mock 資料,輸入 YES 繼續:")
        if answer.strip() != "YES":
            print("已取消")
            return

    # 等同 reset_db:清空 → migrate head → 基礎 seed(五獎項+19 場地+superadmin)
    await drop_all()
    upgrade_head()
    await seed(args.admin_username, args.admin_password)
    # 再灌全模組 mock 資料
    await seed_mock(args.admin_username)
    _print_accounts(args.admin_username, args.admin_password)


if __name__ == "__main__":
    asyncio.run(main())
