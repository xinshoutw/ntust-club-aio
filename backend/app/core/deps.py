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

from fastapi import Depends, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.db import get_db
from app.core.errors import forbidden, unauthenticated
from app.core.security import SESSION_RENEW_INTERVAL, SESSION_TTL
from app.models import Session, User
from app.models.enums import UserRole

SESSION_COOKIE = "session_id"
CSRF_COOKIE = "csrf_token"
CSRF_HEADER = "x-csrf-token"
UNSAFE_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})

_COOKIE_MAX_AGE = int(SESSION_TTL.total_seconds())

DbDep = Annotated[AsyncSession, Depends(get_db)]


def set_auth_cookies(response: Response, session_id: str, csrf_token: str) -> None:
    """登入與滑動續期共用:cookie 效期須跟著 DB session 一起延長,參數單一出處。"""
    secure = settings.env == "prod"
    response.set_cookie(
        SESSION_COOKIE,
        session_id,
        max_age=_COOKIE_MAX_AGE,
        httponly=True,
        samesite="lax",
        secure=secure,
        path="/",
    )
    # CSRF cookie 供前端 JS 讀取後以 X-CSRF-Token header 回送(double-submit)
    response.set_cookie(
        CSRF_COOKIE,
        csrf_token,
        max_age=_COOKIE_MAX_AGE,
        httponly=False,
        samesite="lax",
        secure=secure,
        path="/",
    )


async def get_auth(request: Request, response: Response, db: DbDep) -> tuple[Session, User]:
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
        raise unauthenticated("登入憑證已過期，請重新登入")

    user = await db.get(User, session.user_id)
    if user is None or not user.is_active:
        raise unauthenticated("帳號已停用")

    if request.method in UNSAFE_METHODS:
        token = request.headers.get(CSRF_HEADER, "")
        if not token or not secrets.compare_digest(token, session.csrf_token):
            raise forbidden("CSRF 驗證失敗，請重新整理頁面", code="CSRF_FAILED")

    if session.expires_at < now + SESSION_TTL - SESSION_RENEW_INTERVAL:
        session.expires_at = now + SESSION_TTL
        await db.commit()
        # 瀏覽器 cookie 的 Max-Age 只在寫入當下生效:不重送的話,
        # DB 續期後 cookie 仍會在原登入後第七天消失,「滑動效期」形同虛設
        set_auth_cookies(response, str(session.id), session.csrf_token)

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
    """管理員頁面權限鍵(areview/aclose/…)或簽核關卡鍵(approve_advisor/…);super 全通。

    可傳多鍵=任一即通過(一支端點同時服務多頁時使用)。
    """

    async def dep(user: CurrentUser) -> User:
        if user.role != UserRole.ADMIN:
            raise forbidden()
        if not user.is_super and not any(k in user.permissions for k in keys):
            raise forbidden()
        return user

    return dep


async def require_staff(user: CurrentUser) -> User:
    if user.role != UserRole.STAFF:
        raise forbidden()
    return user


async def require_viewer(user: CurrentUser) -> User:
    """評審帳號(競賽評分);can_view_eval 由帳號管理建立時給定,停用即全面擋下。"""
    if user.role != UserRole.VIEWER or not user.can_view_eval:
        raise forbidden()
    return user


ViewerUser = Annotated[User, Depends(require_viewer)]


def client_ip(request: Request) -> str | None:
    """真實 IP:uvicorn --proxy-headers 已依信任鏈改寫 request.client。"""
    return request.client.host if request.client else None
