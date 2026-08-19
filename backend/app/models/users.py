import uuid
from datetime import datetime

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import ARRAY, INET
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, db_enum
from app.models.enums import AuthProvider, UserRole


class User(Base, TimestampMixin):
    """四角色單表(admin/staff/club/viewer);角色專屬欄位允許 NULL。"""

    __tablename__ = "users"
    # 一社一帳號:應用層有檢查,但遷移腳本直接寫 DB,兜底約束得在這一層
    __table_args__ = (
        sa.Index(
            "uq_users_club_id",
            "club_id",
            unique=True,
            postgresql_where=sa.text("club_id IS NOT NULL"),
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    role: Mapped[UserRole] = mapped_column(db_enum(UserRole, "user_role"))
    username: Mapped[str] = mapped_column(sa.Text, unique=True)
    password_hash: Mapped[str | None] = mapped_column(sa.Text)  # argon2id;SSO 帳號為 NULL
    auth_provider: Mapped[AuthProvider] = mapped_column(
        db_enum(AuthProvider, "auth_provider"), default=AuthProvider.LOCAL
    )
    name: Mapped[str] = mapped_column(sa.Text)
    email: Mapped[str | None] = mapped_column(sa.Text)
    club_id: Mapped[int | None] = mapped_column(sa.ForeignKey("clubs.id"))  # 僅 role=club
    is_super: Mapped[bool] = mapped_column(default=False)  # 僅 admin
    permissions: Mapped[list[str]] = mapped_column(
        ARRAY(sa.Text), default=list, server_default=sa.text("'{}'::text[]")
    )
    can_view_eval: Mapped[bool] = mapped_column(default=False)  # 僅 viewer
    must_change_password: Mapped[bool] = mapped_column(default=True)
    is_active: Mapped[bool] = mapped_column(default=True)
    last_login_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True))
    # 登入防爆破:連錯 5 次鎖 15 分(政策欄位,data-model.md §3.1 補充)
    failed_login_attempts: Mapped[int] = mapped_column(default=0)
    locked_until: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True))


class PasswordHistory(Base, TimestampMixin):
    """密碼歷史:新密碼不得與近 3 代相同。"""

    __tablename__ = "password_history"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(sa.ForeignKey("users.id", ondelete="CASCADE"), index=True)
    password_hash: Mapped[str] = mapped_column(sa.Text)


class Session(Base, TimestampMixin):
    """DB session(cookie 值=id):7 天滑動效期、允許多裝置;刪列即登出。"""

    __tablename__ = "sessions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[int] = mapped_column(sa.ForeignKey("users.id", ondelete="CASCADE"), index=True)
    csrf_token: Mapped[str] = mapped_column(sa.Text)  # double-submit 綁 session
    ip: Mapped[str | None] = mapped_column(INET)
    user_agent: Mapped[str | None] = mapped_column(sa.Text)
    expires_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), index=True)
