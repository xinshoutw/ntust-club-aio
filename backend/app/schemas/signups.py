from datetime import UTC, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.core.semesters import TAIPEI
from app.models.enums import SignupKind

FIELD_TYPES = ("text", "textarea", "radio", "checkbox", "select")
OPTION_TYPES = ("radio", "checkbox", "select")


def _aware(v: datetime | None) -> datetime | None:
    """無時區的輸入一律視為台北時間(前端 DatePicker 以本地時間送出)。"""
    if v is not None and v.tzinfo is None:
        return v.replace(tzinfo=TAIPEI)
    return v


class SignupItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: str
    is_open: bool
    kind: SignupKind
    event_at: datetime | None  # 活動時間(日期+時間)
    place: str | None
    signup_start: datetime  # 報名開始
    signup_end: datetime | None  # 報名截止
    max_participants: int  # 每社名額上限(必填 ≥1)
    fields: list[dict[str, Any]]  # 陣列順序即顯示順序
    session_based: bool
    requires_confirmation: bool  # 審核制:報名後待管理員確認
    is_eval: bool
    accepting: bool = False  # 推導:is_open 且 signup_start <= now <= signup_end
    my_status: Literal["none", "draft", "pending", "signed"] = "none"


class EntryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    answers: dict[str, Any]


class MySignupOut(BaseModel):
    confirmed: bool
    created_at: datetime
    entries: list[EntryOut]
    awards: list[str] = []


class SignupItemDetailOut(SignupItemOut):
    my_signup: MySignupOut | None = None
    my_draft: list[dict[str, Any]] | None = None


class ParticipantIn(BaseModel):
    answers: dict[str, Any] = Field(default_factory=dict)


class SignupSubmitIn(BaseModel):
    participants: list[ParticipantIn] = Field(min_length=1, max_length=500)
    awards: list[str] = Field(default_factory=list, max_length=5)  # 競賽報名勾選


class SignupDraftIn(BaseModel):
    participants: list[dict[str, Any]] = Field(default_factory=list, max_length=500)

    @field_validator("participants")
    @classmethod
    def _size_cap(cls, v: list[dict[str, Any]]) -> list[dict[str, Any]]:
        import json

        if len(json.dumps(v, ensure_ascii=False)) > 50_000:
            raise ValueError("草稿內容過大")
        return v


# ---- 管理端:報名活動建立與管理(2026-07-16 第八輪) ----


class SignupFieldIn(BaseModel):
    """資訊調查欄位定義;陣列順序即顯示順序(拖曳排序後整包送)。"""

    key: str | None = Field(None, max_length=40)  # 未帶時由後端依序補 f1、f2…
    label: str = Field(min_length=1, max_length=50)
    type: Literal["text", "textarea", "radio", "checkbox", "select"] = "text"
    required: bool = False
    options: list[str] = Field(default_factory=list, max_length=30)

    @field_validator("label")
    @classmethod
    def _strip_label(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("欄位名稱不得為空白")
        return v

    @field_validator("options")
    @classmethod
    def _clean_options(cls, v: list[str]) -> list[str]:
        cleaned = [o.strip() for o in v if o.strip()]
        if len(set(cleaned)) != len(cleaned):
            raise ValueError("選項重複")
        return cleaned

    @model_validator(mode="after")
    def _need_options(self):
        if self.type in OPTION_TYPES and not self.options:
            raise ValueError(f"「{self.label}」為選項型欄位,至少需一個選項")
        return self


class SignupItemCreateIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    kind: SignupKind = SignupKind.NORMAL
    place: str | None = Field(None, max_length=100)
    description: str = Field("", max_length=2000)  # 活動描述
    event_at: datetime  # 活動時間必填
    signup_start: datetime | None = None  # 未帶=現在(報名開始預設今天)
    signup_end: datetime  # 報名截止必填
    max_participants: int = Field(ge=1, le=500)  # 名額上限必填 ≥1
    requires_confirmation: bool = False  # 審核制
    is_eval: bool = False
    is_open: bool = True
    fields: list[SignupFieldIn] = Field(default_factory=list, max_length=30)

    _tz = field_validator("event_at", "signup_start", "signup_end")(_aware)

    @field_validator("name")
    @classmethod
    def _strip_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("活動名稱不得為空白")
        return v

    @model_validator(mode="after")
    def _window(self):
        start = self.signup_start or datetime.now(UTC)
        if self.signup_end <= start:
            raise ValueError("報名截止須晚於報名開始")
        return self


class AdminSignupItemOut(SignupItemOut):
    """管理端列表:各活動已報名社團數/人數、待確認數。"""

    clubs_count: int = 0
    people_count: int = 0
    pending_count: int = 0  # 審核制:待確認的報名社團數


class RegistrationOut(BaseModel):
    """單一報名活動的社團名單(管理彈窗)。"""

    club_id: int
    club_name: str
    count: int  # 報名人數
    confirmed: bool
    created_at: datetime
    attended_sessions: int = 0  # 已簽到場次數(場次制);非場次制 0/1
    entries: list[EntryOut] = []
