"""公告(2026-07-16 第八輪):管理端建立/列表 schema。"""

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models.enums import AnnouncementTarget, ClubAttribute

_VALID_ATTRS = {a.value for a in ClubAttribute}


class AnnouncementCreateIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    content: str = Field(min_length=1, max_length=20000)  # markdown 原文,後端僅存
    target_type: AnnouncementTarget = AnnouncementTarget.ALL
    attrs: list[str] = Field(default_factory=list, max_length=10)  # target=attr:性質可多選
    club_id: int | None = None  # target=club
    takeover: bool = False  # 蓋板(期限內社團每次登入全版顯示)
    takeover_until: date | None = None
    notify: bool = False  # 發布時寄送 Email + Discord 通知

    @field_validator("title")
    @classmethod
    def _clean_title(cls, v: str) -> str:
        # 摺疊換行/連續空白:標題會進 Email Subject,杜絕 header 注入疑慮
        v = " ".join(v.split())
        if not v:
            raise ValueError("不得為空白")
        return v

    @field_validator("content")
    @classmethod
    def _strip_content(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("不得為空白")
        return v

    @field_validator("attrs")
    @classmethod
    def _valid_attrs(cls, v: list[str]) -> list[str]:
        unknown = [a for a in v if a not in _VALID_ATTRS]
        if unknown:
            raise ValueError(f"未知的社團性質:{','.join(unknown)}")
        return list(dict.fromkeys(v))  # 去重保序

    @model_validator(mode="after")
    def _target_and_takeover(self):
        if self.target_type == AnnouncementTarget.ATTR and not self.attrs:
            raise ValueError("發布對象為「依社團性質」時,至少須選擇一個性質")
        if self.target_type == AnnouncementTarget.CLUB and self.club_id is None:
            raise ValueError("發布對象為「單一社團」時,必須選擇社團")
        if self.takeover and self.takeover_until is None:
            raise ValueError("勾選蓋板時,蓋板截止日期為必填")
        return self


class AdminAnnouncementOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    content: str
    target_type: AnnouncementTarget
    attrs: list[str] | None
    club_id: int | None
    club_name: str | None = None
    takeover_until: date | None
    notify: bool
    is_auto: bool
    created_at: datetime
