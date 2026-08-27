"""社團端:成員列表(CRUD + CSV 匯入)。

- 名單按學期各自一份快照(club_members.semester);同學號可跨學期出現
- CSV 格式:姓名,學號,身份[,職稱[,電話]];身份=社員/幹部/負責人/副負責人
  (也接受顯示詞 社長/會長/副社長/副會長,映射為標準身份)
- 職稱:幹部必填,其他身份選填(2026-07-21 放寬)
"""

import csv
import io
from typing import Annotated

import sqlalchemy as sa
from fastapi import APIRouter, Query, Request

from app.api.pagination import Pagination, parse_sort
from app.core.deps import ClubUser, DbDep, client_ip
from app.core.errors import conflict, not_found, validation_error
from app.models import ClubMember
from app.models.enums import MemberKind
from app.schemas.clubs import (
    MemberImportRequest,
    MemberImportResult,
    MemberIn,
    MemberOut,
    MemberUpdate,
)
from app.schemas.common import ApiResponse
from app.services import audit

router = APIRouter(prefix="/club/members", tags=["club"])

# 身份權重:負責人 → 副負責人 → 幹部 → 社員(kind 排序鍵與預設排序共用;
# admin_clubs 的 /admin/clubs/{id}/members 亦引用,兩端點同一實作)
_KIND_WEIGHT = sa.case(
    (ClubMember.kind == MemberKind.PRESIDENT, 0),
    (ClubMember.kind == MemberKind.VICE_PRESIDENT, 1),
    (ClubMember.kind == MemberKind.OFFICER, 2),
    else_=3,
)

_SORTABLE = {
    "name": ClubMember.name,
    "student_id": ClubMember.student_id,
    "kind": _KIND_WEIGHT,
    "title": ClubMember.title,
    "semester": ClubMember.semester,
    "created_at": ClubMember.created_at,
    "updated_at": ClubMember.updated_at,
}

# 預設排序:身份權重升冪(負責人在前),同權重依學號
_DEFAULT_ORDER = (_KIND_WEIGHT.asc(), ClubMember.student_id.asc())

# 匯入「身份」欄:顯示詞映射為標準身份(社長/會長→負責人;副社長/副會長→副負責人)
# 匯入稽核最多列幾個學號(名單動輒上百人,全列進去會把稽核表格撐爆)
_AUDIT_ID_LIMIT = 10

_KIND_ALIASES = {
    "社員": MemberKind.MEMBER,
    "幹部": MemberKind.OFFICER,
    "負責人": MemberKind.PRESIDENT,
    "社長": MemberKind.PRESIDENT,
    "會長": MemberKind.PRESIDENT,
    "副負責人": MemberKind.VICE_PRESIDENT,
    "副社長": MemberKind.VICE_PRESIDENT,
    "副會長": MemberKind.VICE_PRESIDENT,
}


def _audit(
    db: DbDep, request: Request, user, action: str, member: ClubMember, extra: str = ""
) -> None:
    """名單被清空時要查得出是誰、動到誰,所以連學號姓名一起記。"""
    detail = f"member={member.id};{member.semester};{member.student_id};{member.name}"
    audit.record(
        db, action=action, user=user, detail=f"{detail};{extra}" if extra else detail,
        ip=client_ip(request),
    )


def _unneutralize(cell: str) -> str:
    """還原匯出端的公式中和(見 lib/csv.ts 的 neutralizeFormula)。"""
    return cell[1:] if cell[:1] == "'" and cell[1:2] in "=+-@\t\r" else cell


def _validate_member(kind: MemberKind, title: str | None) -> str | None:
    if kind == MemberKind.OFFICER and not title:
        raise validation_error("幹部必須填寫職稱")
    return title or None  # 幹部必填,其他身份選填


@router.get("")
async def list_members(
    user: ClubUser,
    db: DbDep,
    page: Pagination,
    semester: str | None = Query(None, pattern=r"^\d{3}-[12]$"),
    kind: Annotated[list[MemberKind] | None, Query()] = None,  # 可重複帶多值(前端多選篩選)
    sort: str | None = None,
) -> ApiResponse[list[MemberOut]]:
    query = sa.select(ClubMember).where(ClubMember.club_id == user.club_id)
    if semester:
        query = query.where(ClubMember.semester == semester)
    if kind:
        query = query.where(ClubMember.kind.in_(kind))
    # 固定 id tiebreak:kind/student_id 皆非唯一(同學號可跨學期),無穩定全序時
    # 分頁與 CSV 匯出的逐頁抓取會在頁界重複/漏列
    query = query.order_by(*parse_sort(sort, _SORTABLE, _DEFAULT_ORDER), ClubMember.id.asc())

    total = await db.scalar(sa.select(sa.func.count()).select_from(query.subquery()))
    rows = await db.scalars(query.offset(page.offset).limit(page.page_size))
    return ApiResponse(
        data=[MemberOut.model_validate(m) for m in rows], meta=page.meta(total or 0)
    )


@router.get("/semesters")
async def list_semesters(user: ClubUser, db: DbDep) -> ApiResponse[list[str]]:
    """名單有資料的學期(新到舊),供學期下拉。"""
    rows = await db.scalars(
        sa.select(sa.distinct(ClubMember.semester))
        .where(ClubMember.club_id == user.club_id)
        .order_by(ClubMember.semester.desc())
    )
    return ApiResponse(data=list(rows))


@router.post("", status_code=201)
async def create_member(
    body: MemberIn, user: ClubUser, db: DbDep, request: Request
) -> ApiResponse[MemberOut]:
    title = _validate_member(body.kind, body.title)
    exists = await db.scalar(
        sa.select(ClubMember.id).where(
            ClubMember.club_id == user.club_id,
            ClubMember.student_id == body.student_id,
            ClubMember.semester == body.semester,
        )
    )
    if exists:
        raise conflict("該學號已在該學期名單中")
    member = ClubMember(
        club_id=user.club_id,
        name=body.name,
        student_id=body.student_id,
        kind=body.kind,
        title=title,
        semester=body.semester,
    )
    db.add(member)
    await db.flush()
    _audit(db, request, user, "member_created", member)
    await db.commit()
    await db.refresh(member)
    return ApiResponse(data=MemberOut.model_validate(member))


async def _own_member(db: DbDep, user, member_id: int) -> ClubMember:
    member = await db.get(ClubMember, member_id)
    if member is None or member.club_id != user.club_id:
        raise not_found("找不到成員")
    return member


@router.patch("/{member_id}")
async def update_member(
    member_id: int, body: MemberUpdate, user: ClubUser, db: DbDep, request: Request
) -> ApiResponse[MemberOut]:
    member = await _own_member(db, user, member_id)
    # 行內編輯自動儲存會把整列原封送回;不濾掉未變值,下面的重複學號檢查會查到自己而 409
    changed = {
        field: value
        for field, value in body.model_dump(exclude_unset=True).items()
        if getattr(member, field) != value
    }
    if "student_id" in changed:
        dup = await db.scalar(
            sa.select(ClubMember.id).where(
                ClubMember.club_id == user.club_id,
                ClubMember.student_id == changed["student_id"],
                ClubMember.semester == member.semester,
            )
        )
        if dup:
            raise conflict("該學號已在該學期名單中")
    for field, value in changed.items():
        setattr(member, field, value)
    normalized = _validate_member(member.kind, member.title)
    if normalized != member.title:  # 空職稱正規化成 NULL 也是一次真實寫入
        member.title = normalized
        changed["title"] = normalized
    if changed:  # 行內編輯的 blur 會送出未變更的整列,那不是一次異動
        _audit(db, request, user, "member_updated", member, f"fields={','.join(sorted(changed))}")
    await db.commit()
    await db.refresh(member)
    return ApiResponse(data=MemberOut.model_validate(member))


@router.delete("/{member_id}")
async def delete_member(
    member_id: int, user: ClubUser, db: DbDep, request: Request
) -> ApiResponse[None]:
    member = await _own_member(db, user, member_id)
    _audit(db, request, user, "member_deleted", member)
    await db.delete(member)
    await db.commit()
    return ApiResponse()


@router.post("/import")
async def import_members(
    body: MemberImportRequest, user: ClubUser, db: DbDep, request: Request
) -> ApiResponse[MemberImportResult]:
    created = updated = 0
    touched: set[str] = set()
    errors: list[str] = []

    # 匯入至指定學期:同學期同學號 upsert,不影響其他學期名單
    existing = {
        m.student_id: m
        for m in await db.scalars(
            sa.select(ClubMember).where(
                ClubMember.club_id == user.club_id, ClubMember.semester == body.semester
            )
        )
    }
    seen: set[str] = set()

    # 剝除 UTF-8 BOM:匯出檔為 Excel 相容而前置 BOM,原樣貼回/上傳匯入時
    # str.strip() 不會移除 U+FEFF,首列第一欄姓名會被污染成帶 BOM 前綴的值
    csv_text = body.csv_text.lstrip("﻿")
    for line_no, row in enumerate(csv.reader(io.StringIO(csv_text)), start=1):
        # 匯出端為了中和 Excel 公式,會在 = + - @ 開頭的值前面補一個單引號;
        # 原樣貼回來時要脫掉,否則每往返一次多一個。只脫真的被中和過的,不動以 ' 開頭的名字
        cells = [_unneutralize(c.strip()) for c in row]
        if not any(cells):
            continue
        if len(cells) < 3:
            errors.append(f"第 {line_no} 列:欄位不足(需 姓名,學號,身份)")
            continue
        name, student_id, identity = cells[0], cells[1], cells[2]
        title = cells[3].strip() if len(cells) > 3 and cells[3].strip() else None
        if not name or not student_id:
            errors.append(f"第 {line_no} 列:姓名與學號必填")
            continue
        if (
            len(name) > 50
            or len(student_id) > 20
            or (title and len(title) > 30)
        ):
            errors.append(f"第 {line_no} 列:欄位長度超過上限")
            continue
        if student_id in seen:
            errors.append(f"第 {line_no} 列:學號 {student_id} 重複出現")
            continue

        kind = _KIND_ALIASES.get(identity)
        if kind is None:
            errors.append(f"第 {line_no} 列:身份「{identity}」無法辨識")
            continue
        if kind == MemberKind.OFFICER and not title:
            errors.append(f"第 {line_no} 列:幹部需填職稱")
            continue

        seen.add(student_id)
        member = existing.get(student_id)
        if member is None:
            db.add(
                ClubMember(
                    club_id=user.club_id,
                    name=name,
                    student_id=student_id,
                    kind=kind,
                    title=title,
                    semester=body.semester,
                )
            )
            created += 1
            touched.add(student_id)
        elif (member.name, member.kind, member.title) != (name, kind, title):
            # 值沒變不計入 updated:重匯同一份名單要回報 0 筆更新,不能謊報整份都動過
            member.name, member.kind, member.title = name, kind, title
            updated += 1
            touched.add(student_id)

    if touched:
        # 匯入是 upsert,會覆寫既有成員的姓名/身份/職稱 —— 只記數量查不出改了誰
        shown = ",".join(sorted(touched)[:_AUDIT_ID_LIMIT])
        more = f"…等 {len(touched)} 人" if len(touched) > _AUDIT_ID_LIMIT else ""
        audit.record(
            db,
            action="members_imported",
            user=user,
            detail=f"semester={body.semester};created={created};updated={updated};{shown}{more}",
            ip=client_ip(request),
        )
    await db.commit()
    return ApiResponse(data=MemberImportResult(created=created, updated=updated, errors=errors))
