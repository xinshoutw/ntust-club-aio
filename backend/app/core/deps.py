"""認證與授權依賴。

- session cookie(HttpOnly)→ DB sessions 表;7 天滑動效期
- CSRF:double-submit(csrf_token cookie 由前端以 X-CSRF-Token header 回送),
  值綁定 session 列,狀態變更方法(POST/PUT/PATCH/DELETE)一律驗證
- 首登強制改密:must_change_password=true 時僅允許改密與登出
"""

import secrets
import uuid
from datetime import UTC, datetime
from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.errors import forbidden, unauthenticated
from app.core.security import SESSION_RENEW_INTERVAL, SESSION_TTL
from app.models import Session, User
from app.models.enums import UserRole

SESSION_COOKIE = "session_id"
CSRF_COOKIE = "csrf_token"
CSRF_HEADER = "x-csrf-token"
UNSAFE_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})

DbDep = Annotated[AsyncSession, Depends(get_db)]


async def get_auth(request: Request, db: DbDep) -> tuple[Session, User]:
    """載入 session 與使用者;含 CSRF 驗證與滑動續期。不擋首登改密。"""
    raw = request.cookies.get(SESSION_COOKIE)
    if not raw:
        raise unauthenticated()
    try:
        session_id = uuid.UUID(raw)
    except ValueError:
        raise unauthenticated() from None

    now = datetime.now(UTC)
    session = await db.get(Session, session_id)
    if session is None or session.expires_at <= now:
        raise unauthenticated("登入已過期,請重新登入")

    user = await db.get(User, session.user_id)
    if user is None or not user.is_active:
        raise unauthenticated("帳號已停用")

    if request.method in UNSAFE_METHODS:
        token = request.headers.get(CSRF_HEADER, "")
        if not token or not secrets.compare_digest(token, session.csrf_token):
            raise forbidden("CSRF 驗證失敗,請重新整理頁面", code="CSRF_FAILED")

    if session.expires_at < now + SESSION_TTL - SESSION_RENEW_INTERVAL:
        session.expires_at = now + SESSION_TTL
        await db.commit()

    return session, user


AuthDep = Annotated[tuple[Session, User], Depends(get_auth)]


async def get_current_user(auth: AuthDep) -> User:
    _, user = auth
    if user.must_change_password:
        raise forbidden("首次登入請先變更密碼", code="PASSWORD_CHANGE_REQUIRED")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_role(*roles: UserRole):
    async def dep(user: CurrentUser) -> User:
        if user.role not in roles:
            raise forbidden()
        return user

    return dep


async def require_club(user: CurrentUser) -> User:
    """社團帳號;handlers 一律以 user.club_id 界定資料範圍(club 只能取自己資料)。"""
    if user.role != UserRole.CLUB or user.club_id is None:
        raise forbidden()
    return user


ClubUser = Annotated[User, Depends(require_club)]


def require_permission(*keys: str):
    """管理員頁面權限鍵(aact/aclose/…)或簽核關卡鍵(approve_advisor/…);super 全通。

    可傳多鍵=任一即通過(前後端權限鍵名尚未統一時的別名,如 areg/asignup)。
    """

    async def dep(user: CurrentUser) -> User:
        if user.role != UserRole.ADMIN:
            raise forbidden()
        if not user.is_super and not any(k in user.permissions for k in keys):
            raise forbidden()
        return user

    return dep


async def require_super(user: CurrentUser) -> User:
    if user.role != UserRole.ADMIN or not user.is_super:
        raise forbidden()
    return user


async def require_staff(user: CurrentUser) -> User:
    if user.role != UserRole.STAFF:
        raise forbidden()
    return user


def client_ip(request: Request) -> str | None:
    """真實 IP:uvicorn --proxy-headers 已依信任鏈改寫 request.client。"""
    return request.client.host if request.client else None
