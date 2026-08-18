from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import UserRole


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=1, max_length=200)


class ChangePasswordRequest(BaseModel):
    old_password: str = Field(min_length=1, max_length=200)
    new_password: str = Field(min_length=1, max_length=200)


class AdminPageOut(BaseModel):
    """行政端頁面權限目錄(core/permissions.ADMIN_PAGES);僅 admin 取得。"""

    key: str
    label: str
    paths: list[str]
    also: list[str]


class PeriodOut(BaseModel):
    """節次目錄(services/booking_service.PERIOD_TIMES);起訖為 HH:MM。"""

    key: str
    start: str
    end: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    role: UserRole
    username: str
    name: str
    email: str | None
    club_id: int | None
    club_name: str | None = None  # role=club 時由端點補上(前端顯示用)
    club_kind: str | None = None  # 社團/學會(負責人顯示詞 社長/會長 推導用)
    is_super: bool
    permissions: list[str]
    can_view_eval: bool
    must_change_password: bool
    # 行政端頁面權限目錄:側欄過濾、路由守衛與權限彈窗的唯一來源。非 admin 為 None
    admin_pages: list[AdminPageOut] | None = None
    # 節次目錄:借用相關畫面的節次軸與「已開始節次」判定都讀這一份,前端不維護第二份
    periods: list[PeriodOut] = []
