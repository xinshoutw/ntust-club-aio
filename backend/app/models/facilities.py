import datetime as dt
from typing import Any

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, db_enum
from app.models.enums import VenueCategory


class Venue(Base, TimestampMixin):
    """統一場地主檔:固定借用教室與臨時借用場地以旗標區分用途。"""

    __tablename__ = "venues"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(sa.Text, unique=True)
    capacity: Mapped[int | None] = mapped_column()
    category: Mapped[VenueCategory] = mapped_column(db_enum(VenueCategory, "venue_category"))
    allow_fixed: Mapped[bool] = mapped_column(default=False)
    allow_temp: Mapped[bool] = mapped_column(default=False)
    sort: Mapped[int] = mapped_column(default=0)
    is_active: Mapped[bool] = mapped_column(default=True)


class Equipment(Base, TimestampMixin):
    """器材主檔;可借數 = total_qty − 未歸還中數量(推導不儲存)。"""

    __tablename__ = "equipment"
    __table_args__ = (
        sa.CheckConstraint(
            "total_qty >= 0 AND (max_lease_count IS NULL OR max_lease_count >= 1)",
            name="qty_non_negative",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(sa.Text, unique=True)
    total_qty: Mapped[int] = mapped_column(default=0)
    # 單次可借上限(NULL=不限)
    max_lease_count: Mapped[int | None] = mapped_column()
    # 點交方式:False=一般、True=依序點交(需登記序號);器材的唯一分類欄
    needs_serial: Mapped[bool] = mapped_column(default=False)
    sort: Mapped[int] = mapped_column(default=0)
    is_active: Mapped[bool] = mapped_column(default=True)


class VenueBlockRule(Base, TimestampMixin):
    """場地不開放規則(2026-07-21 Rule Page):場況圖標示不開放、申請與核准時檢核。

    區間 start_date~end_date;weekdays(ISO 1–7)限定星期、NULL=每天;
    periods=不開放節次子集。刪除=硬刪(異動走 audit_logs)。
    """

    __tablename__ = "venue_block_rules"

    id: Mapped[int] = mapped_column(primary_key=True)
    venue_id: Mapped[int] = mapped_column(sa.ForeignKey("venues.id"), index=True)
    start_date: Mapped[dt.date] = mapped_column(sa.Date)
    end_date: Mapped[dt.date] = mapped_column(sa.Date)
    weekdays: Mapped[list[int] | None] = mapped_column(ARRAY(sa.SmallInteger()))
    periods: Mapped[list[str]] = mapped_column(ARRAY(sa.String(2)))
    reason: Mapped[str] = mapped_column(sa.Text)
    created_by: Mapped[int] = mapped_column(sa.ForeignKey("users.id"))


class Holiday(Base, TimestampMixin):
    """政府行事曆假日:器材逾期「隔天上班日 10:30」判定依據,每年由行政匯入。"""

    __tablename__ = "holidays"

    date: Mapped[dt.date] = mapped_column(sa.Date, primary_key=True)
    name: Mapped[str] = mapped_column(sa.Text)


class SystemSetting(Base, TimestampMixin):
    """會變/可能變的營運參數(報名窗、結案鎖定天數、學期規則、經費科目…)。"""

    __tablename__ = "system_settings"

    key: Mapped[str] = mapped_column(sa.Text, primary_key=True)
    value: Mapped[Any] = mapped_column(JSONB)
