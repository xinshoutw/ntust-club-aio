from pydantic import BaseModel, Field, field_validator

from app.services.scoring import AD_KEYS


class BudgetApprovalIn(BaseModel):
    item_id: int
    approved_subsidy: int = Field(ge=0, le=10_000_000)


class ApproveActivityIn(BaseModel):
    """第一關(輔導老師)認定經費來源與逐項核定;其後關卡空 body 即可。"""

    fund_source: str | None = Field(None, max_length=100)
    budget: list[BudgetApprovalIn] = Field(default_factory=list, max_length=50)
    is_large_approved: bool | None = None  # 大型活動認可(僅 is_large 申請有效)
    school_approved: int | None = Field(None, ge=0, le=100_000_000)


class RejectIn(BaseModel):
    reason: str = Field(min_length=1, max_length=500)


class ScoreOverrideIn(BaseModel):
    key: str
    score: float = Field(ge=-10, le=30)
    reason: str = Field(min_length=1, max_length=500)

    @field_validator("key")
    @classmethod
    def _key(cls, v: str) -> str:
        if v not in AD_KEYS:
            raise ValueError("無效的行政分項目")
        return v


class ScoreRevertIn(BaseModel):
    key: str
    reason: str = Field(min_length=1, max_length=500)

    @field_validator("key")
    @classmethod
    def _key(cls, v: str) -> str:
        if v not in AD_KEYS:
            raise ValueError("無效的行政分項目")
        return v


class MeritIn(BaseModel):
    score: int = Field(ge=0, le=5)
    reason: str = Field(min_length=1, max_length=500)
