from datetime import date

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, db_enum
from app.models.enums import ClubAttribute, MemberKind


class Club(Base, TimestampMixin):
    __tablename__ = "clubs"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(sa.Text, unique=True)
    attribute: Mapped[ClubAttribute] = mapped_column(db_enum(ClubAttribute, "club_attribute"))
    intro: Mapped[str] = mapped_column(sa.Text, default="")
    website_url: Mapped[str | None] = mapped_column(sa.Text)  # 行政分 ad6 依據
    # 指導老師(單一,社團自行維護;需多位時再抽表)
    advisor_name: Mapped[str | None] = mapped_column(sa.Text)
    advisor_dept: Mapped[str | None] = mapped_column(sa.Text)
    advisor_email: Mapped[str | None] = mapped_column(sa.Text)
    advisor_ext: Mapped[str | None] = mapped_column(sa.Text)
    suspended_until: Mapped[date | None] = mapped_column(sa.Date)  # NULL=未停權
    suspend_reason: Mapped[str | None] = mapped_column(sa.Text)
    is_active: Mapped[bool] = mapped_column(default=True)


class ClubMember(Base, TimestampMixin):
    """社員名單;updated_at 即行政分 ad5「名單更新」依據。"""

    __tablename__ = "club_members"
    __table_args__ = (sa.UniqueConstraint("club_id", "student_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    club_id: Mapped[int] = mapped_column(sa.ForeignKey("clubs.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(sa.Text)
    student_id: Mapped[str] = mapped_column(sa.Text)
    kind: Mapped[MemberKind] = mapped_column(db_enum(MemberKind, "member_kind"))
    title: Mapped[str | None] = mapped_column(sa.Text)  # 幹部必填(應用層)
