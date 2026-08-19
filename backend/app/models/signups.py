from datetime import date, datetime
from typing import Any

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, db_enum
from app.models.enums import SignupKind


class SignupItem(Base, TimestampMixin):
    """報名活動項目(管理員建立,自訂表單欄位;2026-07-16 第八輪欄位)。"""

    __tablename__ = "signup_items"
    __table_args__ = (
        # 命名慣例補 ck_signup_items_ 前綴 → ck_signup_items_capacity_min
        sa.CheckConstraint("max_participants >= 1", name="capacity_min"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    # 年度不儲存:ad7/ad8 採計以場次日期落在評鑑視窗推導
    name: Mapped[str] = mapped_column(sa.Text)
    description: Mapped[str] = mapped_column(sa.Text, default="")  # 活動描述
    is_open: Mapped[bool] = mapped_column(default=True)  # 管理員可提前關閉
    event_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True))  # 活動時間
    place: Mapped[str | None] = mapped_column(sa.Text)
    # 報名窗:signup_start <= now <= signup_end 才受理(開始建立時預設今天)
    signup_start: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True), server_default=sa.func.now()
    )
    signup_end: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True))
    max_participants: Mapped[int] = mapped_column(default=1)  # 每社名額上限(必填 ≥1)
    # 表單欄位定義:[{key, label, type(text/textarea/radio/checkbox/select), options[], required}]
    # 陣列順序即顯示順序(拖曳排序後整包送)
    fields: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list)
    kind: Mapped[SignupKind] = mapped_column(
        db_enum(SignupKind, "signup_kind"), default=SignupKind.NORMAL
    )
    session_based: Mapped[bool] = mapped_column(default=False)  # 場次採計(負責人會議)
    requires_confirmation: Mapped[bool] = mapped_column(default=False)
    is_eval: Mapped[bool] = mapped_column(default=False)  # 競賽報名項
    created_by: Mapped[int] = mapped_column(sa.ForeignKey("users.id"))

    sessions: Mapped[list[SignupItemSession]] = relationship(
        cascade="all, delete-orphan", order_by="SignupItemSession.date"
    )


class SignupItemSession(Base, TimestampMixin):
    """場次(如負責人會議 4 場);出席餵行政分 ad7。"""

    __tablename__ = "signup_item_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    item_id: Mapped[int] = mapped_column(
        sa.ForeignKey("signup_items.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(sa.Text)
    date: Mapped[date] = mapped_column(sa.Date)
    semester: Mapped[str] = mapped_column(sa.Text)  # 如 114-2


class Signup(Base, TimestampMixin):
    """一社一單;一經報名不得更改(存在即拒絕再送)。"""

    __tablename__ = "signups"
    __table_args__ = (sa.UniqueConstraint("item_id", "club_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    item_id: Mapped[int] = mapped_column(sa.ForeignKey("signup_items.id"))
    club_id: Mapped[int] = mapped_column(sa.ForeignKey("clubs.id"), index=True)
    confirmed: Mapped[bool] = mapped_column(default=False)

    entries: Mapped[list[SignupEntry]] = relationship(
        cascade="all, delete-orphan", order_by="SignupEntry.id"
    )


class SignupDraft(Base, TimestampMixin):
    """報名草稿(寫 DB、跨裝置續填);送出報名時刪除。"""

    __tablename__ = "signup_drafts"
    __table_args__ = (sa.UniqueConstraint("item_id", "club_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    item_id: Mapped[int] = mapped_column(sa.ForeignKey("signup_items.id", ondelete="CASCADE"))
    club_id: Mapped[int] = mapped_column(sa.ForeignKey("clubs.id"), index=True)
    participants: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list)


class SignupEntry(Base, TimestampMixin):
    """一人一列;筆數 ≤ max_participants(應用層強制)。answers={field_key: value}。"""

    __tablename__ = "signup_entries"

    id: Mapped[int] = mapped_column(primary_key=True)
    signup_id: Mapped[int] = mapped_column(
        sa.ForeignKey("signups.id", ondelete="CASCADE"), index=True
    )
    answers: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)


class SignupAward(Base, TimestampMixin):
    """競賽報名勾選的獎項。"""

    __tablename__ = "signup_awards"

    signup_id: Mapped[int] = mapped_column(
        sa.ForeignKey("signups.id", ondelete="CASCADE"), primary_key=True
    )
    award_id: Mapped[str] = mapped_column(sa.ForeignKey("awards.id"), primary_key=True)


class SessionAttendance(Base, TimestampMixin):
    """場次出席(學務處登錄)→ 行政分 ad7。"""

    __tablename__ = "session_attendance"
    __table_args__ = (sa.UniqueConstraint("session_id", "club_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(
        sa.ForeignKey("signup_item_sessions.id", ondelete="CASCADE")
    )
    club_id: Mapped[int] = mapped_column(sa.ForeignKey("clubs.id"), index=True)
    attended: Mapped[bool] = mapped_column()
    marked_by: Mapped[int] = mapped_column(sa.ForeignKey("users.id"))
    marked_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True))
