"""系統設定(/admin/settings,僅 super;2026-07-16 第八輪)。

管理的鍵與 services/settings_service.DEFAULTS 對齊;PUT 為部分更新
(僅寫入有帶的鍵),值以 JSON 存 system_settings(日期一律 ISO 字串)。
"""

from datetime import date
from typing import Any

from pydantic import BaseModel, Field, field_validator, model_validator


class FixedBookingWindowIn(BaseModel):
    """固定場地借用受理期間(日期區間;兩者皆空=不開放)。"""

    open_from: date | None = None
    open_until: date | None = None

    @model_validator(mode="after")
    def _pair(self):
        if (self.open_from is None) != (self.open_until is None):
            raise ValueError("受理期間須同時填開始與結束日期,或同時留空")
        if self.open_from and self.open_until and self.open_from > self.open_until:
            raise ValueError("受理期間的結束日期不得早於開始日期")
        return self

    def to_json(self) -> dict[str, Any]:
        return {
            "open_from": self.open_from.isoformat() if self.open_from else None,
            "open_until": self.open_until.isoformat() if self.open_until else None,
        }


class EquipmentBufferIn(BaseModel):
    before: int = Field(ge=0, le=10)  # 活動前緩衝(工作天)
    after: int = Field(ge=0, le=10)  # 活動後緩衝(工作天)

    def to_json(self) -> dict[str, Any]:
        return {"before": self.before, "after": self.after}


class UploadLimitsIn(BaseModel):
    """各類型上傳上限(MB)。"""

    doc: int = Field(ge=1, le=1024)
    img: int = Field(ge=1, le=1024)
    zip: int = Field(ge=1, le=1024)
    video: int = Field(ge=1, le=1024)

    def to_json(self) -> dict[str, Any]:
        return {"doc": self.doc, "img": self.img, "zip": self.zip, "video": self.video}


class StorageLimitsIn(BaseModel):
    """儲存配額(GiB):系統總量改用實際磁碟空間,此處僅單一社團未歸檔檔案上限
    (2026-07-17 需求方:移除邏輯容量與保留空間)。"""

    per_club_gib: int = Field(ge=1, le=1024)

    def to_json(self) -> dict[str, Any]:
        return {"per_club_gib": self.per_club_gib}


class EvalWindowIn(BaseModel):
    """評鑑年度與採計區間。"""

    year: int = Field(ge=100, le=300)  # 民國年
    start: date
    end: date

    @model_validator(mode="after")
    def _order(self):
        if self.start >= self.end:
            raise ValueError("採計區間的結束日期須晚於開始日期")
        return self

    def to_json(self) -> dict[str, Any]:
        return {"year": self.year, "start": self.start.isoformat(), "end": self.end.isoformat()}


def _clean_items(v: list[str], label: str) -> list[str]:
    cleaned = []
    for item in v:
        item = item.strip()
        if not item:
            continue
        if len(item) > 50:
            raise ValueError(f"{label}的項目長度不得超過 50 字")
        if item not in cleaned:  # 去重保序
            cleaned.append(item)
    if not cleaned:
        raise ValueError(f"{label}至少需保留一項")
    return cleaned


class BudgetCategoryIn(BaseModel):
    """經費科目:名稱 + 選填提示(社團填申請時依所選科目顯示)。"""

    name: str = Field(min_length=1, max_length=50)
    hint: str = Field("", max_length=200)

    def to_json(self) -> dict[str, str]:
        return {"name": self.name.strip(), "hint": self.hint.strip()}


class SettingsUpdateIn(BaseModel):
    """PUT /admin/settings:部分更新,只寫有帶的鍵。"""

    fixed_booking_window: FixedBookingWindowIn | None = None
    equipment_workday_buffer: EquipmentBufferIn | None = None
    close_lock_months: int | None = Field(None, ge=1, le=6)
    upload_limits: UploadLimitsIn | None = None
    activity_attachment_total_mb: int | None = Field(None, ge=1, le=1024)
    maintenance_total_mb: int | None = Field(None, ge=1, le=1024)
    close_photo_total_mb: int | None = Field(None, ge=1, le=1024)
    storage_limits: StorageLimitsIn | None = None
    eval_window: EvalWindowIn | None = None
    violation_items: list[str] | None = Field(None, max_length=50)
    budget_categories: list[BudgetCategoryIn] | None = Field(None, max_length=50)

    @field_validator("violation_items")
    @classmethod
    def _viol(cls, v: list[str] | None) -> list[str] | None:
        return None if v is None else _clean_items(v, "違規項目目錄")

    @field_validator("budget_categories")
    @classmethod
    def _budget(cls, v: list[BudgetCategoryIn] | None) -> list[BudgetCategoryIn] | None:
        if v is None:
            return None
        seen: set[str] = set()
        out: list[BudgetCategoryIn] = []
        for c in v:
            name = c.name.strip()
            if name and name not in seen:  # 依名稱去重保序
                seen.add(name)
                out.append(c)
        if not out:
            raise ValueError("經費科目至少需保留一項")
        return out
