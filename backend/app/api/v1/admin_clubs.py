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

from collections import Counter
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
from app.models import Club, ClubMember, File, PasswordHistory, Session, User
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
from app.services import files as file_service

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


# ---- 強制刪除:照 FK 圖把社團底下的資料一路刪掉 ----

# 顯示詞(確認框與 409 訊息);沒列到的印表名 —— 會過期,但過期只是少一個中文詞,不會說錯
_TABLE_LABELS = {
    "activities": "活動",
    "announcements": "公告",
    "club_members": "社員名單",
    "equipment_loans": "器材借用",
    "eval_adjustments": "評鑑調整",
    "eval_group_clubs": "評鑑分組",
    "eval_uploads": "評鑑上傳",
    "files": "檔案",
    "maintenance_requests": "空間報修",
    "officer_certificates": "幹部證明",
    "postal_account_changes": "郵局帳戶異動",
    "review_scores": "評審評分",
    "room_booking_requests": "固定場地借用",
    "session_attendance": "報名簽到",
    "signup_drafts": "報名草稿",
    "signups": "線上報名",
    "venue_bookings": "臨時場地借用",
    "violations": "違規勸導",
}
# 不列進擋刪清單的直接子表:
# - users:社團帳號一律隨社團刪除(建錯了刪掉時不該因為「有帳號」就要求強制)
# - announcement_dismissals:蓋板公告的「不再顯示」勾選,是個人偏好不是社團的資料
_NOT_LISTED = frozenset({"users", "announcement_dismissals"})
_MAX_DEPTH = 8  # FK 圖的深度上限(現況最深 3:clubs → activities → venue_bookings);防自我參照打轉


def _label(table: str) -> str:
    return _TABLE_LABELS.get(table, table)


async def _fk_children(
    db, table: str, kinds: tuple[str, ...] = ("a", "r")
) -> list[tuple[str, str, str]]:
    """`table` 的子表:(子表, 子表欄, 被指到的欄)。單欄 FK 才算。

    `kinds` 是 `confdeltype`:預設只取 NO ACTION/RESTRICT —— **擋得下 DELETE 的就是這些**,
    要一路刪的也只有這些。數「會一起消失的資料」時另外加上 CASCADE(`c`):那些列 DB 會自己
    刪掉,不數就會無聲消失。SET NULL(`n`)兩種場合都不取 —— 那種列會留著,只是指標被清空。
    (現況 `clubs` 底下沒有 SET NULL 的 FK,唯一一個是 `audit_logs.user_id`,而帳號那棵樹
    本來就不走 —— 見 `delete_club`。)
    """
    rows = await db.execute(
        sa.text("""
            SELECT c.conrelid::regclass::text, a.attname, af.attname
            FROM pg_constraint c
            JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
            JOIN pg_attribute af ON af.attrelid = c.confrelid AND af.attnum = c.confkey[1]
            WHERE c.contype = 'f'
              AND c.confrelid = CAST(:t AS regclass)
              AND c.confdeltype::text = ANY(:kinds)
              AND array_length(c.conkey, 1) = 1
            ORDER BY 1
        """),
        {"t": table, "kinds": list(kinds)},
    )
    return [(child, col, ref) for child, col, ref in rows]


async def _club_data_counts(db, club_id: int) -> dict[str, int]:
    """社團**直接**掛著的資料筆數(擋刪清單)。

    只數第一層:巢狀的子列(結案報告、借用時段…)隨父列一起消失,分開報只會讓確認框變長。
    也因為只數一層,同一批列不會從兩條路徑被數到兩次(器材借用同時掛社團與活動)。
    """
    counts: dict[str, int] = {}
    # 加上 CASCADE:社員名單那種 DB 自己會刪的列,不數就會無聲消失
    for child, col, _ref in await _fk_children(db, "clubs", ("a", "r", "c")):
        if child in _NOT_LISTED:
            continue
        n = await db.scalar(
            sa.text(f"SELECT count(*) FROM {child} WHERE {col} = :v"), {"v": club_id}
        )
        if n:
            counts[child] = n
    return counts


async def _cascade_delete(db, table: str, where: str, params: dict, depth: int = 0) -> Counter:
    """深度優先刪掉 `table WHERE where` 及其底下所有擋著的子列;回傳各表刪除筆數。

    識別字全部來自 pg_catalog,不是使用者輸入。
    """
    if depth > _MAX_DEPTH:
        raise RuntimeError(f"FK 圖超過 {_MAX_DEPTH} 層(疑似自我參照):{table}")
    deleted: Counter = Counter()
    for child, col, ref in await _fk_children(db, table):
        deleted += await _cascade_delete(
            db, child, f"{col} IN (SELECT {ref} FROM {table} WHERE {where})", params, depth + 1
        )
    result = await db.execute(sa.text(f"DELETE FROM {table} WHERE {where}"), params)
    if result.rowcount:
        deleted[table] += result.rowcount
    return deleted


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
        advisor_out_name=club.advisor_out_name,
        advisor_out_dept=club.advisor_out_dept,
        advisor_out_email=club.advisor_out_email,
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

    if "en_name" in fields:
        # 空白=沒填,存 NULL:同一欄不要同時存在 NULL 與 ''(遷移進來的是 NULL,
        # 而首頁導覽那類「有英文名的社團」查詢會以 IS NOT NULL 篩)
        en_name = fields["en_name"].strip() or None
        if en_name != club.en_name:
            changes.append("en_name")
            club.en_name = en_name

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
    force: bool = Query(False),
) -> ApiResponse[None]:
    """刪除社團主檔(連同社團帳號)。

    社團底下還有資料就先回 `CLUB_HAS_DATA`(訊息列出各類筆數),由呼叫端二次確認後帶
    `force=true` 再送;強制刪除會照 FK 圖把那些資料一路刪掉(檔案連同磁碟上的實體檔),
    **不可復原**。稽核 `club_deleted` 記下每一類刪了幾列。

    留下來的是刻意的:`audit_logs`(SET NULL)與 `approval_records`(靠 subject_id 對應、
    沒有 FK)—— 誰做過什麼、誰簽過什麼不隨對象消失。
    """
    club = await _club_or_404(db, club_id)
    counts = await _club_data_counts(db, club_id)
    if counts and not force:
        # 訊息帶筆數:確認框要講得出「一併刪掉的是什麼、多少筆」,不然沒人知道自己按掉了什麼
        listed = "、".join(f"{_label(t)} {n}" for t, n in counts.items())
        raise conflict(f"此社團仍有 {listed}", code="CLUB_HAS_DATA")

    account = await _club_account(db, club_id)
    # 檔案的實體檔在 commit 成功後才刪(反過來 rollback 會留下「DB 有列、磁碟無檔」)
    paths = list(
        await db.scalars(
            sa.select(File.path).where(
                File.club_id == club_id
                if account is None
                else sa.or_(File.club_id == club_id, File.uploaded_by == account.id)
            )
        )
    )
    params = {"club_id": club_id}
    # 先把這社的活動照 id 鎖起來,再走 FK 圖。**這是鎖序,不是防並發**:
    # `activity_service.purge`(刪單一活動)是先鎖 activities 再改借用單的 activity_id,
    # 這裡照 FK 圖走卻是先刪借用單、最後才刪 activities —— 兩條路徑並發就是
    # 一邊持活動等借用、一邊持借用等活動,PG 砍掉其中一個回 500(decisions.md D-39)
    await db.execute(
        sa.text("SELECT id FROM activities WHERE club_id = :club_id ORDER BY id FOR UPDATE"),
        params,
    )
    try:
        deleted: Counter = Counter()
        for child, col, ref in await _fk_children(db, "clubs"):
            if child in _NOT_LISTED:
                continue
            deleted += await _cascade_delete(
                db, child, f"{col} IN (SELECT {ref} FROM clubs WHERE id = :club_id)", params
            )
        # 帳號自己不走 FK 圖:從帳號往下追到的是「這個人碰過的東西」,那不等於「這個社團的
        # 東西」—— 真有跨社團的列就讓它撞 FK(回 409),不要順手刪掉別人的資料。
        # 社團自己的資料已在上面清掉,正常情況這一刀不會有東西擋
        for table, col in (("users", "club_id"), ("clubs", "id")):
            result = await db.execute(
                sa.text(f"DELETE FROM {table} WHERE {col} = :club_id"), params
            )
            if result.rowcount:
                deleted[table] += result.rowcount
    except IntegrityError:
        # 走漏的 FK(多欄、指到非主鍵的欄、或跨社團的列)——刪不掉就照實說,不留下刪一半的社團
        await db.rollback()
        raise conflict("此社團有無法一併刪除的資料，請改用停用") from None

    detail = f"club={club.id};name={club.name};force={force}"
    if account is not None:
        detail += f";username={account.username}"
    # DB 自己 CASCADE 掉的列(社員名單)不進 rowcount,拿刪除前數到的補上 —— 稽核要記的是
    # 「這次刪掉了什麼」,不是「哪幾刀是我們自己下的」
    summary = dict(deleted)
    for table, n in counts.items():
        summary.setdefault(table, n)
    rows = ";".join(f"{t}={n}" for t, n in sorted(summary.items()) if t != "clubs")
    if rows:
        detail += ";" + rows
    audit.record(db, action="club_deleted", user=user, detail=detail, ip=client_ip(request))
    await db.commit()
    file_service.unlink_all(paths)  # commit 成功後才動磁碟
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
