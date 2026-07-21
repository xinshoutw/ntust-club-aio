import re
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models.enums import BookingStatus, LoanStatus
from app.services.booking_service import MAX_FIXED_SLOTS, PERIODS


def _validate_periods(periods: list[str]) -> list[str]:
    if not periods:
        raise ValueError("至少選擇一個節次")
    invalid = [p for p in periods if p not in PERIODS]
    if invalid:
        raise ValueError(f"無效節次:{','.join(invalid)}")
    if len(set(periods)) != len(periods):
        raise ValueError("節次重複")
    return sorted(periods, key=PERIODS.index)


class VenueOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    capacity: int | None
    category: str
    allow_fixed: bool
    allow_temp: bool


class EquipmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    total_qty: int
    max_lease_count: int | None = None  # 單次可借上限;NULL=不限(2026-07-21)
    needs_serial: bool  # False=一般、True=依序點交(2026-07-17 移除類別後為唯一分類)
    available: int = 0  # 推導(帶 activity_id 查詢時=該活動借用區間內的可借數)


class RoomSlotIn(BaseModel):
    weekday: int = Field(ge=1, le=7)  # 1=週一 … 7=週日
    period: str

    @field_validator("period")
    @classmethod
    def _period(cls, v: str) -> str:
        if v not in PERIODS:
            raise ValueError(f"無效節次:{v}")
        return v


class RoomBookingIn(BaseModel):
    venue_id: int
    purpose: str = Field(min_length=1, max_length=200)  # 用途必填(2026-07-15)
    slots: list[RoomSlotIn] = Field(min_length=1, max_length=MAX_FIXED_SLOTS)

    @field_validator("slots")
    @classmethod
    def _unique(cls, v: list[RoomSlotIn]) -> list[RoomSlotIn]:
        seen = {(s.weekday, s.period) for s in v}
        if len(seen) != len(v):
            raise ValueError("時段重複")
        return v


class RoomSlotOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    weekday: int
    period: str


class RoomBookingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    venue_id: int
    venue_name: str = ""
    purpose: str
    start_date: date  # 目標學期起訖(前端取消鈕依此判斷是否已開始)
    end_date: date
    status: BookingStatus
    created_at: datetime
    slots: list[RoomSlotOut] = []


class FixedWindowOut(BaseModel):
    """固定借用開放窗狀態(未開放時前端側欄反灰移至「其他」)。

    2026-07-16 第八輪:改日期區間(系統設定 RangePicker),取代開放月份+手動加開。
    """

    open: bool
    open_from: date | None
    open_until: date | None


# 聯絡電話僅允許 數字與 - ( ) * #(2026-07-21 需求方)
_PHONE_RE = re.compile(r"^[0-9\-()*#]+$")


def _validate_phone(v: str | None) -> str | None:
    if v is None:
        return None
    v = v.strip()
    if v and not _PHONE_RE.match(v):
        raise ValueError("聯絡電話僅能輸入數字與 - ( ) * #")
    return v or None


def _validate_phone_required(v: str) -> str:
    out = _validate_phone(v)
    if not out:
        raise ValueError("請輸入聯絡電話")
    return out


class VenueBookingIn(BaseModel):
    venue_id: int
    activity_id: int  # 借用活動(限審核通過;2026-07-15 第六輪必選)
    date: date
    periods: list[str] = Field(min_length=1, max_length=14)
    purpose: str = Field(min_length=1, max_length=200)  # 用途必填(2026-07-15)
    phone: str = Field(min_length=1, max_length=30)  # 聯絡電話必填(2026-07-21 需求方)

    _phone = field_validator("phone")(_validate_phone_required)

    @field_validator("periods")
    @classmethod
    def _periods(cls, v: list[str]) -> list[str]:
        return _validate_periods(v)


class VenueBookingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    venue_id: int
    venue_name: str = ""
    activity_id: int | None
    activity_name: str | None = None
    date: date
    periods: list[str]
    purpose: str
    phone: str | None = None
    status: BookingStatus
    created_at: datetime


class EquipmentLoanIn(BaseModel):
    """借用區間不再自選:由所綁定審核通過活動的起訖 ± 工作天緩衝推導(2026-07-15)。"""

    equipment_id: int
    activity_id: int
    qty: int = Field(ge=1, le=1000)
    purpose: str = Field(min_length=1, max_length=200)
    phone: str = Field(min_length=1, max_length=30)  # 聯絡電話必填(2026-07-21 需求方)

    _phone = field_validator("phone")(_validate_phone_required)


class EquipmentLoanOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    equipment_id: int
    equipment_name: str = ""
    activity_id: int | None  # NULL=舊系統斷鏈或行政手動借用
    activity_name: str | None = None
    qty: int
    start_date: date
    end_date: date
    purpose: str
    status: LoanStatus
    serials: list[str] | None
    borrower_name: str | None  # 借用人(借出點交時登記)
    returner_name: str | None  # 歸還人(歸還點交時登記)
    checkout_at: datetime | None
    checkin_at: datetime | None
    checkin_note: str | None
    created_at: datetime
    overdue: bool = False  # 推導


# ---- 行政手動借用 / 場地不開放規則(2026-07-21 需求方拍板) ----


class ManualVenueBookingIn(BaseModel):
    """最高權限直接借用臨時場地(club NULL=行政,直接核准)。"""

    venue_id: int
    date: date
    periods: list[str] = Field(min_length=1, max_length=14)
    purpose: str = Field(min_length=1, max_length=200)
    phone: str | None = Field(None, max_length=30)

    _phone = field_validator("phone")(_validate_phone)

    @field_validator("periods")
    @classmethod
    def _periods(cls, v: list[str]) -> list[str]:
        return _validate_periods(v)


class ManualEquipmentLoanIn(BaseModel):
    """最高權限直接借用器材(club NULL=行政,直接核准;區間自填)。"""

    equipment_id: int
    qty: int = Field(ge=1, le=1000)
    start_date: date
    end_date: date
    purpose: str = Field(min_length=1, max_length=200)
    phone: str | None = Field(None, max_length=30)

    @model_validator(mode="after")
    def _range(self) -> ManualEquipmentLoanIn:
        if self.end_date < self.start_date:
            raise ValueError("結束日不得早於開始日")
        return self


class VenueBlockRuleIn(BaseModel):
    """場地不開放規則:區間(單日=同日)+ 星期限定(NULL=每天)+ 節次子集。"""

    venue_id: int
    start_date: date
    end_date: date
    weekdays: list[int] | None = Field(None, min_length=1, max_length=7)
    periods: list[str] = Field(min_length=1, max_length=14)
    reason: str = Field(min_length=1, max_length=200)

    @field_validator("periods")
    @classmethod
    def _periods(cls, v: list[str]) -> list[str]:
        return _validate_periods(v)

    @field_validator("weekdays")
    @classmethod
    def _weekdays(cls, v: list[int] | None) -> list[int] | None:
        if v is None:
            return None
        cleaned = sorted(set(v))
        if any(d < 1 or d > 7 for d in cleaned):
            raise ValueError("星期須為 1(一)–7(日)")
        return cleaned

    @model_validator(mode="after")
    def _range(self) -> VenueBlockRuleIn:
        if self.end_date < self.start_date:
            raise ValueError("結束日不得早於開始日")
        return self


class VenueBlockRuleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    venue_id: int
    venue_name: str = ""
    start_date: date
    end_date: date
    weekdays: list[int] | None
    periods: list[str]
    reason: str
    created_at: datetime
