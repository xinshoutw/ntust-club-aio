from datetime import date, datetime

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import ARRAY, INET
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, db_enum
from app.models.enums import (
    AnnouncementTarget,
    EmailStatus,
    LegacySystem,
    ViolationStatus,
)


class Announcement(Base, TimestampMixin):
    """公告(2026-07-16 第八輪):content 存 markdown 原文(前端渲染,後端僅存)。"""

    __tablename__ = "announcements"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(sa.Text)
    content: Mapped[str] = mapped_column(sa.Text)  # markdown 原文
    target_type: Mapped[AnnouncementTarget] = mapped_column(
        db_enum(AnnouncementTarget, "announcement_target"), default=AnnouncementTarget.ALL
    )
    attrs: Mapped[list[str] | None] = mapped_column(ARRAY(sa.Text))  # target=attr:性質可多選
    club_id: Mapped[int | None] = mapped_column(sa.ForeignKey("clubs.id"))  # target=club
    # 蓋板截止日;NULL=非蓋板。期限內社團每次登入全版顯示(顯示邏輯在前端)
    takeover_until: Mapped[date | None] = mapped_column(sa.Date)
    notify: Mapped[bool] = mapped_column(default=False)  # 發布時寄送通知(Email/Discord)
    is_auto: Mapped[bool] = mapped_column(default=False)  # 系統自動通知(如核准訊息)
    created_by: Mapped[int] = mapped_column(sa.ForeignKey("users.id"))


class AnnouncementDismissal(Base, TimestampMixin):
    """蓋板公告「不再顯示」:社團勾選後該公告不再於登入時蓋板(跨裝置,DB 持久)。"""

    __tablename__ = "announcement_dismissals"

    announcement_id: Mapped[int] = mapped_column(
        sa.ForeignKey("announcements.id", ondelete="CASCADE"), primary_key=True
    )
    club_id: Mapped[int] = mapped_column(
        sa.ForeignKey("clubs.id", ondelete="CASCADE"), primary_key=True
    )


class Violation(Base, TimestampMixin):
    """違規勸導;未銷案筆數餵行政分減分。佐證照片走 files。"""

    __tablename__ = "violations"
    __table_args__ = (sa.Index("ix_violations_club_status", "club_id", "status"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    club_id: Mapped[int] = mapped_column(sa.ForeignKey("clubs.id"))
    occurred_on: Mapped[date] = mapped_column(sa.Date)
    location: Mapped[str] = mapped_column(sa.Text)
    items: Mapped[list[str]] = mapped_column(ARRAY(sa.Text))  # 違規項目複選(目錄進 settings)
    other: Mapped[str | None] = mapped_column(sa.Text)
    filler_id: Mapped[int] = mapped_column(sa.ForeignKey("users.id"))  # 填寫工讀生
    status: Mapped[ViolationStatus] = mapped_column(
        db_enum(ViolationStatus, "violation_status"), default=ViolationStatus.OPEN
    )
    resolve_note: Mapped[str | None] = mapped_column(sa.Text)


class AuditLog(Base, TimestampMixin):
    """稽核軌跡:高風險操作全記;不設上限。"""

    __tablename__ = "audit_logs"
    __table_args__ = (sa.Index("ix_audit_logs_created_at", "created_at"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    # SET NULL:刪除帳號時稽核紀錄保留(2026-07-16 第八輪帳號管理)
    user_id: Mapped[int | None] = mapped_column(
        sa.ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    role: Mapped[str | None] = mapped_column(sa.Text)
    action: Mapped[str] = mapped_column(sa.Text)
    detail: Mapped[str] = mapped_column(sa.Text, default="")
    ip: Mapped[str | None] = mapped_column(INET)


class EmailLog(Base, TimestampMixin):
    """寄信結果留底,通知糾紛時可查。"""

    __tablename__ = "email_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    to_addr: Mapped[str] = mapped_column(sa.Text)
    subject: Mapped[str] = mapped_column(sa.Text)
    template: Mapped[str] = mapped_column(sa.Text)
    status: Mapped[EmailStatus] = mapped_column(db_enum(EmailStatus, "email_status"))
    error: Mapped[str | None] = mapped_column(sa.Text)


class LegacyIdMap(Base, TimestampMixin):
    """舊系統 id → 新 id 對應;migration scripts 以此 idempotent。"""

    __tablename__ = "legacy_id_map"
    __table_args__ = (sa.UniqueConstraint("legacy_system", "legacy_table", "legacy_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    legacy_system: Mapped[LegacySystem] = mapped_column(db_enum(LegacySystem, "legacy_system"))
    legacy_table: Mapped[str] = mapped_column(sa.Text)
    legacy_id: Mapped[str] = mapped_column(sa.Text)
    new_table: Mapped[str] = mapped_column(sa.Text)
    new_id: Mapped[str] = mapped_column(sa.Text)
    migrated_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True))
