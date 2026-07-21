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


# ---------------------------------------------------------------------------
# 評審端(/viewer;契約與前端平行開發,欄位名不可變動)
# ---------------------------------------------------------------------------


class ViewerRubricItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    item_key: str
    name: str
    max_score: float
    help: str
    group_label: str | None
    group_weight: float | None
    sort: int


class ViewerClubStateOut(BaseModel):
    club_id: int
    club_name: str
    attribute: str | None
    scored: bool  # 已送出(ReviewScore.submitted_at 非 NULL)
    total: float | None  # 細項分數合計 + presentation_score;未送出為 None
    submitted_at: datetime | None


class ViewerAssignmentOut(BaseModel):
    award_id: str
    award_name: str
    has_presentation: bool
    group_id: int
    group_name: str
    year: int
    items: list[ViewerRubricItemOut]  # 僅非行政資料項(委員人工評分細項)
    clubs: list[ViewerClubStateOut]


class ViewerClubOut(BaseModel):
    id: int
    name: str
    attribute: str | None
    kind: str


class ViewerUploadOut(BaseModel):
    id: uuid.UUID  # files.id(下載走 GET /files/{id})
    name: str
    size: int


class ViewerScoreItemOut(BaseModel):
    score: float
    comment: str


class ViewerScoreOut(BaseModel):
    items: dict[int, ViewerScoreItemOut]  # key=rubric_item_id
    presentation_score: int | None
    submitted_at: datetime | None


class ViewerAwardClubOut(BaseModel):
    club: ViewerClubOut
    items: list[ViewerRubricItemOut]
    uploads: dict[int, list[ViewerUploadOut]]  # key=rubric_item_id
    score: ViewerScoreOut | None


class ViewerScoreItemIn(BaseModel):
    rubric_item_id: int
    score: float
    comment: str = ""


class ViewerScoreIn(BaseModel):
    items: list[ViewerScoreItemIn]
    presentation_score: int | None = None


class ViewerDoneOut(BaseModel):
    award_id: str
    award_name: str
    club_id: int
    club_name: str
    total: float
    submitted_at: datetime
