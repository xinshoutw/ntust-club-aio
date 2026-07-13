from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.enums import SignupKind


class SignupItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    year: int
    name: str
    description: str
    is_open: bool
    deadline: date | None
    event_date: date | None
    time_text: str | None
    place: str | None
    audience: str | None
    allow_multiple: bool
    max_participants: int | None
    fields: list[dict[str, Any]]
    kind: SignupKind
    session_based: bool
    requires_confirmation: bool
    is_eval: bool
    my_status: Literal["none", "draft", "signed"] = "none"


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
