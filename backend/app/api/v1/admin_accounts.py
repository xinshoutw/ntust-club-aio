"""行政端:帳號管理(/admin/accounts,僅 super;2026-07-16 第八輪)。

- 三類角色:管理員/工讀生/評審(社團帳號在「社團管理 > 管理項目」)
- 建立與重設密碼:後端以密碼政策產生器產一次性密碼,僅該次 response 回傳明文,
  存 argon2id,must_change_password=true 首登強制改密
- 刪除帳號:稽核紀錄保留(audit_logs.user_id FK ON DELETE SET NULL);
  已有其他歷史紀錄(簽核、開單等 FK)者不可刪,改用停權
- 全部記 audit
"""

from typing import Annotated

import sqlalchemy as sa
from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.exc import IntegrityError

from app.api.pagination import Pagination
from app.core.deps import CurrentUser, DbDep, client_ip, require_super
from app.core.errors import conflict, not_found, validation_error
from app.core.security import generate_password, hash_password
from app.models import PasswordHistory, Session, User
from app.models.enums import UserRole
from app.schemas.accounts import (
    AccountCreatedOut,
    AccountCreateIn,
    AccountOut,
    ActiveIn,
    ManagedRole,
    PasswordResetOut,
    PermissionsIn,
)
from app.schemas.common import ApiResponse
from app.services import audit

router = APIRouter(prefix="/admin/accounts", tags=["admin"])

SuperAdmin = Annotated[CurrentUser, Depends(require_super)]

_MANAGED_ROLES = {UserRole.ADMIN, UserRole.STAFF, UserRole.VIEWER}


async def _managed_account(db, account_id: int) -> User:
    target = await db.get(User, account_id)
    if target is None or target.role not in _MANAGED_ROLES:
        raise not_found("找不到帳號")
    return target


def _guard_target(user: User, target: User, action: str) -> None:
    if target.id == user.id:
        raise conflict(f"不可{action}自己的帳號")
    if target.is_super:
        raise conflict(f"不可{action}最高權限帳號")


@router.get("")
async def list_accounts(
    user: SuperAdmin,
    db: DbDep,
    page: Pagination,
    role: Annotated[ManagedRole | None, Query()] = None,
) -> ApiResponse[list[AccountOut]]:
    query = sa.select(User).where(User.role.in_(_MANAGED_ROLES)).order_by(User.id)
    if role:
        query = query.where(User.role == UserRole(role))
    total = await db.scalar(sa.select(sa.func.count()).select_from(query.subquery()))
    rows = await db.scalars(query.offset(page.offset).limit(page.page_size))
    return ApiResponse(
        data=[AccountOut.model_validate(u) for u in rows], meta=page.meta(total or 0)
    )


@router.post("", status_code=201)
async def create_account(
    body: AccountCreateIn, user: SuperAdmin, db: DbDep, request: Request
) -> ApiResponse[AccountCreatedOut]:
    exists = await db.scalar(sa.select(User.id).where(User.username == body.username))
    if exists:
        raise conflict("此帳號已存在")
    if body.permissions and body.role != "admin":
        raise validation_error("僅管理員帳號可設定頁面權限")

    password = generate_password()
    target = User(
        role=UserRole(body.role),
        username=body.username,
        password_hash=hash_password(password),
        name=body.name,
        email=body.email,
        is_super=False,  # 最高權限不開放由 API 建立
        permissions=body.permissions,
        can_view_eval=body.role == "viewer",  # 評審帳號預設可看評鑑資料
        must_change_password=True,  # 首登強制改密
    )
    db.add(target)
    await db.flush()
    audit.record(
        db,
        action="account_created",
        user=user,
        detail=f"account={target.id};username={target.username};role={body.role}",
        ip=client_ip(request),
    )
    await db.commit()
    await db.refresh(target)
    # 明文密碼僅此回應;之後只能重設
    out = AccountCreatedOut(**AccountOut.model_validate(target).model_dump(), password=password)
    return ApiResponse(data=out)


@router.delete("/{account_id}")
async def delete_account(
    account_id: int, user: SuperAdmin, db: DbDep, request: Request
) -> ApiResponse[None]:
    target = await _managed_account(db, account_id)
    _guard_target(user, target, "刪除")

    username = target.username
    audit.record(
        db,
        action="account_deleted",
        user=user,
        detail=f"account={target.id};username={username};role={target.role.value}",
        ip=client_ip(request),
    )
    await db.delete(target)
    try:
        await db.commit()
    except IntegrityError:
        # 有簽核/開單等歷史紀錄的帳號受 FK 保護,不可刪(稽核紀錄本身已 SET NULL 保留)
        await db.rollback()
        raise conflict("此帳號已有歷史紀錄,無法刪除;請改用停權") from None
    return ApiResponse()


@router.put("/{account_id}/active")
async def set_active(
    account_id: int, body: ActiveIn, user: SuperAdmin, db: DbDep, request: Request
) -> ApiResponse[AccountOut]:
    target = await _managed_account(db, account_id)
    _guard_target(user, target, "停權" if not body.is_active else "變更")

    target.is_active = body.is_active
    if not body.is_active:
        # 停權立即生效:撤銷所有 session
        await db.execute(sa.delete(Session).where(Session.user_id == target.id))
    audit.record(
        db,
        action="account_suspended" if not body.is_active else "account_restored",
        user=user,
        detail=f"account={target.id};username={target.username}",
        ip=client_ip(request),
    )
    await db.commit()
    return ApiResponse(data=AccountOut.model_validate(target))


@router.post("/{account_id}/reset-password")
async def reset_password(
    account_id: int, user: SuperAdmin, db: DbDep, request: Request
) -> ApiResponse[PasswordResetOut]:
    target = await _managed_account(db, account_id)
    if target.id == user.id:
        raise conflict("請由「變更密碼」修改自己的密碼")

    password = generate_password()
    if target.password_hash:
        db.add(PasswordHistory(user_id=target.id, password_hash=target.password_hash))
    target.password_hash = hash_password(password)
    target.must_change_password = True  # 首登強制改密
    target.failed_login_attempts = 0
    target.locked_until = None
    # 重設後撤銷所有既有 session
    await db.execute(sa.delete(Session).where(Session.user_id == target.id))
    audit.record(
        db,
        action="account_password_reset",
        user=user,
        detail=f"account={target.id};username={target.username}",
        ip=client_ip(request),
    )
    await db.commit()
    return ApiResponse(data=PasswordResetOut(password=password))


@router.put("/{account_id}/permissions")
async def set_permissions(
    account_id: int, body: PermissionsIn, user: SuperAdmin, db: DbDep, request: Request
) -> ApiResponse[AccountOut]:
    target = await _managed_account(db, account_id)
    if target.role != UserRole.ADMIN:
        raise validation_error("僅管理員帳號可設定頁面權限")
    if target.is_super:
        raise conflict("最高權限帳號不受頁面權限限制")

    target.permissions = body.permissions
    audit.record(
        db,
        action="account_permissions_updated",
        user=user,
        detail=f"account={target.id};username={target.username};"
        f"permissions={','.join(body.permissions) or '(空)'}",
        ip=client_ip(request),
    )
    await db.commit()
    return ApiResponse(data=AccountOut.model_validate(target))
