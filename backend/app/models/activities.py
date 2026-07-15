from datetime import date, datetime, time
from typing import Any

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, db_enum
from app.models.enums import (
    ActivityStatus,
    ActivityType,
    ApprovalDecision,
    ApprovalSubject,
)


class Activity(Base, TimestampMixin):
    __tablename__ = "activities"
    __table_args__ = (
        sa.Index("ix_activities_club_status", "club_id", "status"),
        sa.Index("ix_activities_date", "date"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    club_id: Mapped[int] = mapped_column(sa.ForeignKey("clubs.id"))
    name: Mapped[str] = mapped_column(sa.Text)
    content: Mapped[str] = mapped_column(sa.Text, default="")
    location: Mapped[str] = mapped_column(sa.Text)
    type: Mapped[ActivityType] = mapped_column(db_enum(ActivityType, "activity_type"))
    is_large: Mapped[bool] = mapped_column(default=False)  # 僅 type=活動 可勾
    is_large_approved: Mapped[bool | None] = mapped_column()  # 管理員認可後行政分才享 ×3
    # 起訖區間(2026-07-15:單日改時間區間;未跨日 end_date=date;學期歸屬與 ad1 皆以開始日推導)
    date: Mapped[date] = mapped_column(sa.Date)  # 活動開始日
    end_date: Mapped[date] = mapped_column(sa.Date)  # 活動結束日
    start_time: Mapped[time | None] = mapped_column(sa.Time)  # 開始時間屬 date
    end_time: Mapped[time | None] = mapped_column(sa.Time)  # 結束時間屬 end_date
    participants_in: Mapped[int] = mapped_column(default=0)  # 校內人數
    participants_out: Mapped[int] = mapped_column(default=0)  # 校外人數
    staff_text: Mapped[str] = mapped_column(sa.Text, default="")
    fund_source: Mapped[str | None] = mapped_column(sa.Text)  # 輔導老師第一關認定
    school_approved: Mapped[int | None] = mapped_column()  # 學校核定補助(元)
    status: Mapped[ActivityStatus] = mapped_column(
        db_enum(ActivityStatus, "activity_status"), default=ActivityStatus.DRAFT
    )
    close_unlocked: Mapped[bool] = mapped_column(default=False)  # 逾期鎖定的管理員解鎖
    close_draft: Mapped[dict[str, Any] | None] = mapped_column(JSONB)  # 結案草稿(不含照片)
    created_by: Mapped[int] = mapped_column(sa.ForeignKey("users.id"))

    budget_items: Mapped[list[ActivityBudgetItem]] = relationship(
        cascade="all, delete-orphan", order_by="ActivityBudgetItem.id"
    )
    report: Mapped[ActivityReport | None] = relationship(cascade="all, delete-orphan")


class ActivityBudgetItem(Base, TimestampMixin):
    """經費逐項編列;approved_subsidy 由輔導老師關卡逐項核定。"""

    __tablename__ = "activity_budget_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    activity_id: Mapped[int] = mapped_column(
        sa.ForeignKey("activities.id", ondelete="CASCADE"), index=True
    )
    category: Mapped[str] = mapped_column(sa.Text)  # 九項科目(目錄進 system_settings)
    description: Mapped[str] = mapped_column(sa.Text, default="")
    self_fund: Mapped[int] = mapped_column(default=0)
    requested_subsidy: Mapped[int] = mapped_column(default=0)
    approved_subsidy: Mapped[int | None] = mapped_column()


class ActivityReport(Base, TimestampMixin):
    """結案成果調查(2026-07-14 需求方改版);除 video_url 外全必填。"""

    __tablename__ = "activity_reports"

    activity_id: Mapped[int] = mapped_column(
        sa.ForeignKey("activities.id", ondelete="CASCADE"), primary_key=True
    )
    member_count: Mapped[int] = mapped_column()
    non_member_count: Mapped[int] = mapped_column()
    actual_start: Mapped[time] = mapped_column(sa.Time)
    actual_end: Mapped[time] = mapped_column(sa.Time)
    actual_location: Mapped[str] = mapped_column(sa.Text)
    highlights: Mapped[str] = mapped_column(sa.Text)
    goals: Mapped[str] = mapped_column(sa.Text)
    others: Mapped[str] = mapped_column(sa.Text)
    # 檢討會議(2026-07-15 獨立 section):true 時日期/與會人數/討論事項/內容決議皆必填(應用層)
    review_meeting: Mapped[bool] = mapped_column()
    review_date: Mapped[date | None] = mapped_column(sa.Date)
    review_attendees: Mapped[int | None] = mapped_column()  # 與會人數
    review_topics: Mapped[str | None] = mapped_column(sa.Text)  # 討論事項
    review_conclusion: Mapped[str | None] = mapped_column(sa.Text)  # 內容決議
    video_url: Mapped[str | None] = mapped_column(sa.Text)  # 唯一選填;http(s) 驗證
    expense: Mapped[int] = mapped_column()  # 實際支出(核銷依據)
    submitted_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True))

    reflections: Mapped[list[ActivityReflection]] = relationship(
        cascade="all, delete-orphan", order_by="ActivityReflection.id"
    )


class ActivityReflection(Base, TimestampMixin):
    """學習心得(送審驗證 ≥3 筆,三欄皆必填)。"""

    __tablename__ = "activity_reflections"

    id: Mapped[int] = mapped_column(primary_key=True)
    report_id: Mapped[int] = mapped_column(
        sa.ForeignKey("activity_reports.activity_id", ondelete="CASCADE"), index=True
    )
    student_name: Mapped[str] = mapped_column(sa.Text)
    dept: Mapped[str] = mapped_column(sa.Text)  # 系級
    body: Mapped[str] = mapped_column(sa.Text)


class ApprovalRecord(Base, TimestampMixin):
    """全系統簽核軌跡:每一次核准/退回/解鎖/撤銷一列,狀態欄只是快照。"""

    __tablename__ = "approval_records"
    __table_args__ = (sa.Index("ix_approval_records_subject", "subject_type", "subject_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    subject_type: Mapped[ApprovalSubject] = mapped_column(
        db_enum(ApprovalSubject, "approval_subject")
    )
    subject_id: Mapped[int] = mapped_column()
    stage: Mapped[str] = mapped_column(sa.Text)  # advisor / chief / dean / single…
    decision: Mapped[ApprovalDecision] = mapped_column(
        db_enum(ApprovalDecision, "approval_decision")
    )
    actor_id: Mapped[int] = mapped_column(sa.ForeignKey("users.id"))
    reason: Mapped[str | None] = mapped_column(sa.Text)  # 退回必填(應用層強制)
