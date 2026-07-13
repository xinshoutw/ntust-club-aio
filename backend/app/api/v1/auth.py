from fastapi import APIRouter, Request, Response

from app.core.config import settings
from app.core.deps import (
    CSRF_COOKIE,
    SESSION_COOKIE,
    AuthDep,
    DbDep,
    client_ip,
)
from app.core.errors import AppError, rate_limited
from app.core.rate_limit import login_limiter
from app.core.security import SESSION_TTL
from app.schemas.auth import ChangePasswordRequest, LoginRequest, UserOut
from app.schemas.common import ApiResponse
from app.services import auth as auth_service

router = APIRouter(prefix="/auth", tags=["auth"])

_COOKIE_MAX_AGE = int(SESSION_TTL.total_seconds())


def _set_auth_cookies(response: Response, session_id: str, csrf_token: str) -> None:
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


@router.post("/login")
async def login(
    body: LoginRequest, request: Request, response: Response, db: DbDep
) -> ApiResponse[UserOut]:
    ip = client_ip(request)
    if login_limiter.blocked(ip or "unknown"):
        raise rate_limited("登入嘗試過於頻繁,請稍後再試")
    try:
        user, session = await auth_service.login(
            db,
            username=body.username,
            password=body.password,
            ip=ip,
            user_agent=request.headers.get("user-agent"),
        )
    except AppError:
        login_limiter.hit(ip or "unknown")  # 只計失敗:校園 NAT 下成功登入不佔額度
        raise
    _set_auth_cookies(response, str(session.id), session.csrf_token)
    return ApiResponse(data=UserOut.model_validate(user))


@router.post("/logout")
async def logout(
    auth: AuthDep, request: Request, response: Response, db: DbDep
) -> ApiResponse[None]:
    session, user = auth
    await auth_service.logout(db, session, user, client_ip(request))
    response.delete_cookie(SESSION_COOKIE, path="/")
    response.delete_cookie(CSRF_COOKIE, path="/")
    return ApiResponse()


@router.get("/me")
async def me(auth: AuthDep) -> ApiResponse[UserOut]:
    # 首登未改密也可查自己(前端靠 must_change_password 導向改密頁)
    _, user = auth
    return ApiResponse(data=UserOut.model_validate(user))


@router.post("/change-password")
async def change_password(
    body: ChangePasswordRequest, auth: AuthDep, request: Request, db: DbDep
) -> ApiResponse[None]:
    session, user = auth
    await auth_service.change_password(
        db,
        user=user,
        session=session,
        old_password=body.old_password,
        new_password=body.new_password,
        ip=client_ip(request),
    )
    return ApiResponse()
