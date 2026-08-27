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
    kind: str  # 社團/學會(負責人顯示詞推導依據)
    en_name: str | None
    attribute: str | None  # 停社舊社團原性質不可考 → None
    intro: str
    website_url: str | None
    contact_emails: list[str]
    discord_webhook_url: str | None
    advisor_name: str | None  # 校內指導老師
    advisor_dept: str | None
    advisor_email: str | None
    advisor_phone: str | None
    advisor_out_name: str | None  # 校外指導老師
    advisor_out_dept: str | None
    advisor_out_email: str | None
    advisor_out_phone: str | None
    suspended_until: date | None
    suspend_reason: str | None


class ClubProfileUpdate(BaseModel):
    """社團自行維護的欄位。英文名稱不在此 —— 由學務處於行政端管理項目維護。"""

    # 簡介與網頁連結為必填(2026-08-27 需求方拍板):社團導覽頁要靠這兩欄
    intro: str | None = Field(None, max_length=2000)
    website_url: str | None = Field(None, max_length=500)
    # 聯絡 Email:至多 3 組、第 1 組必填(公告通知寄送對象)
    contact_emails: list[str] | None = Field(None, min_length=1, max_length=MAX_CONTACT_EMAILS)
    discord_webhook_url: str | None = Field(None, max_length=200)
    advisor_name: str | None = Field(None, max_length=50)
    advisor_dept: str | None = Field(None, max_length=50)
    advisor_email: str | None = Field(None, max_length=100)
    advisor_phone: str | None = Field(None, max_length=30)
    advisor_out_name: str | None = Field(None, max_length=50)
    advisor_out_dept: str | None = Field(None, max_length=50)
    advisor_out_email: str | None = Field(None, max_length=100)
    advisor_out_phone: str | None = Field(None, max_length=30)

    @field_validator("intro")
    @classmethod
    def _require_intro(cls, v: str | None) -> str | None:
        if not v or not v.strip():
            raise ValueError("請填寫社團簡介")
        return v.strip()

    @field_validator("website_url")
    @classmethod
    def _valid_url(cls, v: str | None) -> str | None:
        # 送 null 也是在清空 —— 驗證器只在欄位有帶時執行,沒帶的欄位本來就不會動到
        if not v or not (v := v.strip()):
            raise ValueError("請填寫社團網頁連結")
        if not v.startswith(("http://", "https://")):
            raise ValueError("網頁連結須為 http(s) 網址")
        return v

    @field_validator("discord_webhook_url")
    @classmethod
    def _valid_webhook(cls, v: str | None) -> str | None:
        if v and not _DISCORD_WEBHOOK_RE.match(v):
            raise ValueError("Discord Webhook URL 格式不正確")
        return v or None

    @field_validator("advisor_name")
    @classmethod
    def _require_advisor(cls, v: str | None) -> str | None:
        # 校內指導老師姓名是必填(畫面與 spec 皆然);帶了空值等於清掉它
        if v is not None and not v.strip():
            raise ValueError("校內指導老師姓名為必填")
        return v.strip() if v else v

    @field_validator("advisor_email", "advisor_out_email")
    @classmethod
    def _valid_advisor_email(cls, v: str | None) -> str | None:
        # 承辦人真的會拿這個欄位寄信,格式比照聯絡 Email
        v = (v or "").strip()
        if v and not _EMAIL_RE.match(v):
            raise ValueError(f"指導老師 Email 格式不正確:{v}")
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
    title: str | None  # 幹部必填,其他身份選填
    phone: str | None
    semester: str
    # 入社時間:遷移把舊系統的入社日期寫進 created_at,行內編輯只動 updated_at,
    # 這一欄是那份日期唯一的可見副本
    created_at: datetime
    updated_at: datetime


class MemberIn(BaseModel):
    name: str = Field(min_length=1, max_length=50)
    student_id: str = Field(min_length=1, max_length=20)
    kind: MemberKind
    title: str | None = Field(None, max_length=30)
    phone: str | None = Field(None, max_length=30)
    semester: str = Field(pattern=r"^\d{3}-[12]$")


class MemberUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=50)
    student_id: str | None = Field(None, min_length=1, max_length=20)
    kind: MemberKind | None = None
    title: str | None = Field(None, max_length=30)
    phone: str | None = Field(None, max_length=30)


class MemberImportRequest(BaseModel):
    """CSV 匯入(貼上文字;檔案上傳由前端讀成文字後同端點),整批寫入指定學期。

    格式:姓名,學號,身份[,職稱[,電話]];身份=社員/幹部/負責人/副負責人
    (也接受顯示詞 社長/會長/副社長/副會長)
    """

    csv_text: str = Field(min_length=1, max_length=200_000)
    semester: str = Field(pattern=r"^\d{3}-[12]$")


class MemberImportResult(BaseModel):
    created: int
    updated: int
    errors: list[str]
