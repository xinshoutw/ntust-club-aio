from datetime import date, datetime

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, db_enum
from app.models.enums import ClubAttribute, ClubKind, MemberKind


class Club(Base, TimestampMixin):
    __tablename__ = "clubs"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(sa.Text, unique=True)
    # 社團/學會:名稱結尾社/會自動推導,推導不到手動指定;
    # 負責人顯示詞(社長/會長)由此決定
    kind: Mapped[ClubKind] = mapped_column(db_enum(ClubKind, "club_kind"))
    en_name: Mapped[str | None] = mapped_column(sa.Text)  # 英文名(舊系統遷入)
    # 停社的舊社團原性質不可考 → NULL(僅 is_active=false 者)
    attribute: Mapped[ClubAttribute | None] = mapped_column(
        db_enum(ClubAttribute, "club_attribute")
    )
    intro: Mapped[str] = mapped_column(sa.Text, default="")
    website_url: Mapped[str | None] = mapped_column(sa.Text)  # 行政分 ad6 依據
    # 聯絡 Email(管理項目,至多 3 組;公告通知寄送對象)
    contact_emails: Mapped[list[str]] = mapped_column(
        ARRAY(sa.Text), default=list, server_default=sa.text("'{}'::text[]")
    )
    # 社團自設的 Discord webhook(管理項目;該社事件另推一份到這裡)
    discord_webhook_url: Mapped[str | None] = mapped_column(sa.Text)
    # 指導老師:校內/校外各至多一位,社團自行維護
    advisor_name: Mapped[str | None] = mapped_column(sa.Text)  # 校內
    advisor_dept: Mapped[str | None] = mapped_column(sa.Text)  # 系所/職稱
    advisor_email: Mapped[str | None] = mapped_column(sa.Text)
    advisor_out_name: Mapped[str | None] = mapped_column(sa.Text)  # 校外
    advisor_out_dept: Mapped[str | None] = mapped_column(sa.Text)  # 單位/職稱
    advisor_out_email: Mapped[str | None] = mapped_column(sa.Text)
    suspended_until: Mapped[date | None] = mapped_column(sa.Date)  # NULL=未停權
    suspend_reason: Mapped[str | None] = mapped_column(sa.Text)
    is_active: Mapped[bool] = mapped_column(default=True)
    # 公告已讀水位線(鈴鐺紅點):created_at 晚於此者未讀;NULL=全部未讀。
    # 一社一帳號,故掛在 club;鈴鐺開啟或進入總覽(公告所在頁)時前移
    announcements_read_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True))


class ClubMember(Base, TimestampMixin):
    """社員名單:按學期各自一份快照(同學號可跨學期出現)。"""

    __tablename__ = "club_members"
    __table_args__ = (sa.UniqueConstraint("club_id", "student_id", "semester"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    club_id: Mapped[int] = mapped_column(sa.ForeignKey("clubs.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(sa.Text)
    student_id: Mapped[str] = mapped_column(sa.Text)
    kind: Mapped[MemberKind] = mapped_column(db_enum(MemberKind, "member_kind"))
    # 幹部必填,其他身份選填
    title: Mapped[str | None] = mapped_column(sa.Text)
    semester: Mapped[str] = mapped_column(sa.Text, index=True)  # 如 114-2
