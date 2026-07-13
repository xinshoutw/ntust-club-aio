"""社團端:成員列表(CRUD + CSV 匯入)。

- 學期篩選:以 updated_at 落在該學期區間推導(名單更新時間即 ad5 依據)
- CSV 格式:姓名,學號,身份[,職稱];身份=社員/幹部/社長/會長/副社長/副會長
"""

import csv
import io

import sqlalchemy as sa
from fastapi import APIRouter, Query

from app.api.pagination import Pagination, parse_sort
from app.core.deps import ClubUser, DbDep
from app.core.errors import conflict, not_found, validation_error
from app.core.semesters import semester_bounds
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

_SORTABLE = {
    "name": ClubMember.name,
    "student_id": ClubMember.student_id,
    "kind": ClubMember.kind,
    "title": ClubMember.title,
    "updated_at": ClubMember.updated_at,
}

# 匯入「身份」欄:正副社長類直接映射為幹部+職稱
_LEADER_TITLES = {"社長", "會長", "副社長", "副會長"}


def _validate_member(kind: MemberKind, title: str | None) -> str | None:
    if kind == MemberKind.OFFICER and not title:
        raise validation_error("幹部必須填寫職稱")
    return title if kind == MemberKind.OFFICER else None  # 社員無職稱


@router.get("")
async def list_members(
    user: ClubUser,
    db: DbDep,
    page: Pagination,
    semester: str | None = Query(None, pattern=r"^\d{3}-[12]$"),
    kind: MemberKind | None = None,
    sort: str | None = None,
) -> ApiResponse[list[MemberOut]]:
    query = sa.select(ClubMember).where(ClubMember.club_id == user.club_id)
    if semester:
        start, end = semester_bounds(semester)
        query = query.where(ClubMember.updated_at >= start, ClubMember.updated_at < end)
    if kind:
        query = query.where(ClubMember.kind == kind)
    query = query.order_by(*parse_sort(sort, _SORTABLE, ClubMember.id.asc()))

    total = await db.scalar(sa.select(sa.func.count()).select_from(query.subquery()))
    rows = await db.scalars(query.offset(page.offset).limit(page.page_size))
    return ApiResponse(
        data=[MemberOut.model_validate(m) for m in rows], meta=page.meta(total or 0)
    )


@router.post("", status_code=201)
async def create_member(body: MemberIn, user: ClubUser, db: DbDep) -> ApiResponse[MemberOut]:
    title = _validate_member(body.kind, body.title)
    exists = await db.scalar(
        sa.select(ClubMember.id).where(
            ClubMember.club_id == user.club_id, ClubMember.student_id == body.student_id
        )
    )
    if exists:
        raise conflict("該學號已在名單中")
    member = ClubMember(
        club_id=user.club_id,
        name=body.name,
        student_id=body.student_id,
        kind=body.kind,
        title=title,
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
    changed = {
        field: value
        for field, value in body.model_dump(exclude_unset=True).items()
        if getattr(member, field) != value  # 行內編輯自動儲存常送未變值,不得動 updated_at
    }
    if "student_id" in changed:
        dup = await db.scalar(
            sa.select(ClubMember.id).where(
                ClubMember.club_id == user.club_id,
                ClubMember.student_id == changed["student_id"],
            )
        )
        if dup:
            raise conflict("該學號已在名單中")
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

    existing = {
        m.student_id: m
        for m in await db.scalars(
            sa.select(ClubMember).where(ClubMember.club_id == user.club_id)
        )
    }
    seen: set[str] = set()

    for line_no, row in enumerate(csv.reader(io.StringIO(body.csv_text)), start=1):
        cells = [c.strip() for c in row]
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
        if len(name) > 50 or len(student_id) > 20 or (title and len(title) > 30):
            errors.append(f"第 {line_no} 列:欄位長度超過上限")
            continue
        if student_id in seen:
            errors.append(f"第 {line_no} 列:學號 {student_id} 重複出現")
            continue

        if identity in _LEADER_TITLES:
            kind, title = MemberKind.OFFICER, identity
        elif identity == "幹部":
            kind = MemberKind.OFFICER
            if not title:
                errors.append(f"第 {line_no} 列:幹部需填職稱")
                continue
        elif identity == "社員":
            kind, title = MemberKind.MEMBER, None
        else:
            errors.append(f"第 {line_no} 列:身份「{identity}」無法辨識")
            continue

        seen.add(student_id)
        member = existing.get(student_id)
        if member is None:
            db.add(
                ClubMember(
                    club_id=user.club_id, name=name, student_id=student_id, kind=kind, title=title
                )
            )
            created += 1
        elif (member.name, member.kind, member.title) != (name, kind, title):
            # 值沒變就不觸碰:no-op 重匯不得改動 updated_at(ad5 名單更新依據)
            member.name, member.kind, member.title = name, kind, title
            updated += 1

    await db.commit()
    return ApiResponse(data=MemberImportResult(created=created, updated=updated, errors=errors))
