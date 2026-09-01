import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models.enums import (
    ApplicationStatus,
    BookingStatus,
    CertPosition,
    ClubAttribute,
    ClubKind,
    LoanStatus,
    MaintenanceStatus,
    PostalReason,
    ViolationStatus,
)
from app.schemas.accounts import _USERNAME_RE
from app.schemas.activities import FileOut
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
    """第一關(承辦人)認定經費來源與逐項核定;其後關卡空 body 即可。

    school_approved 由後端依逐項核定加總,不接受外部值。
    """

    fund_source: str | None = Field(None, max_length=100)
    # 審核備註:任一關都寫得動(不是第一關的認定),空字串=清空,省略=不動
    admin_note: str | None = Field(None, max_length=1000)
    budget: list[BudgetApprovalIn] = Field(default_factory=list, max_length=50)
    is_large_approved: bool | None = None  # 大型活動認可(僅 is_large 申請有效)


class RejectIn(BaseModel):
    reason: str = Field(min_length=1, max_length=500)

    _strip = field_validator("reason")(_strip_reason)


class CloseApproveIn(BaseModel):
    """結案核准繳交確認:未確認之項目評鑑以 0 分計(照片確認涵蓋影片連結)。

    三項皆必填 —— 送出結案時後端就強制照片 ≥5 張、心得 ≥3 篇,所以這裡確認的是
    「承辦認不認可採計」而非「有沒有繳」。省略欄位等於預設全採計,直呼 API 就能
    繞過整個確認動作,故不給預設值。
    """

    photos_confirmed: bool
    report_confirmed: bool
    reflections_confirmed: bool


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


# ---- 報名簽到登錄(評鑑僅採計簽到,活動結束後由管理員登錄) ----


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


class ViolationFillerOut(BaseModel):
    id: int
    name: str


class ViolationOptionsOut(BaseModel):
    """篩選選項取自實際開立過的紀錄:目錄(system_settings)改過之後,舊項目仍篩得到。"""

    items: list[str]
    fillers: list[ViolationFillerOut]


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
    evidence: list[FileOut] = []  # 佐證照片/影片:報修最主要的判斷依據


# ---- 線上申請管理(/admin/applications,權限鍵 aapply) ----


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
    account_name: str | None
    account_number: str | None
    new_agent_name: str | None
    new_agent_phone: str | None  # 行政端顯示完整電話(承辦需聯絡代理人)
    status: ApplicationStatus
    created_at: datetime
    passbook: list[FileOut] = []  # 存簿影本(承辦核對局號帳號的依據)


class ApplicationStatusIn(BaseModel):
    """狀態機:審核中 → 處理中 → 已完成(只能往前,可跳過處理中;D-25)。

    收得下整個 `ApplicationStatus`,但**幹部證明才走得到 `declined`(已駁回)**(D-37);
    郵局帳戶異動送這個值會被 `_ALLOWED_NEXT` 擋成 409。
    """

    status: ApplicationStatus


# ---- 社團主檔管理(/admin/clubs;三頁三把鍵,見 core/permissions 的 CLUB_* 群組) ----


class AdminClubOut(BaseModel):
    """列表用:全部社團(<200 筆,不分頁)供 ClubCascader 與管理項目。"""

    id: int
    name: str
    kind: str  # 社團/學會
    attribute: str | None  # 停社舊社團原性質不可考 → None
    username: str | None = None  # 社團帳號(一社一帳號;尚未建立時為 None)
    is_active: bool
    suspended_until: date | None


class ClubOptionOut(BaseModel):
    """最小社團選項(任何管理員可讀):跨頁社團選擇器用,不含敏感欄位。"""

    id: int
    name: str
    kind: str  # 社團/學會(負責人顯示詞推導)
    attribute: str | None  # ClubCascader 第一層=性質資料夾;None 歸「未分類」
    # 行政分審核的下拉只列得出啟用中社團(該頁的端點對停用社團一律 404)。
    # 停權日等敏感欄位仍留在需要 aclub 的完整主檔,這裡只回啟停用旗標
    is_active: bool


class AdminClubDetailOut(AdminClubOut):
    """單一社團:社團自管資料唯讀呈現 + 帳號與停權資訊。

    webhook 僅回是否已設定(布林),不回傳實值。
    """

    en_name: str | None
    intro: str
    website_url: str | None
    contact_emails: list[str]
    discord_webhook_set: bool
    advisor_name: str | None
    advisor_dept: str | None
    advisor_email: str | None
    advisor_out_name: str | None
    advisor_out_dept: str | None
    advisor_out_email: str | None
    suspend_reason: str | None


class AdminClubCreate(BaseModel):
    """新增社團主檔;帳號另走 `POST /admin/clubs/{id}/account`(建了才登得進來)。

    `kind` 不收:一律由名稱結尾推導(`derive_kind`,與改名同一條規則),推不出來時
    先當社團 —— 它只決定負責人的顯示詞(社長/會長),管理項目改得動。
    `attribute` 必填:沒有性質的社團不會出現在社團漏斗(`groupClubsForFilter` 略過),
    建好卻在篩選裡找不到比擋下來更難查。
    """

    name: str = Field(min_length=1, max_length=100)
    attribute: ClubAttribute

    @field_validator("name")
    @classmethod
    def _strip_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("社團名稱不得為空白")
        return v


class AdminClubUpdate(BaseModel):
    """行政可改:社團名稱 / 社團或學會 / 性質 / 英文名 / 帳號 username / 啟停用。

    改名時結尾「社」→社團、「會」→學會自動推導 kind;推導不到時沿用原值,
    可另帶 kind 手動指定(2026-07-21,取代原「名稱強制社/會結尾」規則)。
    """

    name: str | None = Field(None, min_length=1, max_length=100)
    kind: ClubKind | None = None
    # 建檔時必填(AdminClubCreate),之後改得動:選錯性質的社團會整個從社團漏斗消失,
    # 沒有這條就只剩下手動改 DB 一途。既有的 null(停社遷入舊社)不因此被迫補值
    attribute: ClubAttribute | None = None
    en_name: str | None = Field(None, max_length=200)
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


class ClubAccountCreateIn(BaseModel):
    """建立社團帳號(一社一帳號;帳號名由行政指定,格式比照 /admin/accounts)。"""

    username: str

    @field_validator("username")
    @classmethod
    def _valid_username(cls, v: str) -> str:
        v = v.strip()
        if not _USERNAME_RE.match(v):
            raise ValueError("帳號限 3–50 字的英數字與 . _ -")
        return v


class ClubAccountCreatedOut(BaseModel):
    """僅建立當次回傳明文一次性密碼(比照 /admin/accounts)。"""

    username: str
    password: str


class SuspendIn(BaseModel):
    """停權管理(權限鍵 aoverdue):寫 clubs.suspended_until / suspend_reason。"""

    until: date
    reason: str = Field(min_length=1, max_length=500)

    _strip = field_validator("reason")(_strip_reason)


# ---- 臨時場地與器材借用審核(/admin,權限鍵 abooking) ----


class AdminVenueBookingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    club_id: int | None  # NULL=行政手動借用(顯示「學務處」)
    club_name: str = ""
    venue_id: int
    venue_name: str = ""
    activity_id: int | None
    activity_name: str | None = None
    date: date
    periods: list[str]
    purpose: str
    phone: str | None = None  # 申請時填的聯絡人電話(審核與點交都要聯絡得到人)
    status: BookingStatus
    created_at: datetime
    # 退回/撤銷的處置(承辦要能查理由與經手人,不必翻稽核軌跡)
    decision_reason: str | None = None
    decided_at: datetime | None = None
    decided_by: str | None = None


class AdminEquipmentLoanOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    club_id: int | None  # NULL=行政手動借用(顯示「學務處」)
    club_name: str = ""
    equipment_id: int
    equipment_name: str = ""
    activity_id: int | None  # NULL=行政手動借用或舊系統斷鏈
    activity_name: str | None = None
    qty: int
    start_date: date
    end_date: date
    purpose: str
    phone: str | None = None  # 申請時填的聯絡人電話(審核與點交都要聯絡得到人)
    status: LoanStatus
    created_at: datetime
    overdue: bool = False  # 推導:結束日之隔天上班日 10:30 未歸還
    # 上次寄出歸還提醒的時間:排程每 3 個上班日自動寄,人工按之前先看這個
    last_reminded_at: datetime | None = None
    # 審核檢核資訊(僅待審單推導):該區間可借數(排除本單)
    available_excluding_self: int | None = None
    # 退回/撤銷的處置(承辦要能查理由與經手人,不必翻稽核軌跡)
    decision_reason: str | None = None
    decided_at: datetime | None = None
    decided_by: str | None = None


# ---- 固定場地借用審核(/admin/room-bookings,權限鍵 aroom) ----


class RoomConflictSlotOut(BaseModel):
    """待審單的一格衝突;由重到輕 blocked > taken > temp > pending。"""

    weekday: int
    period: str
    kind: Literal["blocked", "taken", "temp", "pending"]



class AdminRoomBookingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    club_id: int
    club_name: str = ""
    venue_id: int
    venue_name: str = ""
    purpose: str
    status: BookingStatus
    # 目標學期起訖(送出時快照):衝突只發生在區間重疊的兩單之間
    start_date: date
    end_date: date
    created_at: datetime
    slots: list[RoomSlotOut] = []  # 每週 dow×節次
    # 僅待審單推導:哪幾格會撞、撞到什麼(不開放規則 / 已核准固定 / 已核准臨時 / 其他待審)。
    # 判定與核准端的三項檢核同一份 —— 畫面自己算會漏掉其中一種(標成無衝突,按了才 409)
    conflict_slots: list[RoomConflictSlotOut] = []
    # 退回/撤銷的處置(承辦要能查理由與經手人,不必翻稽核軌跡)
    decision_reason: str | None = None
    decided_at: datetime | None = None
    decided_by: str | None = None


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


class AuditOperatorOut(BaseModel):
    id: int
    name: str
    username: str  # 同名者的區辨用(校內同名並不罕見)


class AuditOptionsOut(BaseModel):
    """篩選選項:取自實際留下的紀錄,不是翻過的頁面。"""

    operators: list[AuditOperatorOut]
    actions: list[str]


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
    # 系統總量讀實際磁碟空間:disk_total ≠ total_size + disk_free,
    # 差額為 OS 與同機其他程式的佔用
    disk_total: int  # 磁碟總量(bytes)
    disk_free: int  # 磁碟可用空間(bytes)
    # 使用率分級(decisions.md OPS-07):ok / warn ≥80% / alert ≥90%。
    # alert 時上傳前置閘關閉(ISS-43),畫面要說得出「為什麼傳不上去」
    disk_level: Literal["ok", "warn", "alert"] = "ok"


class AdminFileOut(BaseModel):
    id: uuid.UUID
    original_name: str
    module: str
    club_name: str | None = None
    size: int
    mime: str
    created_at: datetime
    archived: bool = False
    # 本人能否下載此檔:檔案管理頁本身不含下載權,要看該類檔案的頁面權限(D-02)。
    # 少了這欄,畫面只能一律給連結,按下去才吃 404
    can_download: bool = False
