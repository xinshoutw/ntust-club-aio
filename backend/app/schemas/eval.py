import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict


class AdScoreOut(BaseModel):
    key: str
    auto: float
    max: float
    note: str
    final: float
    overridden: bool


class AwardProgressOut(BaseModel):
    id: str
    name: str
    kind: str
    has_presentation: bool
    is_weighted: bool
    filled: int  # 已有上傳的細項數
    total: int  # 細項總數(非行政資料項)


class EvalOverviewOut(BaseModel):
    year: int
    window_start: date
    window_end: date
    scores: list[AdScoreOut]
    total: float
    awards: list[AwardProgressOut]


class EvalFileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int  # eval_uploads.id
    file_id: uuid.UUID
    original_name: str = ""
    size: int = 0
    mime: str = ""
    created_at: datetime


class RubricItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    item_key: str
    name: str
    max_score: float
    help: str
    group_label: str | None
    group_weight: float | None
    is_admin_item: bool
    sort: int
    uploads: list[EvalFileOut] = []


class AwardDetailOut(BaseModel):
    id: str
    name: str
    kind: str
    has_presentation: bool
    is_weighted: bool
    year: int
    items: list[RubricItemOut]
