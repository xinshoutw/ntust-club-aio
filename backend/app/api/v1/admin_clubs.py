"""行政端:社團主檔管理(/admin/clubs)。

社團總覽 `aclub`、成員列表 `amember`、管理項目 `aclubset` 三頁各一把鍵;
共用的唯讀端點見 `core/permissions` 的 CLUB_LIST/DETAIL/MEMBER_KEYS。寫入一律歸 `aclubset`。

- 列表不分頁(全校社團 <200 筆,供 ClubCascader/管理項目)
- 詳情=社團自管資料唯讀呈現;webhook 只回是否已設定,不回實值
- 行政可改:社團名稱/社團或學會(kind)/英文名/帳號 username/啟停用
- 建立社團帳號(一社一帳號)與重設密碼:一次性密碼(比照 /admin/accounts:
  明碼僅該次回傳、argon2、首登強制改密);入口=帳號管理「社團」分頁與管理項目
- 刪除社團:社員名單可經二次確認連帶刪除(purge_members),其餘任何一筆紀錄一律 409 → 改用停用
- 成員名單唯讀,參數比照社團端 /club/members
"""

from typing import Annotated

import sqlalchemy as sa
from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.exc import IntegrityError

from app.api.pagination import Pagination, parse_sort
from app.api.v1.members import _DEFAULT_ORDER as _MEMBER_DEFAULT_ORDER
from app.api.v1.members import _SORTABLE as _MEMBER_SORTABLE
from app.core import permissions
from app.core.deps import CurrentUser, DbDep, client_ip, require_permission, require_role
from app.core.errors import conflict, not_found
from app.core.security import generate_password, hash_password_async
from app.models import Club, ClubMember, PasswordHistory, Session, User
from app.models.enums import ClubKind, MemberKind, UserRole
from app.schemas.accounts import PasswordResetOut
from app.schemas.admin import (
    AdminClubCreate,
    AdminClubDetailOut,
    AdminClubOut,
    AdminClubUpdate,
    ClubAccountCreatedOut,
    ClubAccountCreateIn,
    ClubOptionOut,
)
from app.schemas.clubs import MemberOut
from app.schemas.common import ApiResponse
from app.services import audit

router = APIRouter(prefix="/admin/clubs", tags=["admin"])

# 社團三頁(總覽/成員列表/管理項目)各自一把鍵,唯讀資料共享
ClubReader = Annotated[CurrentUser, Depends(require_permission(*permissions.CLUB_DETAIL_KEYS))]
ClubLister = Annotated[CurrentUser, Depends(require_permission(*permissions.CLUB_LIST_KEYS))]
# 寫入一律歸「管理項目」;重設社團密碼同此關(decisions.md ISS-25)
ClubSettingAdmin = Annotated[CurrentUser, Depends(require_permission("aclubset"))]
MemberReader = Annotated[CurrentUser, Depends(require_permission(*permissions.CLUB_MEMBER_KEYS))]
# 最小社團選項對「任何管理員」開放(公告/行政分審核等獨立權限頁也要選社團)
AnyAdmin = Annotated[CurrentUser, Depends(require_role(UserRole.ADMIN))]


def derive_kind(name: str) -> ClubKind | None:
    """名稱結尾推導 社團/學會;推導不到回 None(由呼叫端手動指定或沿用)。

    取代原「社團名稱必須以社/會結尾」強制規則。
    """
    if name.endswith("社"):
        return ClubKind.CLUB
    if name.endswith("會"):
        return ClubKind.ASSOCIATION
    return None


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
        kind=club.kind.value,
        attribute=club.attribute.value if club.attribute else None,
        username=account.username if account else None,
        is_active=club.is_active,
        suspended_until=club.suspended_until,
        en_name=club.en_name,
        intro=club.intro,
        website_url=club.website_url,
        contact_emails=club.contact_emails or [],
        discord_webhook_set=bool(club.discord_webhook_url),  # 不回傳實值
        advisor_name=club.advisor_name,
        advisor_dept=club.advisor_dept,
        advisor_email=club.advisor_email,
        advisor_phone=club.advisor_phone,
        advisor_out_name=club.advisor_out_name,
        advisor_out_dept=club.advisor_out_dept,
        advisor_out_email=club.advisor_out_email,
        advisor_out_phone=club.advisor_out_phone,
        suspend_reason=club.suspend_reason,
    )


@router.get("")
async def list_clubs(user: ClubLister, db: DbDep) -> ApiResponse[list[AdminClubOut]]:
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
            kind=club.kind.value,
            attribute=club.attribute.value if club.attribute else None,
            username=username,
            is_active=club.is_active,
            suspended_until=club.suspended_until,
        )
        for club, username in rows
    ]
    return ApiResponse(data=data)


@router.post("", status_code=201)
async def create_club(
    body: AdminClubCreate, user: ClubSettingAdmin, db: DbDep, request: Request
) -> ApiResponse[AdminClubDetailOut]:
    """新增社團主檔(帳號管理「社團」分頁);登入用的帳號另走 `POST /{id}/account`。"""
    if await db.scalar(sa.select(Club.id).where(Club.name == body.name)):
        raise conflict("此社團名稱已存在")
    # 名稱結尾推不出社/會就先當社團:kind 只決定負責人顯示詞,管理項目改得動。
    # 判 `is None` 不用 `or` —— 後者靠的是 ClubKind 成員值剛好都 truthy
    derived = derive_kind(body.name)
    club = Club(
        name=body.name,
        kind=ClubKind.CLUB if derived is None else derived,
        attribute=body.attribute,
    )
    db.add(club)
    try:
        await db.flush()
    except IntegrityError:
        # 唯一檢查與 INSERT 之間的並發窗口:撞 clubs.name 唯一索引 → 409
        await db.rollback()
        raise conflict("此社團名稱已存在") from None
    audit.record(
        db,
        action="club_created",
        user=user,
        # kind 一併記:它是這支端點唯一用猜的欄位,事後查「為什麼是社團不是學會」要看得到
        detail=(
            f"club={club.id};name={club.name}"
            f";kind={club.kind.value};attribute={club.attribute.value}"
        ),
        ip=client_ip(request),
    )
    await db.commit()
    return ApiResponse(data=_detail_out(club, None))


@router.get("/options")
async def club_options(user: AnyAdmin, db: DbDep) -> ApiResponse[list[ClubOptionOut]]:
    """最小社團選項(僅 id/name/attribute):任何管理員可讀,供跨頁社團選擇器。

    不得為此放寬含帳號、停權等敏感欄位的完整主檔(list_clubs 仍限 CLUB_LIST_KEYS)。
    """
    rows = await db.scalars(sa.select(Club).order_by(Club.attribute, Club.name, Club.id))
    return ApiResponse(
        data=[
            ClubOptionOut(
                id=c.id,
                name=c.name,
                kind=c.kind.value,
                attribute=c.attribute.value if c.attribute else None,
                is_active=c.is_active,
            )
            for c in rows
        ]
    )


@router.get("/{club_id}")
async def get_club(club_id: int, user: ClubReader, db: DbDep) -> ApiResponse[AdminClubDetailOut]:
    club = await _club_or_404(db, club_id)
    return ApiResponse(data=_detail_out(club, await _club_account(db, club_id)))


@router.patch("/{club_id}")
async def update_club(
    club_id: int, body: AdminClubUpdate, user: ClubSettingAdmin, db: DbDep, request: Request
) -> ApiResponse[AdminClubDetailOut]:
    club = await _club_or_404(db, club_id)
    account = await _club_account(db, club_id)
    # 顯式 null 視同未提供(三欄皆不可清空)
    fields = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    changes: list[str] = []

    if "name" in fields and fields["name"] != club.name:
        name = fields["name"]
        dup = await db.scalar(sa.select(Club.id).where(Club.name == name, Club.id != club.id))
        if dup:
            raise conflict("此社團名稱已存在")
        changes.append(f"name:{club.name}→{name}")
        club.name = name
        # 改名自動推導 社團/學會;推導不到沿用原值(可用 kind 欄手動指定)
        derived = derive_kind(name)
        if derived is not None and "kind" not in fields:
            fields["kind"] = derived

    if "kind" in fields and fields["kind"] != club.kind:
        changes.append(f"kind:{club.kind.value}→{fields['kind'].value}")
        club.kind = fields["kind"]

    if "attribute" in fields and fields["attribute"] != club.attribute:
        before = club.attribute.value if club.attribute else "—"
        changes.append(f"attribute:{before}→{fields['attribute'].value}")
        club.attribute = fields["attribute"]

    if "en_name" in fields and fields["en_name"] != club.en_name:
        changes.append("en_name")
        club.en_name = fields["en_name"]

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


@router.delete("/{club_id}")
async def delete_club(
    club_id: int,
    user: ClubSettingAdmin,
    db: DbDep,
    request: Request,
    purge_members: bool = Query(False),
) -> ApiResponse[None]:
    """刪除社團主檔(連同社團帳號)。

    活動、借用、申請等任何一筆紀錄都會被 FK 擋下 → 409,那些社團只能停用。
    社員名單是唯一可以連帶刪除的:`club_members` 是 ON DELETE CASCADE,FK 擋不住,
    所以先數出來回 `CLUB_HAS_MEMBERS`,由呼叫端二次確認後帶 `purge_members=true` 再送。
    """
    club = await _club_or_404(db, club_id)
    members = await db.scalar(
        sa.select(sa.func.count()).select_from(ClubMember).where(ClubMember.club_id == club_id)
    )
    if members and not purge_members:
        # 訊息帶筆數:確認框要講得出「一併刪掉的是多少人」,不然沒人知道自己按掉了什麼
        raise conflict(f"此社團仍有 {members} 筆社員名單", code="CLUB_HAS_MEMBERS")

    account = await _club_account(db, club_id)
    detail = f"club={club.id};name={club.name};members_purged={members or 0}"
    if account is not None:
        detail += f";username={account.username}"
        await db.delete(account)
        # 先送出帳號的 DELETE:ORM 的刪除排序看的是 relationship,User 與 Club 之間沒有,
        # 不自己 flush 的話 clubs 會先被刪,撞 fk_users_club_id_clubs
        await db.flush()
    audit.record(db, action="club_deleted", user=user, detail=detail, ip=client_ip(request))
    await db.delete(club)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise conflict("此社團已有活動或借用等紀錄，無法刪除。請改用停用") from None
    return ApiResponse()


@router.post("/{club_id}/account", status_code=201)
async def create_club_account(
    club_id: int, body: ClubAccountCreateIn, user: ClubSettingAdmin, db: DbDep, request: Request
) -> ApiResponse[ClubAccountCreatedOut]:
    """建立社團帳號(一社一帳號):產生一次性密碼,首登強制改密。

    帳號啟停與社團主檔同步:停用中社團補建的帳號同樣是停用狀態。
    """
    # 鎖社團列再驗「尚無帳號」:並發重複建立會在此序列化,後到者見到新帳號 → 409
    club = await db.scalar(sa.select(Club).where(Club.id == club_id).with_for_update())
    if club is None:
        raise not_found("找不到社團")
    if await _club_account(db, club_id) is not None:
        raise conflict("該社團已建立帳號")
    exists = await db.scalar(sa.select(User.id).where(User.username == body.username))
    if exists:
        raise conflict("此帳號已存在")

    password = generate_password()
    account = User(
        role=UserRole.CLUB,
        username=body.username,
        password_hash=await hash_password_async(password),
        name=club.name,
        club_id=club.id,
        must_change_password=True,  # 首登強制改密
        is_active=club.is_active,  # 跟隨社團啟停狀態
    )
    db.add(account)
    try:
        await db.flush()
    except IntegrityError:
        # username 唯一檢查與 INSERT 之間的並發窗口:撞 uq_users_username → 409
        await db.rollback()
        raise conflict("此帳號已存在") from None
    audit.record(
        db,
        action="club_account_created",
        user=user,
        detail=f"club={club.id};account={account.id};username={account.username}",
        ip=client_ip(request),
    )
    await db.commit()
    # 明文密碼僅此回應;之後只能重設
    return ApiResponse(data=ClubAccountCreatedOut(username=account.username, password=password))


@router.post("/{club_id}/reset-password")
async def reset_club_password(
    club_id: int, user: ClubSettingAdmin, db: DbDep, request: Request
) -> ApiResponse[PasswordResetOut]:
    await _club_or_404(db, club_id)
    account = await _club_account(db, club_id)
    if account is None:
        raise conflict("該社團尚未建立帳號")

    password = generate_password()
    if account.password_hash:
        db.add(PasswordHistory(user_id=account.id, password_hash=account.password_hash))
    account.password_hash = await hash_password_async(password)
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


@router.get("/{club_id}/members/semesters")
async def list_club_member_semesters(
    club_id: int, user: MemberReader, db: DbDep
) -> ApiResponse[list[str]]:
    """該社名單有資料的學期(新到舊),供學期下拉(比照社團端 /club/members/semesters)。"""
    await _club_or_404(db, club_id)
    rows = await db.scalars(
        sa.select(sa.distinct(ClubMember.semester))
        .where(ClubMember.club_id == club_id)
        .order_by(ClubMember.semester.desc())
    )
    return ApiResponse(data=list(rows))


@router.get("/{club_id}/members")
async def list_club_members(
    club_id: int,
    user: MemberReader,
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
    # 固定 id tiebreak(同社團端成員列表:非唯一排序鍵下分頁才穩定)
    query = query.order_by(
        *parse_sort(sort, _MEMBER_SORTABLE, _MEMBER_DEFAULT_ORDER), ClubMember.id.asc()
    )

    total = await db.scalar(sa.select(sa.func.count()).select_from(query.subquery()))
    rows = await db.scalars(query.offset(page.offset).limit(page.page_size))
    return ApiResponse(
        data=[MemberOut.model_validate(m) for m in rows], meta=page.meta(total or 0)
    )
