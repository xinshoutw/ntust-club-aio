import datetime as dt
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
    """申請表單。草稿允許部分填寫(至少一欄有內容);必填完整性由 submit 端點檢核。"""

    name: str = Field("", max_length=100)
    type: ActivityType = ActivityType.COURSE_MEETING  # 前端預設社課或會議
    is_large: bool = False
    # dt.date:欄位名 date 帶預設值後成為 class attribute,會遮蔽 datetime.date(lazy annotation)
    date: dt.date | None = None  # 開始日期
    end_date: dt.date | None = None  # 結束日期;未跨日可省略(= date)
    start_time: time | None = None
    end_time: time | None = None
    location: str = Field("", max_length=100)
    content: str = Field("", max_length=150)
    participants_in: int = Field(0, ge=0, le=100_000)
    participants_out: int = Field(0, ge=0, le=100_000)
    staff_text: str = Field("", max_length=2000)
    budget_items: list[BudgetItemIn] = Field(default_factory=list, max_length=50)

    @model_validator(mode="after")
    def _check(self):
        self.name = self.name.strip()
        self.location = self.location.strip()
        if self.end_date is None:
            self.end_date = self.date  # 未跨日 end_date=date
        # 填了的欄位仍須自洽;未填者留待 submit 檢核
        if self.date and self.end_date and self.end_date < self.date:
            raise ValueError("結束日期不得早於開始日期")
        if (
            self.date
            and self.end_date == self.date
            and self.start_time
            and self.end_time
            and self.end_time <= self.start_time
        ):
            raise ValueError("結束時間必須晚於開始時間")
        if self.is_large and self.type != ActivityType.EVENT:
            raise ValueError("僅類型為「活動」可申請大型活動")
        if not self._has_any():
            raise ValueError("請至少填寫一個欄位")
        return self

    def _has_any(self) -> bool:
        return bool(
            self.name
            or self.location
            or self.content.strip()
            or self.staff_text.strip()
            or self.date
            or self.start_time
            or self.end_time
            or self.participants_in
            or self.participants_out
            or self.budget_items
        )


class FileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    original_name: str
    size: int
    mime: str
    sha256: str  # 前端據此對「既有照片 vs 新選檔」做內容去重


class ReflectionIn(BaseModel):
    student_name: str = Field(min_length=1, max_length=50)
    dept: str = Field(min_length=1, max_length=50)
    body: str = Field(min_length=1, max_length=5000)


class ReflectionOut(ReflectionIn):
    model_config = ConfigDict(from_attributes=True)

    id: int


class CloseSubmitIn(BaseModel):
    """結案成果調查:除 video_url 外全必填;心得 ≥3 筆;檢討會議=是時四欄必填。"""

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
    review_attendees: int | None = Field(None, ge=0, le=100_000)
    review_topics: str | None = Field(None, max_length=2000)
    review_conclusion: str | None = Field(None, max_length=2000)
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
        # 實際時間先後不在此比較:跨日活動(如 18:00–翌日 10:00)是合法輸入,
        # 需要活動起訖日期才能判斷,由 submit_close 端點檢核(與 ActivityIn 同精神)
        if self.review_meeting:
            # 檢討會議獨立 section,日期/與會人數/討論事項/內容決議皆必填
            if self.review_date is None:
                raise ValueError("有召開檢討會時必須填寫檢討會日期")
            # 0 人不是「開過會」:前端 InputNumber min=1,直呼 API 也不放行
            if not self.review_attendees:
                raise ValueError("有召開檢討會時必須填寫與會人數")
            if not (self.review_topics or "").strip():
                raise ValueError("有召開檢討會時必須填寫討論事項")
            if not (self.review_conclusion or "").strip():
                raise ValueError("有召開檢討會時必須填寫內容決議")
        else:
            # 未開檢討會就不留殘值
            self.review_date = None
            self.review_attendees = None
            self.review_topics = None
            self.review_conclusion = None
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
    review_attendees: int | None
    review_topics: str | None
    review_conclusion: str | None
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
    club_id: int
    name: str
    type: ActivityType
    is_large: bool
    is_large_approved: bool | None
    date: date | None  # 草稿可部分填寫,僅 draft 可能為 None
    end_date: date | None
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
    close_deadline: date | None = None  # 結案期限=活動結束日+N 個月(推導不儲存)
    can_close: bool = False
    has_close_draft: bool = False
    club_name: str = ""  # 行政端填(社團端看自己,免帶)
    # 最近審核時間=該活動申請/結案簽核紀錄(approval_records)的 max(created_at);
    # 行政端列表/詳情填,無任何審核紀錄=None
    reviewed_at: datetime | None = None


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
