"""帳號管理(/admin/accounts,僅 super;2026-07-16 第八輪)。

管理員/工讀生/評審三類帳號;社團帳號走 /admin/clubs(帳號管理「社團」分頁與管理項目),不在此管理。
"""

import re
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.enums import UserRole

# 頁面權限鍵(前端 AccountsPage.PERMISSION_KEYS)+ 既有後端鍵 + 簽核關卡鍵
PERMISSION_KEYS = frozenset(
    {
        # 前端權限彈窗清單
        "areview",  # 活動申請審核
        "aclose",  # 結案審核
        "asignup",  # 報名管理
        "aannounce",  # 發布公告
        "abooking",  # 臨時場地器材借用審核
        "aroom",  # 教室固定借用審核
        "amember",  # 社團管理
        "aeval",  # 行政分審核
        "amaint",  # 維修管理
        "aapply",  # 線上申請管理(幹部證明/郵局帳戶異動,2026-07-17)
        "aviol",  # 違規管理
        "afiles",  # 檔案管理
        # 既有後端鍵(前後端鍵名待統一,先兩者皆收)
        "aact",
        "areg",
        # 簽核關卡鍵
        "approve_advisor",
        "approve_chief",
        "approve_dean",
    }
)

_USERNAME_RE = re.compile(r"^[a-zA-Z0-9._-]{3,50}$")

ManagedRole = Literal["admin", "staff", "viewer"]


def _validate_permissions(v: list[str]) -> list[str]:
    unknown = [k for k in v if k not in PERMISSION_KEYS]
    if unknown:
        raise ValueError(f"未知的權限鍵:{','.join(unknown)}")
    return list(dict.fromkeys(v))  # 去重保序


class AccountOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    role: UserRole
    username: str
    name: str
    email: str | None
    is_super: bool
    permissions: list[str]
    can_view_eval: bool
    is_active: bool
    must_change_password: bool
    last_login_at: datetime | None
    created_at: datetime


class AccountCreateIn(BaseModel):
    role: ManagedRole
    name: str = Field(min_length=1, max_length=50)
    username: str
    email: str | None = Field(None, max_length=100)
    permissions: list[str] = Field(default_factory=list, max_length=20)  # 僅 role=admin 有效

    @field_validator("name")
    @classmethod
    def _strip_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("姓名不得為空白")
        return v

    @field_validator("username")
    @classmethod
    def _valid_username(cls, v: str) -> str:
        v = v.strip()
        if not _USERNAME_RE.match(v):
            raise ValueError("帳號限 3–50 字的英數字與 . _ -")
        return v

    _perms = field_validator("permissions")(_validate_permissions)


class AccountCreatedOut(AccountOut):
    """僅建立/重設當次回傳明文一次性密碼。"""

    password: str


class PermissionsIn(BaseModel):
    permissions: list[str] = Field(max_length=20)

    _perms = field_validator("permissions")(_validate_permissions)


class ActiveIn(BaseModel):
    is_active: bool


class PasswordResetOut(BaseModel):
    password: str  # 一次性密碼,僅此回應可見
