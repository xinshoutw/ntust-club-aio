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
    # 社團性質:二級選單(ClubCascader)的第一層資料夾。停社舊社可能為 null → 「未分類」
    attribute: str | None
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
    needs_serial: bool = False  # 依序點交:點交畫面提醒現場核對序號(序號不入系統)
    qty: int
    start_date: dt.date
    end_date: dt.date
    purpose: str
    phone: str | None = None  # 申請時填的聯絡人電話
    status: LoanStatus
    borrower_name: str | None = None  # 收件人(借出點交時登記)
    checkout_by_name: str | None = None  # 出借人(辦理借出點交的工讀生;未點交為 None)
    overdue: bool = False  # 推導:結束日之隔天上班日 10:30 未歸還
    overdue_deadline: dt.datetime | None = None  # 應歸還時限(台北時區;推導不儲存)
    # 上次寄出歸還提醒的時間:排程每 3 個上班日自動寄一次,人工按之前先看這個
    last_reminded_at: dt.datetime | None = None


class CheckoutIn(BaseModel):
    """借出點交。器材序號不由系統記錄,見 docs/decisions.md ISS-55b。"""

    borrower_name: str = Field(min_length=1, max_length=50)

    _borrower = field_validator("borrower_name")(_strip_required)


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
