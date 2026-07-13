from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.enums import BookingStatus, LoanStatus
from app.services.booking_service import PERIODS


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
    category: str
    total_qty: int
    needs_serial: bool
    available: int = 0  # 推導


class RoomSlotIn(BaseModel):
    date: date
    period: str

    @field_validator("period")
    @classmethod
    def _period(cls, v: str) -> str:
        if v not in PERIODS:
            raise ValueError(f"無效節次:{v}")
        return v


class RoomBookingIn(BaseModel):
    venue_id: int
    purpose: str = Field(min_length=1, max_length=200)
    slots: list[RoomSlotIn] = Field(min_length=1, max_length=100)

    @field_validator("slots")
    @classmethod
    def _unique(cls, v: list[RoomSlotIn]) -> list[RoomSlotIn]:
        seen = {(s.date, s.period) for s in v}
        if len(seen) != len(v):
            raise ValueError("時段重複")
        return v


class RoomSlotOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    date: date
    period: str


class RoomBookingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    venue_id: int
    venue_name: str = ""
    purpose: str
    status: BookingStatus
    created_at: datetime
    slots: list[RoomSlotOut] = []


class VenueBookingIn(BaseModel):
    venue_id: int
    date: date
    periods: list[str] = Field(min_length=1, max_length=14)
    purpose: str = Field(min_length=1, max_length=200)

    @field_validator("periods")
    @classmethod
    def _periods(cls, v: list[str]) -> list[str]:
        return _validate_periods(v)


class VenueBookingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    venue_id: int
    venue_name: str = ""
    date: date
    periods: list[str]
    purpose: str
    status: BookingStatus
    created_at: datetime


class EquipmentLoanIn(BaseModel):
    equipment_id: int
    qty: int = Field(ge=1, le=1000)
    start_date: date
    end_date: date
    purpose: str = Field(min_length=1, max_length=200)

    @field_validator("end_date")
    @classmethod
    def _order(cls, v: date, info) -> date:
        start = info.data.get("start_date")
        if start and v < start:
            raise ValueError("結束日不得早於開始日")
        return v


class EquipmentLoanOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    equipment_id: int
    equipment_name: str = ""
    qty: int
    start_date: date
    end_date: date
    purpose: str
    status: LoanStatus
    serials: list[str] | None
    checkout_at: datetime | None
    checkin_at: datetime | None
    checkin_note: str | None
    created_at: datetime
    overdue: bool = False  # 推導
