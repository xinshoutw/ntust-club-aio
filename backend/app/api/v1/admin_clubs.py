"""行政端:社團主檔管理(/admin/clubs,權限鍵 amember)。

- 列表不分頁(全校社團 <200 筆,供 ClubCascader/管理項目)
- 詳情=社團自管資料唯讀呈現;webhook 只回是否已設定,不回實值
- 行政可改:社團名稱(必須以「社」或「會」結尾)/帳號 username/啟停用
- 重設密碼:一次性密碼(比照 /admin/accounts:明碼僅該次回傳、argon2、首登強制改密)
- 成員名單唯讀,參數比照社團端 /club/members
"""

from typing import Annotated

import sqlalchemy as sa
from fastapi import APIRouter, Depends, Query, Request

from app.api.pagination import Pagination, parse_sort
from app.core.deps import CurrentUser, DbDep, client_ip, require_permission, require_role
from app.core.errors import conflict, not_found, validation_error
from app.core.security import generate_password, hash_password
from app.models import Club, ClubMember, PasswordHistory, Session, User
from app.models.enums import MemberKind, UserRole
from app.schemas.accounts import PasswordResetOut
from app.schemas.admin import AdminClubDetailOut, AdminClubOut, AdminClubUpdate, ClubOptionOut
from app.schemas.clubs import MemberOut
from app.schemas.common import ApiResponse
from app.services import audit

router = APIRouter(prefix="/admin/clubs", tags=["admin"])

ClubAdmin = Annotated[CurrentUser, Depends(require_permission("amember"))]
# 最小社團選項對「任何管理員」開放(公告/行政分審核等獨立權限頁也要選社團)
AnyAdmin = Annotated[CurrentUser, Depends(require_role(UserRole.ADMIN))]

# 全站強制規定(2026-07-16):社團名稱必須以「社」或「會」結尾
_NAME_SUFFIXES = ("社", "會")

# 成員名單排序白名單(比照社團端 members.py)
_MEMBER_SORTABLE = {
    "name": ClubMember.name,
    "student_id": ClubMember.student_id,
    "kind": ClubMember.kind,
    "title": ClubMember.title,
    "semester": ClubMember.semester,
    "updated_at": ClubMember.updated_at,
}


async def _club_or_404(db, club_id: int) -> Club:
    club = await db.get(Club, club_id)
    if club is None:
        raise not_found("找不到社團")
    return club


async def _club_account(db, club_id: int) -> User | None:
    """社團帳號(一社一帳號);尚未建立時為 None。"""
    return await db.scalar(
        sa.select(User)
        .where(User.club_id == club_id, User.role == UserRole.CLUB)
        .order_by(User.id)
        .limit(1)
    )


def _detail_out(club: Club, account: User | None) -> AdminClubDetailOut:
    return AdminClubDetailOut(
        id=club.id,
        name=club.name,
        attribute=club.attribute.value,
        username=account.username if account else None,
        is_active=club.is_active,
        suspended_until=club.suspended_until,
        intro=club.intro,
        website_url=club.website_url,
        contact_emails=club.contact_emails or [],
        discord_webhook_set=bool(club.discord_webhook_url),  # 不回傳實值
        advisor_name=club.advisor_name,
        advisor_dept=club.advisor_dept,
        advisor_email=club.advisor_email,
        advisor_ext=club.advisor_ext,
        suspend_reason=club.suspend_reason,
    )


@router.get("")
async def list_clubs(user: ClubAdmin, db: DbDep) -> ApiResponse[list[AdminClubOut]]:
    """全部社團(不分頁;全校 <200 筆)。"""
    account = sa.orm.aliased(User)
    rows = await db.execute(
        sa.select(Club, account.username)
        .outerjoin(account, sa.and_(account.club_id == Club.id, account.role == UserRole.CLUB))
        .order_by(Club.attribute, Club.name, Club.id)
    )
    data = [
        AdminClubOut(
            id=club.id,
            name=club.name,
            attribute=club.attribute.value,
            username=username,
            is_active=club.is_active,
            suspended_until=club.suspended_until,
        )
        for club, username in rows
    ]
    return ApiResponse(data=data)


@router.get("/options")
async def club_options(user: AnyAdmin, db: DbDep) -> ApiResponse[list[ClubOptionOut]]:
    """最小社團選項(僅 id/name/attribute):任何管理員可讀,供跨頁社團選擇器。

    不得為此放寬含帳號、停權等敏感欄位的完整主檔(list_clubs 仍限 amember)。
    """
    rows = await db.scalars(sa.select(Club).order_by(Club.attribute, Club.name, Club.id))
    return ApiResponse(
        data=[ClubOptionOut(id=c.id, name=c.name, attribute=c.attribute.value) for c in rows]
    )


@router.get("/{club_id}")
async def get_club(club_id: int, user: ClubAdmin, db: DbDep) -> ApiResponse[AdminClubDetailOut]:
    club = await _club_or_404(db, club_id)
    return ApiResponse(data=_detail_out(club, await _club_account(db, club_id)))


@router.patch("/{club_id}")
async def update_club(
    club_id: int, body: AdminClubUpdate, user: ClubAdmin, db: DbDep, request: Request
) -> ApiResponse[AdminClubDetailOut]:
    club = await _club_or_404(db, club_id)
    account = await _club_account(db, club_id)
    # 顯式 null 視同未提供(三欄皆不可清空)
    fields = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    changes: list[str] = []

    if "name" in fields and fields["name"] != club.name:
        name = fields["name"]
        if not name.endswith(_NAME_SUFFIXES):
            raise validation_error(
                "社團名稱必須以「社」或「會」結尾", code="CLUB_NAME_SUFFIX"
            )
        dup = await db.scalar(sa.select(Club.id).where(Club.name == name, Club.id != club.id))
        if dup:
            raise conflict("此社團名稱已存在")
        changes.append(f"name:{club.name}→{name}")
        club.name = name

    if "username" in fields:
        username = fields["username"]
        if account is None:
            raise conflict("該社團尚未建立帳號")
        if username != account.username:
            dup = await db.scalar(
                sa.select(User.id).where(User.username == username, User.id != account.id)
            )
            if dup:
                raise conflict("此帳號已存在")
            changes.append(f"username:{account.username}→{username}")
            account.username = username

    if "is_active" in fields and fields["is_active"] != club.is_active:
        is_active = fields["is_active"]
        # 社團主檔與帳號同步啟停;停用立即生效(撤銷所有 session)
        club.is_active = is_active
        if account is not None:
            account.is_active = is_active
            if not is_active:
                await db.execute(sa.delete(Session).where(Session.user_id == account.id))
        changes.append(f"is_active:{is_active}")

    if changes:
        audit.record(
            db,
            action="club_updated",
            user=user,
            detail=f"club={club.id};{';'.join(changes)}",
            ip=client_ip(request),
        )
    await db.commit()
    return ApiResponse(data=_detail_out(club, account))


@router.post("/{club_id}/reset-password")
async def reset_club_password(
    club_id: int, user: ClubAdmin, db: DbDep, request: Request
) -> ApiResponse[PasswordResetOut]:
    await _club_or_404(db, club_id)
    account = await _club_account(db, club_id)
    if account is None:
        raise conflict("該社團尚未建立帳號")

    password = generate_password()
    if account.password_hash:
        db.add(PasswordHistory(user_id=account.id, password_hash=account.password_hash))
    account.password_hash = hash_password(password)
    account.must_change_password = True  # 首登強制改密
    account.failed_login_attempts = 0
    account.locked_until = None
    # 重設後撤銷所有既有 session
    await db.execute(sa.delete(Session).where(Session.user_id == account.id))
    audit.record(
        db,
        action="club_password_reset",
        user=user,
        detail=f"club={club_id};account={account.id};username={account.username}",
        ip=client_ip(request),
    )
    await db.commit()
    # 明文密碼僅此回應;之後只能再重設
    return ApiResponse(data=PasswordResetOut(password=password))


@router.get("/{club_id}/members")
async def list_club_members(
    club_id: int,
    user: ClubAdmin,
    db: DbDep,
    page: Pagination,
    semester: str | None = Query(None, pattern=r"^\d{3}-[12]$"),
    kind: Annotated[list[MemberKind] | None, Query()] = None,  # 可重複帶多值(比照 club 端)
    sort: str | None = None,
) -> ApiResponse[list[MemberOut]]:
    """唯讀成員名單(分頁/排序/篩選比照社團端 /club/members)。"""
    await _club_or_404(db, club_id)
    query = sa.select(ClubMember).where(ClubMember.club_id == club_id)
    if semester:
        query = query.where(ClubMember.semester == semester)
    if kind:
        query = query.where(ClubMember.kind.in_(kind))
    query = query.order_by(*parse_sort(sort, _MEMBER_SORTABLE, ClubMember.id.asc()))

    total = await db.scalar(sa.select(sa.func.count()).select_from(query.subquery()))
    rows = await db.scalars(query.offset(page.offset).limit(page.page_size))
    return ApiResponse(
        data=[MemberOut.model_validate(m) for m in rows], meta=page.meta(total or 0)
    )
