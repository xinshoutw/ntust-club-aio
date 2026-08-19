import uuid
from datetime import datetime
from typing import Any

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, db_enum
from app.models.enums import AdjustmentKind, AwardKind


class Award(Base, TimestampMixin):
    """五獎項:club/finance/activity/result/leader(slug 主鍵)。"""

    __tablename__ = "awards"

    id: Mapped[str] = mapped_column(sa.Text, primary_key=True)  # slug
    name: Mapped[str] = mapped_column(sa.Text)
    kind: Mapped[AwardKind] = mapped_column(db_enum(AwardKind, "award_kind"))
    has_presentation: Mapped[bool] = mapped_column(default=False)  # 現場簡報 20 分
    is_weighted: Mapped[bool] = mapped_column(default=False)  # 最佳社團獎 行政40%+營運60%
    sort: Mapped[int] = mapped_column(default=0)
    is_active: Mapped[bool] = mapped_column(default=True)


class AwardRubricItem(Base, TimestampMixin):
    """逐年版本化評分表:新學年由行政複製上年再修改,歷年成績永遠對應當年條目。"""

    __tablename__ = "award_rubric_items"
    __table_args__ = (sa.UniqueConstraint("award_id", "year", "item_key"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    award_id: Mapped[str] = mapped_column(sa.ForeignKey("awards.id"))
    year: Mapped[int] = mapped_column()
    group_label: Mapped[str | None] = mapped_column(sa.Text)  # 如「行政資料」
    group_weight: Mapped[float | None] = mapped_column()  # 如 0.4;非加權獎項 NULL
    item_key: Mapped[str] = mapped_column(sa.Text)  # ad1/o1/f1/ac1/r1/l1…
    name: Mapped[str] = mapped_column(sa.Text)
    max_score: Mapped[float] = mapped_column()
    help: Mapped[str] = mapped_column(sa.Text, default="")
    is_admin_item: Mapped[bool] = mapped_column(default=False)  # ad1–ad8
    sort: Mapped[int] = mapped_column(default=0)


class EvalUpload(Base, TimestampMixin):
    """競賽資料上傳:社團 × 評分項 × 多檔。"""

    __tablename__ = "eval_uploads"
    __table_args__ = (sa.Index("ix_eval_uploads_year_club", "year", "club_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    year: Mapped[int] = mapped_column()
    club_id: Mapped[int] = mapped_column(sa.ForeignKey("clubs.id"), index=True)
    rubric_item_id: Mapped[int] = mapped_column(sa.ForeignKey("award_rubric_items.id"))
    file_id: Mapped[uuid.UUID] = mapped_column(sa.ForeignKey("files.id"))


class EvalGroup(Base, TimestampMixin):
    """評鑑分組;reviewer sort 決定「評審A/評審B」匿名代號。

    一個分組屬於一個獎項(award_id):指派=獎項 × 社團 × 評審。
    """

    __tablename__ = "eval_groups"

    id: Mapped[int] = mapped_column(primary_key=True)
    year: Mapped[int] = mapped_column(index=True)
    award_id: Mapped[str] = mapped_column(sa.ForeignKey("awards.id"), index=True)
    name: Mapped[str] = mapped_column(sa.Text)
    sort: Mapped[int] = mapped_column(default=0)


class EvalGroupClub(Base, TimestampMixin):
    __tablename__ = "eval_group_clubs"

    group_id: Mapped[int] = mapped_column(
        sa.ForeignKey("eval_groups.id", ondelete="CASCADE"), primary_key=True
    )
    club_id: Mapped[int] = mapped_column(sa.ForeignKey("clubs.id"), index=True, primary_key=True)


class EvalGroupReviewer(Base, TimestampMixin):
    __tablename__ = "eval_group_reviewers"

    group_id: Mapped[int] = mapped_column(
        sa.ForeignKey("eval_groups.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[int] = mapped_column(sa.ForeignKey("users.id"), index=True, primary_key=True)
    sort: Mapped[int] = mapped_column(default=0)


class ReviewScore(Base, TimestampMixin):
    """評審評分主檔;百分比與名次一律推導。"""

    __tablename__ = "review_scores"
    __table_args__ = (sa.UniqueConstraint("year", "award_id", "club_id", "reviewer_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    year: Mapped[int] = mapped_column()
    award_id: Mapped[str] = mapped_column(sa.ForeignKey("awards.id"))
    club_id: Mapped[int] = mapped_column(sa.ForeignKey("clubs.id"), index=True)
    reviewer_id: Mapped[int] = mapped_column(sa.ForeignKey("users.id"), index=True)
    presentation_score: Mapped[int | None] = mapped_column()  # 現場簡報 20 分
    bonus: Mapped[int] = mapped_column(default=0)
    penalty: Mapped[int] = mapped_column(default=0)
    submitted_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True))

    items: Mapped[list[ReviewScoreItem]] = relationship(cascade="all, delete-orphan")


class ReviewScoreItem(Base, TimestampMixin):
    __tablename__ = "review_score_items"
    __table_args__ = (sa.UniqueConstraint("score_id", "rubric_item_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    score_id: Mapped[int] = mapped_column(sa.ForeignKey("review_scores.id", ondelete="CASCADE"))
    rubric_item_id: Mapped[int] = mapped_column(sa.ForeignKey("award_rubric_items.id"))
    score: Mapped[float] = mapped_column()
    comment: Mapped[str] = mapped_column(sa.Text, default="")


class EvalAdjustment(Base, TimestampMixin):
    """人工調整留痕:查詢時調整值蓋過計算值;註銷調整列即回到自動計算。"""

    __tablename__ = "eval_adjustments"
    __table_args__ = (sa.Index("ix_eval_adjustments_year_club", "year", "club_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    year: Mapped[int] = mapped_column()
    award_id: Mapped[str] = mapped_column(sa.ForeignKey("awards.id"))
    club_id: Mapped[int] = mapped_column(sa.ForeignKey("clubs.id"), index=True)
    kind: Mapped[AdjustmentKind] = mapped_column(db_enum(AdjustmentKind, "adjustment_kind"))
    value: Mapped[Any] = mapped_column(JSONB)
    reason: Mapped[str] = mapped_column(sa.Text)  # 必填
    actor_id: Mapped[int] = mapped_column(sa.ForeignKey("users.id"))
    revoked_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True))  # 註銷=回自動


class EvalSetting(Base, TimestampMixin):
    """逐年逐獎項開關:評語開放、行政資料開放。"""

    __tablename__ = "eval_settings"

    year: Mapped[int] = mapped_column(primary_key=True)
    award_id: Mapped[str] = mapped_column(sa.ForeignKey("awards.id"), primary_key=True)
    comment_released: Mapped[bool] = mapped_column(default=False)
    # 預設 True:與「無設定列=開放」語意一致,建列調 comment_released 不會誤鎖上傳
    unlocked: Mapped[bool] = mapped_column(default=True)
