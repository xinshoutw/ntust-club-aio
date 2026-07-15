import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models.enums import MaintenanceStatus, ViolationStatus
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
    total_size: int  # 檔案 + DB


class AdminFileOut(BaseModel):
    id: uuid.UUID
    original_name: str
    module: str
    club_name: str | None = None
    size: int
    mime: str
    created_at: datetime
    archived: bool = False
