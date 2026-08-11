"""工讀生端 schemas(/staff/*):違規開立、器材借出/歸還點交、逾期追蹤。

違規列表/開立回應沿用 schemas.admin.AdminViolationOut(兩端同形,前端共用轉換)。
"""

import datetime as dt

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.enums import LoanStatus


def _strip_required(v: str) -> str:
    v = v.strip()
    if not v:
        raise ValueError("不得為空白")
    return v


class StaffClubOut(BaseModel):
    """違規開立下拉:全部社團(含停用,歷史違規對象可能已停社)。"""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    is_active: bool


class ViolationFileIn(BaseModel):
    """開立違規勸導:items 須為 system_settings violation_items 目錄子集(端點檢核)。"""

    club_id: int
    occurred_on: dt.date  # 不可未來(端點以台北時區今天檢核)
    location: str = Field(min_length=1, max_length=100)
    items: list[str] = Field(min_length=1, max_length=50)
    other: str | None = Field(None, max_length=500)

    _location = field_validator("location")(_strip_required)

    @field_validator("items")
    @classmethod
    def _items(cls, v: list[str]) -> list[str]:
        cleaned = [s.strip() for s in v if s.strip()]
        if not cleaned:
            raise ValueError("請至少勾選一項違規項目")
        return list(dict.fromkeys(cleaned))  # 去重保序

    @field_validator("other")
    @classmethod
    def _other(cls, v: str | None) -> str | None:
        if v is None:
            return None
        return v.strip() or None


class StaffEquipmentLoanOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    club_name: str | None = None  # None=行政手動借用(前端顯示「學務處」)
    equipment_name: str = ""
    needs_serial: bool = False  # 依序點交:借出時逐件登記序號
    qty: int
    start_date: dt.date
    end_date: dt.date
    purpose: str
    phone: str | None = None  # 申請時填的聯絡人電話
    status: LoanStatus
    borrower_name: str | None = None  # 借出點交時登記
    # 借出時逐件登記的序號(歸還點交照這份核對);非依序點交的器材為 NULL
    serials: list[str] | None = None
    overdue: bool = False  # 推導:結束日之隔天上班日 10:30 未歸還
    overdue_deadline: dt.datetime | None = None  # 應歸還時限(台北時區;推導不儲存)


class CheckoutIn(BaseModel):
    """借出點交:依序點交器材須帶 serials(len==qty、逐件非空;端點檢核)。"""

    borrower_name: str = Field(min_length=1, max_length=50)
    serials: list[str] = Field(default_factory=list, max_length=200)

    _borrower = field_validator("borrower_name")(_strip_required)

    @field_validator("serials")
    @classmethod
    def _serials(cls, v: list[str]) -> list[str]:
        if any(len(s) > 50 for s in v):
            raise ValueError("序號長度不得超過 50 字")
        return v


class CheckinIn(BaseModel):
    returner_name: str = Field(min_length=1, max_length=50)
    note: str | None = Field(None, max_length=200)

    _returner = field_validator("returner_name")(_strip_required)

    @field_validator("note")
    @classmethod
    def _note(cls, v: str | None) -> str | None:
        if v is None:
            return None
        return v.strip() or None
