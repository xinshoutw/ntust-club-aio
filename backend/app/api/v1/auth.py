import secrets

from fastapi import APIRouter, Request, Response

from app.core import permissions
from app.core.deps import (
    CSRF_COOKIE,
    CSRF_HEADER,
    SESSION_COOKIE,
    AuthDep,
    DbDep,
    client_ip,
    set_auth_cookies,
)
from app.core.errors import AppError, forbidden, rate_limited
from app.core.rate_limit import login_limiter
from app.models import Club, User
from app.models.enums import UserRole
from app.schemas.auth import AdminPageOut, ChangePasswordRequest, LoginRequest, PeriodOut, UserOut
from app.schemas.common import ApiResponse
from app.services import auth as auth_service
from app.services import booking_service

router = APIRouter(prefix="/auth", tags=["auth"])


async def _user_out(db: DbDep, user: User) -> UserOut:
    out = UserOut.model_validate(user)
    out.periods = [PeriodOut(**p) for p in booking_service.period_catalogue()]
    if user.role == UserRole.ADMIN:
        out.admin_pages = [AdminPageOut(**p) for p in permissions.catalogue()]
    if user.club_id is not None:
        club = await db.get(Club, user.club_id)
        out.club_name = club.name if club else None
        out.club_kind = club.kind.value if club else None
    return out

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
    set_auth_cookies(response, str(session.id), session.csrf_token)
    return ApiResponse(data=await _user_out(db, user))


@router.post("/logout")
async def logout(
    auth: AuthDep, request: Request, response: Response, db: DbDep
) -> ApiResponse[None]:
    session, user = auth
    await auth_service.logout(db, session, user, client_ip(request))
    response.delete_cookie(SESSION_COOKIE, path="/")
    response.delete_cookie(CSRF_COOKIE, path="/")
    return ApiResponse()


@router.get("/precheck", include_in_schema=False)
async def upload_precheck(auth: AuthDep, request: Request) -> Response:
    """nginx auth_request 子請求(部署層 pre-body 防護):在後端讀取 multipart
    body 前驗證 session/CSRF/首登改密,未通過即拒絕、暫存檔不落地。
    子請求為 GET(get_auth 不驗 CSRF),但原請求是上傳,故此處一律驗。"""
    session, user = auth
    token = request.headers.get(CSRF_HEADER, "")
    if not token or not secrets.compare_digest(token, session.csrf_token):
        raise forbidden("CSRF 驗證失敗,請重新整理頁面", code="CSRF_FAILED")
    if user.must_change_password:
        raise forbidden("首次登入請先變更密碼", code="PASSWORD_CHANGE_REQUIRED")
    return Response(status_code=204)


@router.get("/me")
async def me(auth: AuthDep, db: DbDep) -> ApiResponse[UserOut]:
    # 首登未改密也可查自己(前端靠 must_change_password 導向改密頁)
    _, user = auth
    return ApiResponse(data=await _user_out(db, user))


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
