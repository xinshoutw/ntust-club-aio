import re
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models.enums import (
    ApplicationStatus,
    CertPosition,
    MaintenanceStatus,
    PostalReason,
)

_TERM_RE = re.compile(r"^\d{3}(-[12])?$")  # 114 / 114-1 / 114-2

class OfficerCertIn(BaseModel):
    term: str = Field(max_length=10)
    position: CertPosition

    @field_validator("term")
    @classmethod
    def _term(cls, v: str) -> str:
        if not _TERM_RE.match(v):
            raise ValueError("學年期格式錯誤(如 114、114-1)")
        return v


class OfficerCertOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    term: str
    position: CertPosition
    applicant_name: str
    status: ApplicationStatus
    created_at: datetime


class PostalChangeIn(BaseModel):
    """事由複選、不設互斥組合,其餘欄位全部選填(decisions.md D-07)。

    互斥組合原本是工程端自訂的,承辦看過之後決定拿掉:一次辦好幾件本來就常見。
    欄位改選填同理 —— 結清銷戶不必填新代理人,新開戶當下也還沒有帳號。
    """

    reasons: list[PostalReason] = Field(min_length=1, max_length=6)
    account_name: str | None = Field(None, max_length=50)
    account_number: str | None = Field(None, min_length=6, max_length=20, pattern=r"^[\d-]+$")
    new_agent_name: str | None = Field(None, max_length=50)
    new_agent_phone: str | None = Field(None, max_length=20)

    @model_validator(mode="after")
    def _check(self):
        if len(set(self.reasons)) != len(self.reasons):
            raise ValueError("事由重複")
        return self


def mask_account(number: str | None) -> str | None:
    """個資遮罩:前 3 碼 + 末 2 碼(決議 §6-11)。"""
    if not number:
        return number
    if len(number) <= 5:
        return number[0] + "*" * (len(number) - 1) if number else ""
    return f"{number[:3]}{'*' * (len(number) - 5)}{number[-2:]}"


def mask_phone(phone: str | None) -> str | None:
    """電話顯示末 3 碼。"""
    if not phone:
        return phone
    return "*" * max(len(phone) - 3, 0) + phone[-3:]


class PostalChangeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    reasons: list[PostalReason]
    account_name: str | None
    account_number: str | None  # 社團端申請紀錄顯示完整局號帳號(不遮罩)
    new_agent_name: str | None
    new_agent_phone: str | None  # 電話仍依決議 §6-11 遮罩(末 3 碼)
    status: ApplicationStatus
    created_at: datetime
    # 0 = 存簿影本還沒上去(兩段式流程的第二步失敗):列表要給補傳入口,
    # 否則社團只能再送一張新單(decisions.md D-06)
    attachment_count: int = 0


class MaintenanceIn(BaseModel):
    location: str = Field(min_length=1, max_length=100)
    items: str = Field(min_length=1, max_length=500)


class MaintenanceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    location: str
    items: str
    status: MaintenanceStatus
    handle_note: str | None
    created_at: datetime
    # 0 = 佐證還沒上去;同 PostalChangeOut.attachment_count
    attachment_count: int = 0


class ViolationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    occurred_on: date
    location: str
    items: list[str]
    other: str | None
    status: str
    resolve_note: str | None
    created_at: datetime
    # 銷案期限(推導不儲存):開立日 +1 個月;逾期即截止,不再受理銷案
    resolve_deadline: date | None = None
    resolve_expired: bool = False


class AnnouncementOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    content: str  # markdown 原文(前端渲染)
    is_auto: bool
    takeover_until: date | None  # 蓋板截止;前端據此於期限內每次登入顯示蓋板
    created_at: datetime
    dismissed: bool = False  # 本社已勾「不再顯示」(蓋板不再出現;列表仍可見)
    unread: bool = False  # 晚於本社已讀水位線(鈴鐺紅點依據)
