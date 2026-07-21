from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import UserRole


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=1, max_length=200)


class ChangePasswordRequest(BaseModel):
    old_password: str = Field(min_length=1, max_length=200)
    new_password: str = Field(min_length=1, max_length=200)


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
