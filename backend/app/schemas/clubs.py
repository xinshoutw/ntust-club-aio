import re
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.enums import MemberKind

_DISCORD_WEBHOOK_RE = re.compile(r"^https://discord\.com/api/webhooks/\d+/[\w-]+$")


class ClubProfileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    attribute: str
    intro: str
    website_url: str | None
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


class MemberOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    student_id: str
    kind: MemberKind
    title: str | None
    updated_at: datetime


class MemberIn(BaseModel):
    name: str = Field(min_length=1, max_length=50)
    student_id: str = Field(min_length=1, max_length=20)
    kind: MemberKind
    title: str | None = Field(None, max_length=30)


class MemberUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=50)
    student_id: str | None = Field(None, min_length=1, max_length=20)
    kind: MemberKind | None = None
    title: str | None = Field(None, max_length=30)


class MemberImportRequest(BaseModel):
    """CSV 匯入(貼上文字;檔案上傳由前端讀成文字後同端點)。

    格式:姓名,學號,身份[,職稱];身份=社員/幹部/社長/會長/副社長/副會長
    """

    csv_text: str = Field(min_length=1, max_length=200_000)


class MemberImportResult(BaseModel):
    created: int
    updated: int
    errors: list[str]
