"""器材主檔維護 schema(行政端 CRUD;2026-07-17)。

點交方式以 needs_serial 表達:False=一般、True=依序點交(移除類別後為唯一分類)。
"""

from pydantic import BaseModel, ConfigDict, Field, field_validator


class EquipmentMasterOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    total_qty: int
    needs_serial: bool
    is_active: bool


class EquipmentIn(BaseModel):
    name: str = Field(min_length=1, max_length=50)
    total_qty: int = Field(ge=0, le=100_000)
    needs_serial: bool = False

    @field_validator("name")
    @classmethod
    def _clean_name(cls, v: str) -> str:
        v = " ".join(v.split())
        if not v:
            raise ValueError("器材名稱不得為空白")
        return v


class EquipmentUpdateIn(BaseModel):
    """部分更新:只改有帶的欄位(數量、名稱、點交方式、啟用)。"""

    name: str | None = Field(None, min_length=1, max_length=50)
    total_qty: int | None = Field(None, ge=0, le=100_000)
    needs_serial: bool | None = None
    is_active: bool | None = None

    @field_validator("name")
    @classmethod
    def _clean_name(cls, v: str | None) -> str | None:
        if v is None:
            return None
        v = " ".join(v.split())
        if not v:
            raise ValueError("器材名稱不得為空白")
        return v
