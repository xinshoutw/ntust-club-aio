import uuid
from datetime import date, datetime, time
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models.enums import ActivityStatus, ActivityType


class BudgetItemIn(BaseModel):
    category: str = Field(min_length=1, max_length=30)
    description: str = Field("", max_length=200)
    self_fund: int = Field(0, ge=0, le=10_000_000)
    requested_subsidy: int = Field(0, ge=0, le=10_000_000)


class BudgetItemOut(BudgetItemIn):
    model_config = ConfigDict(from_attributes=True)

    id: int
    approved_subsidy: int | None


class ActivityIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    type: ActivityType
    is_large: bool = False
    date: date
    start_time: time
    end_time: time
    location: str = Field(min_length=1, max_length=100)
    content: str = Field("", max_length=150)
    participants_in: int = Field(ge=0, le=100_000)
    participants_out: int = Field(ge=0, le=100_000)
    staff_text: str = Field("", max_length=2000)
    budget_items: list[BudgetItemIn] = Field(default_factory=list, max_length=50)

    @model_validator(mode="after")
    def _check(self):
        if self.end_time <= self.start_time:
            raise ValueError("結束時間必須晚於開始時間")
        if self.is_large and self.type != ActivityType.EVENT:
            raise ValueError("僅類型為「活動」可申請大型活動")
        return self


class FileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    original_name: str
    size: int
    mime: str


class ReflectionIn(BaseModel):
    student_name: str = Field(min_length=1, max_length=50)
    dept: str = Field(min_length=1, max_length=50)
    body: str = Field(min_length=1, max_length=5000)


class ReflectionOut(ReflectionIn):
    model_config = ConfigDict(from_attributes=True)

    id: int


class CloseSubmitIn(BaseModel):
    """結案成果調查:除 video_url 外全必填;心得 ≥3 筆。"""

    member_count: int = Field(ge=0, le=100_000)
    non_member_count: int = Field(ge=0, le=100_000)
    actual_start: time
    actual_end: time
    actual_location: str = Field(min_length=1, max_length=100)
    highlights: str = Field(min_length=1, max_length=2000)
    goals: str = Field(min_length=1, max_length=2000)
    others: str = Field(min_length=1, max_length=2000)
    review_meeting: bool
    review_date: date | None = None
    video_url: str | None = Field(None, max_length=500)
    expense: int = Field(ge=0, le=100_000_000)
    reflections: list[ReflectionIn] = Field(min_length=3, max_length=100)

    @field_validator("video_url")
    @classmethod
    def _valid_video(cls, v: str | None) -> str | None:
        if v and not v.startswith(("http://", "https://")):
            raise ValueError("影片連結須為 http(s) 網址")
        return v or None

    @model_validator(mode="after")
    def _check(self):
        if self.actual_end <= self.actual_start:
            raise ValueError("實際結束時間必須晚於開始時間")
        if self.review_meeting and self.review_date is None:
            raise ValueError("有召開檢討會時必須填寫日期")
        return self


class ReportOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    member_count: int
    non_member_count: int
    actual_start: time
    actual_end: time
    actual_location: str
    highlights: str
    goals: str
    others: str
    review_meeting: bool
    review_date: date | None
    video_url: str | None
    expense: int
    submitted_at: datetime
    reflections: list[ReflectionOut]


class ApprovalOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    stage: str
    decision: str
    reason: str | None
    created_at: datetime


class ActivityOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    type: ActivityType
    is_large: bool
    is_large_approved: bool | None
    date: date
    start_time: time | None
    end_time: time | None
    location: str
    content: str
    participants_in: int
    participants_out: int
    staff_text: str
    fund_source: str | None
    school_approved: int | None
    status: ActivityStatus
    close_unlocked: bool
    created_at: datetime
    # 推導欄位(服務層填)
    self_fund_total: int = 0
    requested_total: int = 0
    approved_total: int | None = None
    semester: str = ""
    close_locked: bool = False
    can_close: bool = False
    has_close_draft: bool = False


class ActivityDetailOut(ActivityOut):
    budget_items: list[BudgetItemOut] = []
    close_draft: dict[str, Any] | None = None
    report: ReportOut | None = None
    photos: list[FileOut] = []
    attachments: list[FileOut] = []
    approvals: list[ApprovalOut] = []


class CloseDraftIn(BaseModel):
    data: dict[str, Any]

    @field_validator("data")
    @classmethod
    def _size_cap(cls, v: dict[str, Any]) -> dict[str, Any]:
        import json

        if len(json.dumps(v, ensure_ascii=False)) > 50_000:
            raise ValueError("草稿內容過大")
        return v
