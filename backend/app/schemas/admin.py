import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models.enums import (
    ApplicationStatus,
    BookingStatus,
    CertPosition,
    LoanStatus,
    MaintenanceStatus,
    PostalReason,
    ViolationStatus,
)
from app.schemas.accounts import _USERNAME_RE
from app.schemas.bookings import RoomSlotOut
from app.services.scoring import AD_KEYS, AD_MAX


def _validate_ad_key(v: str) -> str:
    if v not in AD_KEYS:
        raise ValueError("無效的行政分項目")
    return v


def _strip_reason(v: str) -> str:
    v = v.strip()
    if not v:
        raise ValueError("原因不得為空白")
    return v


class BudgetApprovalIn(BaseModel):
    item_id: int
    approved_subsidy: int = Field(ge=0, le=10_000_000)


class ApproveActivityIn(BaseModel):
    """第一關(輔導老師)認定經費來源與逐項核定;其後關卡空 body 即可。

    school_approved 由後端依逐項核定加總,不接受外部值。
    """

    fund_source: str | None = Field(None, max_length=100)
    budget: list[BudgetApprovalIn] = Field(default_factory=list, max_length=50)
    is_large_approved: bool | None = None  # 大型活動認可(僅 is_large 申請有效)


class RejectIn(BaseModel):
    reason: str = Field(min_length=1, max_length=500)

    _strip = field_validator("reason")(_strip_reason)


class CloseApproveIn(BaseModel):
    """結案核准繳交確認:未確認之項目評鑑以 0 分計(照片確認涵蓋影片連結)。"""

    photos_confirmed: bool = True
    report_confirmed: bool = True
    reflections_confirmed: bool = True


class ScoreOverrideIn(BaseModel):
    key: str
    score: float
    reason: str = Field(min_length=1, max_length=500)

    _key = field_validator("key")(_validate_ad_key)
    _strip = field_validator("reason")(_strip_reason)

    @model_validator(mode="after")
    def _score_in_range(self):
        # 各項不得超過配分:adj 為 -10..5,其餘 0..滿分
        low, high = (-10.0, 5.0) if self.key == "adj" else (0.0, AD_MAX[self.key])
        if not (low <= self.score <= high):
            raise ValueError(f"{self.key} 的分數必須介於 {low:g}–{high:g}")
        return self


class ScoreRevertIn(BaseModel):
    key: str
    reason: str = Field(min_length=1, max_length=500)

    _key = field_validator("key")(_validate_ad_key)
    _strip = field_validator("reason")(_strip_reason)


class MeritIn(BaseModel):
    score: int = Field(ge=0, le=5)
    reason: str = Field(min_length=1, max_length=500)

    _strip = field_validator("reason")(_strip_reason)


# ---- 報名簽到登錄(2026-07-15:評鑑僅採計簽到,活動結束後由管理員登錄) ----


class AttendanceIn(BaseModel):
    club_id: int
    attended: bool
    session_id: int | None = None  # 場次制活動(如負責人會議)必填;非場次制免帶


class SessionIn(BaseModel):
    """場次建立(負責人會議等場次制活動)。"""

    name: str = Field(min_length=1, max_length=100)
    date: date


class SessionAttendanceOut(BaseModel):
    club_id: int
    attended: bool


class SessionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    date: date
    semester: str
    attendance: list[SessionAttendanceOut] = []


# ---- 違規勸導管理 ----


class ResolveViolationIn(BaseModel):
    note: str = Field(min_length=1, max_length=500)

    _strip = field_validator("note")(_strip_reason)


class AdminViolationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    club_id: int
    club_name: str = ""
    occurred_on: date
    location: str
    items: list[str]
    other: str | None
    filler_id: int
    filler_name: str = ""
    status: ViolationStatus
    resolve_note: str | None
    created_at: datetime
    # 銷案期限(推導不儲存):開立日 +1 個月;逾期截止,銷案鈕停用
    resolve_deadline: date | None = None
    resolve_expired: bool = False


# ---- 維修管理 ----


class AdminMaintenanceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    club_id: int
    club_name: str = ""
    location: str
    items: str
    status: MaintenanceStatus
    handle_note: str | None
    created_at: datetime


# ---- 線上申請管理(/admin/applications,權限鍵 aapply,2026-07-17) ----


class AdminOfficerCertOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    club_id: int
    club_name: str = ""
    term: str
    position: CertPosition
    applicant_name: str
    status: ApplicationStatus
    created_at: datetime


class AdminPostalChangeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    club_id: int
    club_name: str = ""
    reasons: list[PostalReason]
    account_name: str
    account_number: str
    new_agent_name: str | None
    new_agent_phone: str | None  # 行政端顯示完整電話(承辦需聯絡代理人)
    status: ApplicationStatus
    created_at: datetime


class ApplicationStatusIn(BaseModel):
    """狀態機:審核中 → 處理中 → 請洽學務處(僅允許單步前進,比照維修管理)。"""

    status: ApplicationStatus


# ---- 社團主檔管理(/admin/clubs,權限鍵 amember) ----


class AdminClubOut(BaseModel):
    """列表用:全部社團(<200 筆,不分頁)供 ClubCascader 與管理項目。"""

    id: int
    name: str
    attribute: str
    username: str | None = None  # 社團帳號(一社一帳號;尚未建立時為 None)
    is_active: bool
    suspended_until: date | None


class ClubOptionOut(BaseModel):
    """最小社團選項(任何管理員可讀):跨頁社團選擇器用,不含敏感欄位。"""

    id: int
    name: str
    attribute: str  # ClubCascader 第一層=性質資料夾


class AdminClubDetailOut(AdminClubOut):
    """單一社團:社團自管資料唯讀呈現 + 帳號與停權資訊。

    webhook 僅回是否已設定(布林),不回傳實值。
    """

    intro: str
    website_url: str | None
    contact_emails: list[str]
    discord_webhook_set: bool
    advisor_name: str | None
    advisor_dept: str | None
    advisor_email: str | None
    advisor_ext: str | None
    suspend_reason: str | None


class AdminClubUpdate(BaseModel):
    """行政可改:社團名稱 / 帳號 username / 啟停用(名稱結尾規則於端點驗證)。"""

    name: str | None = Field(None, min_length=1, max_length=100)
    username: str | None = None
    is_active: bool | None = None

    @field_validator("name")
    @classmethod
    def _strip_name(cls, v: str | None) -> str | None:
        if v is None:
            return None
        v = v.strip()
        if not v:
            raise ValueError("社團名稱不得為空白")
        return v

    @field_validator("username")
    @classmethod
    def _valid_username(cls, v: str | None) -> str | None:
        if v is None:
            return None
        v = v.strip()
        if not _USERNAME_RE.match(v):
            raise ValueError("帳號限 3–50 字的英數字與 . _ -")
        return v


class SuspendIn(BaseModel):
    """停權管理(僅 super):寫 clubs.suspended_until / suspend_reason。"""

    until: date
    reason: str = Field(min_length=1, max_length=500)

    _strip = field_validator("reason")(_strip_reason)


# ---- 臨時場地與器材借用審核(/admin,權限鍵 abooking) ----


class AdminVenueBookingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    club_id: int
    club_name: str = ""
    venue_id: int
    venue_name: str = ""
    activity_id: int | None
    activity_name: str | None = None
    date: date
    periods: list[str]
    purpose: str
    status: BookingStatus
    created_at: datetime


class AdminEquipmentLoanOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    club_id: int
    club_name: str = ""
    equipment_id: int
    equipment_name: str = ""
    activity_id: int
    activity_name: str | None = None
    qty: int
    start_date: date
    end_date: date
    purpose: str
    status: LoanStatus
    created_at: datetime
    overdue: bool = False  # 推導:結束日之隔天上班日 10:30 未歸還
    # 審核檢核資訊(僅待審單推導):該區間可借數(排除本單)
    available_excluding_self: int | None = None


# ---- 教室固定借用審核(/admin/room-bookings,權限鍵 aroom) ----


class AdminRoomBookingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    club_id: int
    club_name: str = ""
    venue_id: int
    venue_name: str = ""
    purpose: str
    status: BookingStatus
    created_at: datetime
    slots: list[RoomSlotOut] = []  # 每週 dow×節次


# ---- 維修狀態流轉 ----


class MaintenanceStatusIn(BaseModel):
    """狀態機:待處理 → 處理中 → 已完成(僅允許單步前進)。"""

    status: MaintenanceStatus
    handle_note: str | None = Field(None, max_length=500)


# ---- 稽核軌跡 ----


class AuditLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int | None
    user_name: str | None = None
    role: str | None
    action: str
    detail: str
    ip: str | None
    created_at: datetime

    @field_validator("ip", mode="before")
    @classmethod
    def _ip_str(cls, v):  # INET 欄位可能回 ipaddress 物件
        return None if v is None else str(v)


# ---- 檔案管理 ----


class FileUsageModuleOut(BaseModel):
    key: str  # close / eval / apply / apps / repair
    label: str
    size: int  # bytes(未歸檔檔案佔用)
    count: int


class FileUsageOut(BaseModel):
    modules: list[FileUsageModuleOut]  # 有報修檔案時 repair 排第一,其餘依固定順序
    db_size: int  # 「文字內容」:整個 DB 的估算大小(pg_database_size)
    total_size: int  # 檔案 + DB(系統自身佔用,不含 OS/其他程式)
    # 2026-07-17 改實際磁碟空間(不再有邏輯容量):disk_total ≠ total_size + disk_free,
    # 差額為 OS 與同機其他程式的佔用
    disk_total: int  # 磁碟總量(bytes)
    disk_free: int  # 磁碟可用空間(bytes)


class AdminFileOut(BaseModel):
    id: uuid.UUID
    original_name: str
    module: str
    club_name: str | None = None
    size: int
    mime: str
    created_at: datetime
    archived: bool = False
