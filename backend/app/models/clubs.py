import uuid
from datetime import date, datetime
from typing import Any

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, db_enum
from app.models.enums import (
    BannerTextMode,
    ClubAttribute,
    ClubKind,
    MemberKind,
    RecruitStatus,
)


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

    # --- 對外公開(社團導覽頁;社團自填,行政端唯讀) ---
    # 行政端下架閥。與 is_active 是**兩個判定**:停用社團本來就不公開,
    # 而這裡關掉的社團帳號仍照常登入做事
    public_visible: Mapped[bool] = mapped_column(default=True, server_default=sa.true())
    tagline: Mapped[str | None] = mapped_column(sa.Text)  # 一句話介紹(字卡塞不下 intro)
    # 自由填,沒有標籤主檔:篩選取現有標籤的出現次數前 N 名。
    # ponytail: 建主檔要換一整個 admin CRUD 頁;真的長歪了再收成主檔
    tags: Mapped[list[str]] = mapped_column(
        ARRAY(sa.Text), default=list, server_default=sa.text("'{}'::text[]")
    )
    recruit_status: Mapped[RecruitStatus | None] = mapped_column(
        db_enum(RecruitStatus, "recruit_status")
    )
    # 對外窗口。**不是 contact_emails** —— 那三組是公告通知收件人,屬內部設定
    public_email: Mapped[str | None] = mapped_column(sa.Text)
    # [{kind, url}];website_url 一欄不夠用,社團主戰場是 IG
    social_links: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONB, default=list, server_default=sa.text("'[]'::jsonb")
    )
    office_location: Mapped[str | None] = mapped_column(sa.Text)
    regular_schedule: Mapped[str | None] = mapped_column(sa.Text)  # 例行社課/練習
    join_info: Mapped[str | None] = mapped_column(sa.Text)  # 入社方式與社費
    signup_url: Mapped[str | None] = mapped_column(sa.Text)
    founded_year: Mapped[int | None] = mapped_column(sa.SmallInteger)

    # 形象圖:落盤的已是轉好的 WebP(頭像 1:1、橫幅 4:3),原圖不留。
    # 刪檔時這兩欄要跟著清,故 ondelete=SET NULL 而非 RESTRICT。
    # use_alter:這兩個 FK 讓 clubs → files → clubs(files.club_id)成環,
    # 少了它 metadata.sorted_tables 會警告「unresolvable cycles」並放棄排序 ——
    # create_all/drop_all 的順序從此不可靠(SQLAlchemy 亦預告未來版本會改成錯誤)。
    # 帶 use_alter 就改以獨立的 ALTER TABLE 建立,環被切開
    avatar_file_id: Mapped[uuid.UUID | None] = mapped_column(
        sa.ForeignKey("files.id", ondelete="SET NULL", use_alter=True)
    )
    banner_file_id: Mapped[uuid.UUID | None] = mapped_column(
        sa.ForeignKey("files.id", ondelete="SET NULL", use_alter=True)
    )
    # 黑化與模糊是**顯示參數**,不燒進圖片 —— 調整不必重新上傳
    banner_dim: Mapped[int] = mapped_column(sa.SmallInteger, default=0, server_default="0")
    banner_blur: Mapped[int] = mapped_column(sa.SmallInteger, default=0, server_default="0")
    banner_text_mode: Mapped[BannerTextMode] = mapped_column(
        db_enum(BannerTextMode, "banner_text_mode"),
        default=BannerTextMode.AUTO,
        server_default=BannerTextMode.AUTO.value,
    )
    # 橫幅**下三分之一**的平均亮度 0–255(上傳時算一次)。字通常壓在底部,
    # 取全圖平均會在「上半天空下半暗地」這種圖上判錯
    banner_luma: Mapped[int | None] = mapped_column(sa.SmallInteger)


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
