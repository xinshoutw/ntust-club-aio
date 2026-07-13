from pydantic import BaseModel, Field, field_validator, model_validator

from app.services.scoring import AD_KEYS, AD_MAX


def _validate_ad_key(v: str) -> str:
    if v not in AD_KEYS:
        raise ValueError("無效的行政分項目")
    return v


def _strip_reason(v: str) -> str:
    v = v.strip()
    if not v:
        raise ValueError("原因不得為空白")
    return v


class BudgetApprovalIn(BaseModel):
    item_id: int
    approved_subsidy: int = Field(ge=0, le=10_000_000)


class ApproveActivityIn(BaseModel):
    """第一關(輔導老師)認定經費來源與逐項核定;其後關卡空 body 即可。

    school_approved 由後端依逐項核定加總,不接受外部值。
    """

    fund_source: str | None = Field(None, max_length=100)
    budget: list[BudgetApprovalIn] = Field(default_factory=list, max_length=50)
    is_large_approved: bool | None = None  # 大型活動認可(僅 is_large 申請有效)


class RejectIn(BaseModel):
    reason: str = Field(min_length=1, max_length=500)

    _strip = field_validator("reason")(_strip_reason)


class ScoreOverrideIn(BaseModel):
    key: str
    score: float
    reason: str = Field(min_length=1, max_length=500)

    _key = field_validator("key")(_validate_ad_key)
    _strip = field_validator("reason")(_strip_reason)

    @model_validator(mode="after")
    def _score_in_range(self):
        # 各項不得超過配分:adj 為 -10..5,其餘 0..滿分
        low, high = (-10.0, 5.0) if self.key == "adj" else (0.0, AD_MAX[self.key])
        if not (low <= self.score <= high):
            raise ValueError(f"{self.key} 的分數必須介於 {low:g}–{high:g}")
        return self


class ScoreRevertIn(BaseModel):
    key: str
    reason: str = Field(min_length=1, max_length=500)

    _key = field_validator("key")(_validate_ad_key)
    _strip = field_validator("reason")(_strip_reason)


class MeritIn(BaseModel):
    score: int = Field(ge=0, le=5)
    reason: str = Field(min_length=1, max_length=500)

    _strip = field_validator("reason")(_strip_reason)
