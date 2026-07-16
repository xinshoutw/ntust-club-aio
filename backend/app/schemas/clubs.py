import re
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.enums import MemberKind

_DISCORD_WEBHOOK_RE = re.compile(r"^https://discord\.com/api/webhooks/\d+/[\w-]+$")
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

MAX_CONTACT_EMAILS = 3


class ClubProfileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    attribute: str
    intro: str
    website_url: str | None
    contact_emails: list[str]
    discord_webhook_url: str | None
    advisor_name: str | None
    advisor_dept: str | None
    advisor_email: str | None
    advisor_ext: str | None
    suspended_until: date | None
    suspend_reason: str | None


class ClubProfileUpdate(BaseModel):
    intro: str | None = Field(None, max_length=2000)
    website_url: str | None = Field(None, max_length=500)
    # 聯絡 Email:至多 3 組、第 1 組必填(公告通知寄送對象;2026-07-16 第八輪)
    contact_emails: list[str] | None = Field(None, min_length=1, max_length=MAX_CONTACT_EMAILS)
    discord_webhook_url: str | None = Field(None, max_length=200)
    advisor_name: str | None = Field(None, max_length=50)
    advisor_dept: str | None = Field(None, max_length=50)
    advisor_email: str | None = Field(None, max_length=100)
    advisor_ext: str | None = Field(None, max_length=20)

    @field_validator("website_url")
    @classmethod
    def _valid_url(cls, v: str | None) -> str | None:
        if v and not v.startswith(("http://", "https://")):
            raise ValueError("網頁連結須為 http(s) 網址")
        return v or None

    @field_validator("discord_webhook_url")
    @classmethod
    def _valid_webhook(cls, v: str | None) -> str | None:
        if v and not _DISCORD_WEBHOOK_RE.match(v):
            raise ValueError("Discord Webhook URL 格式不正確")
        return v or None

    @field_validator("contact_emails")
    @classmethod
    def _valid_emails(cls, v: list[str] | None) -> list[str] | None:
        if v is None:
            return None
        cleaned = [e.strip() for e in v]
        if not cleaned[0]:
            raise ValueError("第 1 組聯絡 Email 為必填")
        cleaned = [e for e in cleaned if e]
        for addr in cleaned:
            if len(addr) > 100 or not _EMAIL_RE.match(addr):
                raise ValueError(f"聯絡 Email 格式不正確:{addr}")
        return cleaned


class MemberOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    student_id: str
    kind: MemberKind
    title: str | None
    semester: str
    updated_at: datetime


class MemberIn(BaseModel):
    name: str = Field(min_length=1, max_length=50)
    student_id: str = Field(min_length=1, max_length=20)
    kind: MemberKind
    title: str | None = Field(None, max_length=30)
    semester: str = Field(pattern=r"^\d{3}-[12]$")


class MemberUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=50)
    student_id: str | None = Field(None, min_length=1, max_length=20)
    kind: MemberKind | None = None
    title: str | None = Field(None, max_length=30)


class MemberImportRequest(BaseModel):
    """CSV 匯入(貼上文字;檔案上傳由前端讀成文字後同端點),整批寫入指定學期。

    格式:姓名,學號,身份[,職稱];身份=社員/幹部/負責人/副負責人
    (也接受顯示詞 社長/會長/副社長/副會長)
    """

    csv_text: str = Field(min_length=1, max_length=200_000)
    semester: str = Field(pattern=r"^\d{3}-[12]$")


class MemberImportResult(BaseModel):
    created: int
    updated: int
    errors: list[str]
