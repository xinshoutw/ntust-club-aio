import re
import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.semesters import SEMESTER_LABEL
from app.models.enums import MemberKind, RecruitStatus

_DISCORD_WEBHOOK_RE = re.compile(r"^https://discord\.com/api/webhooks/\d+/[\w-]+$")
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

MAX_CONTACT_EMAILS = 3
MAX_TAGS = 3

# 標籤主檔:社團只能從這裡挑,至多 3 個。自由填寫會讓導覽頁的篩選長歪 ——
# 同一件事會出現「程式」「寫程式」「Coding」三種寫法,篩選器列不完也對不起來。
# 前端 `api/clubProfile.ts` 的 CLUB_TAGS 是第二份,改動須同步
CLUB_TAGS: tuple[str, ...] = (
    "系學會", "技術", "程式", "表演", "音樂", "美術", "遊戲",
    "聯誼", "服務", "喝酒", "運動", "武術", "戶外", "飲食",
)

# Instagram 帳號 ID(不含網址):IG 自己的規則是英數、底線與句點,最長 30。
# 搭配 fullmatch —— `$` 會放行結尾換行,而這一欄遲早會進信件或 CSV
_INSTAGRAM_RE = re.compile(r"[A-Za-z0-9._]{1,30}")


def _http_url(v: str, label: str) -> str:
    if not v.startswith(("http://", "https://")):
        raise ValueError(f"{label}須為 http(s) 網址")
    return v


class ClubPublicOut(BaseModel):
    """社團端表單與行政端唯讀區共用的「公開範圍」投影。

    不從 `ClubProfileOut` 挑減 —— 那樣的話以後往 profile 加一欄內部欄位,它會自己
    跟著跑出來。**真正對外曝光的形狀以 `schemas/public.py` 為準**(那邊是另一份逐欄
    白名單),這裡加欄位不等於公開端點就會送出去。
    """

    model_config = ConfigDict(from_attributes=True)

    tagline: str | None
    tags: list[str]
    recruit_status: RecruitStatus | None
    public_email: str | None
    instagram: str | None  # 帳號 ID,不含網址前綴
    office_location: str | None
    regular_schedule: str | None
    join_info: str | None
    signup_url: str | None
    avatar_file_id: uuid.UUID | None
    banner_file_id: uuid.UUID | None


class ClubProfileOut(ClubPublicOut):
    """社團看自己的全部欄位 = 公開欄位 + 對內欄位。

    `public_visible` **唯讀**帶給社團:開關仍只在行政端,但社團要知道自己的頁面
    現在公不公開 —— 否則按「預覽社團頁」只會撞上 404,看起來像系統壞了。
    """

    id: int
    public_visible: bool
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
    advisor_out_name: str | None  # 校外指導老師
    advisor_out_dept: str | None
    advisor_out_email: str | None
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
    advisor_out_name: str | None = Field(None, max_length=50)
    advisor_out_dept: str | None = Field(None, max_length=50)
    advisor_out_email: str | None = Field(None, max_length=100)

    # --- 對外公開(社團導覽頁);形象圖不在此,走自己的上傳端點 ---
    # 這一組每一欄都可以是空的:空白就是那一段不出現在公開頁。因此顯式 null
    # 一律當成「清空」而非錯誤 —— 但 tags 落在 NOT NULL 欄位上,不能就這樣寫進去,
    # 由 `_clean_tags` 把 null 收成空陣列(見 ISS-105)
    tagline: str | None = Field(None, max_length=40)
    # 上限不寫在 Field 上:欄位層的 max_length 會搶在 _clean_tags 之前 422,
    # 那正是下面那段註解要避免的事。裁切由驗證器負責
    tags: list[str] | None = None
    recruit_status: RecruitStatus | None = None
    public_email: str | None = Field(None, max_length=100)
    # 上限放寬到能容下整串貼上來的網址;真正的 30 字限制由驗證器在剝掉前綴之後才套
    instagram: str | None = Field(None, max_length=200)
    office_location: str | None = Field(None, max_length=50)
    regular_schedule: str | None = Field(None, max_length=200)
    join_info: str | None = Field(None, max_length=500)
    signup_url: str | None = Field(None, max_length=500)

    @field_validator("tagline", "office_location", "regular_schedule", "join_info")
    @classmethod
    def _blank_to_none(cls, v: str | None) -> str | None:
        # 空字串與 NULL 是同一件事(「沒填」),同一欄不要有兩種「沒填」
        return (v or "").strip() or None

    @field_validator("tags")
    @classmethod
    def _clean_tags(cls, v: list[str] | None) -> list[str]:
        # NOT NULL 欄位:顯式 null 收成空陣列,不讓它撞 IntegrityError
        cleaned: list[str] = []
        for tag in v or []:
            tag = tag.strip()
            if not tag or tag in cleaned:
                continue
            # **丟掉而不是 raise**:主檔以後改動(或庫裡本來就有舊值)的話,
            # 前端每次 PATCH 都原樣送回整個 tags,而 TagPicker 只畫得出主檔裡的按鈕 ——
            # 那個社團從此連改一句 tagline 都會吃 422,而畫面上看不到也刪不掉那個標籤
            if tag in CLUB_TAGS:
                cleaned.append(tag)
        return cleaned[:MAX_TAGS]

    @field_validator("instagram")
    @classmethod
    def _clean_instagram(cls, v: str | None) -> str | None:
        """只存帳號 ID:貼整串網址、省略 scheme、帶 @ 或帶 `?igsh=` 都收得下來。

        取最後一個 `/` 之後那一段就好 —— 不必列舉 `m.` / `instagr.am` 這些子網域,
        列舉漏一個就是一個 422。**剝不出合法帳號時丟掉而不是 raise**,理由同
        `_clean_tags`:前端每次 PATCH 都原樣送回這一欄,庫裡留著一個舊格式的值,
        那個社團從此連改一句 tagline 都送不出去,而畫面上那一欄看起來完全正常。
        """
        v = re.split(r"[?#]", (v or "").strip(), maxsplit=1)[0]
        v = v.rstrip("/").rpartition("/")[2].strip("@ ")
        return v if _INSTAGRAM_RE.fullmatch(v) else None

    @field_validator("public_email")
    @classmethod
    def _valid_public_email(cls, v: str | None) -> str | None:
        v = (v or "").strip()
        if v and not _EMAIL_RE.match(v):
            raise ValueError(f"對外聯絡信箱格式不正確:{v}")
        return v or None

    @field_validator("signup_url")
    @classmethod
    def _valid_signup_url(cls, v: str | None) -> str | None:
        v = (v or "").strip()
        return _http_url(v, "報名連結") if v else None

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
    semester: str = Field(pattern=SEMESTER_LABEL)


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
    semester: str = Field(pattern=SEMESTER_LABEL)


class MemberImportResult(BaseModel):
    created: int
    updated: int
    errors: list[str]
