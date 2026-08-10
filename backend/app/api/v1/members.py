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
from fastapi import APIRouter, Query

from app.api.pagination import Pagination, parse_sort
from app.core.deps import ClubUser, DbDep
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
    "updated_at": ClubMember.updated_at,
}

# 預設排序:身份權重升冪(負責人在前),同權重依學號
_DEFAULT_ORDER = (_KIND_WEIGHT.asc(), ClubMember.student_id.asc())

# 匯入「身份」欄:顯示詞映射為標準身份(社長/會長→負責人;副社長/副會長→副負責人)
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
async def create_member(body: MemberIn, user: ClubUser, db: DbDep) -> ApiResponse[MemberOut]:
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
        phone=body.phone or None,
        semester=body.semester,
    )
    db.add(member)
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
    member_id: int, body: MemberUpdate, user: ClubUser, db: DbDep
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
    member.title = _validate_member(member.kind, member.title)
    await db.commit()
    await db.refresh(member)
    return ApiResponse(data=MemberOut.model_validate(member))


@router.delete("/{member_id}")
async def delete_member(member_id: int, user: ClubUser, db: DbDep) -> ApiResponse[None]:
    member = await _own_member(db, user, member_id)
    await db.delete(member)
    await db.commit()
    return ApiResponse()


@router.post("/import")
async def import_members(
    body: MemberImportRequest, user: ClubUser, db: DbDep
) -> ApiResponse[MemberImportResult]:
    created = updated = 0
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
        cells = [c.strip() for c in row]
        if not any(cells):
            continue
        if len(cells) < 3:
            errors.append(f"第 {line_no} 列:欄位不足(需 姓名,學號,身份)")
            continue
        name, student_id, identity = cells[0], cells[1], cells[2]
        title = cells[3].strip() if len(cells) > 3 and cells[3].strip() else None
        phone = cells[4].strip() if len(cells) > 4 and cells[4].strip() else None
        if not name or not student_id:
            errors.append(f"第 {line_no} 列:姓名與學號必填")
            continue
        if (
            len(name) > 50
            or len(student_id) > 20
            or (title and len(title) > 30)
            or (phone and len(phone) > 30)
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
                    phone=phone,
                    semester=body.semester,
                )
            )
            created += 1
        elif (member.name, member.kind, member.title, member.phone) != (name, kind, title, phone):
            # 值沒變不計入 updated:重匯同一份名單要回報 0 筆更新,不能謊報整份都動過
            member.name, member.kind, member.title, member.phone = name, kind, title, phone
            updated += 1

    await db.commit()
    return ApiResponse(data=MemberImportResult(created=created, updated=updated, errors=errors))
