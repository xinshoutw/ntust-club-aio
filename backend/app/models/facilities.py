from datetime import date
from typing import Any

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, db_enum
from app.models.enums import EquipmentCategory, VenueCategory


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

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(sa.Text, unique=True)
    category: Mapped[EquipmentCategory] = mapped_column(
        db_enum(EquipmentCategory, "equipment_category")
    )
    total_qty: Mapped[int] = mapped_column(default=0)
    needs_serial: Mapped[bool] = mapped_column(default=False)  # 點交需登記序號
    sort: Mapped[int] = mapped_column(default=0)
    is_active: Mapped[bool] = mapped_column(default=True)


class Holiday(Base, TimestampMixin):
    """政府行事曆假日:器材逾期「隔天上班日 10:30」判定依據,每年由行政匯入。"""

    __tablename__ = "holidays"

    date: Mapped[date] = mapped_column(sa.Date, primary_key=True)
    name: Mapped[str] = mapped_column(sa.Text)


class SystemSetting(Base, TimestampMixin):
    """會變/可能變的營運參數(報名窗、結案鎖定月數、學期規則、經費科目…)。"""

    __tablename__ = "system_settings"

    key: Mapped[str] = mapped_column(sa.Text, primary_key=True)
    value: Mapped[Any] = mapped_column(JSONB)
