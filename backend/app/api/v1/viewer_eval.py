"""評審端:我的評分指派、受評社團評分、已完成清單。

- 指派來源:eval_group_reviewers(user_id=me)→ eval_groups(year=當前評鑑年)→
  award_id + eval_group_clubs 展開;評鑑年一律由 get_eval_window 推導
- 評分:ReviewScore 唯一鍵 (year, award, club, reviewer) upsert,items 全量替換;
  送出即寫 submitted_at(允許重複修改,再存覆蓋)
- 現場簡報 20 分不建 rubric item:has_presentation 的獎項用 presentation_score 專欄
"""

from datetime import UTC, datetime

import sqlalchemy as sa
from fastapi import APIRouter, Query, Request
from sqlalchemy.orm import selectinload

from app.api.pagination import Pagination, parse_sort
from app.core.deps import DbDep, ViewerUser, client_ip
from app.core.errors import forbidden, not_found, validation_error
from app.models import (
    Award,
    AwardRubricItem,
    Club,
    EvalGroup,
    EvalGroupClub,
    EvalGroupReviewer,
    EvalUpload,
    File,
    ReviewScore,
    ReviewScoreItem,
)
from app.schemas.common import ApiResponse
from app.schemas.eval import (
    ViewerAssignmentOut,
    ViewerAwardClubOut,
    ViewerClubOut,
    ViewerClubStateOut,
    ViewerDoneOut,
    ViewerRubricItemOut,
    ViewerScoreIn,
    ViewerScoreItemOut,
    ViewerScoreOut,
    ViewerUploadOut,
)
from app.services import audit, evaluation

router = APIRouter(prefix="/viewer", tags=["viewer"])

PRESENTATION_MAX = 20  # 現場簡報滿分(原型定案;非 rubric item)


async def _rubric_items(db, award_id: str, year: int) -> list[AwardRubricItem]:
    """委員人工評分細項(排除行政資料項:最佳社團獎 ad1–ad8 為系統自動評分)。"""
    return (
        await db.scalars(
            sa.select(AwardRubricItem)
            .where(
                AwardRubricItem.award_id == award_id,
                AwardRubricItem.year == year,
                AwardRubricItem.is_admin_item.is_(False),
            )
            .order_by(AwardRubricItem.sort, AwardRubricItem.id)
        )
    ).all()


def _score_total(score: ReviewScore) -> float:
    return sum(i.score for i in score.items) + (score.presentation_score or 0)


async def _award_or_404(db, award_id: str) -> Award:
    award = await db.get(Award, award_id)
    if award is None or not award.is_active:
        raise not_found("找不到獎項")
    return award


async def _require_assignment(db, user_id: int, club_id: int, award_id: str, year: int) -> None:
    """該社必須位於「我被指派、該獎項」的分組內,否則 403。"""
    assigned = await db.scalar(
        sa.select(EvalGroup.id)
        .join(EvalGroupReviewer, EvalGroupReviewer.group_id == EvalGroup.id)
        .join(EvalGroupClub, EvalGroupClub.group_id == EvalGroup.id)
        .where(
            EvalGroup.year == year,
            EvalGroup.award_id == award_id,
            EvalGroupReviewer.user_id == user_id,
            EvalGroupClub.club_id == club_id,
        )
        .limit(1)
    )
    if assigned is None:
        raise forbidden("此社團不在您負責的評分分組內")


@router.get("/assignments")
async def my_assignments(user: ViewerUser, db: DbDep) -> ApiResponse[list[ViewerAssignmentOut]]:
    window = await evaluation.get_eval_window(db)
    groups = (
        await db.execute(
            sa.select(EvalGroup, Award)
            .join(EvalGroupReviewer, EvalGroupReviewer.group_id == EvalGroup.id)
            .join(Award, Award.id == EvalGroup.award_id)
            # 停用獎項不列入指派(detail/save 對停用獎項回 404,列表須一致)
            .where(
                EvalGroupReviewer.user_id == user.id,
                EvalGroup.year == window.year,
                Award.is_active,
            )
            .order_by(EvalGroup.sort, EvalGroup.id)
        )
    ).all()

    data: list[ViewerAssignmentOut] = []
    for group, award in groups:
        items = await _rubric_items(db, award.id, window.year)
        clubs = (
            await db.scalars(
                sa.select(Club)
                .join(EvalGroupClub, EvalGroupClub.club_id == Club.id)
                .where(EvalGroupClub.group_id == group.id)
                .order_by(Club.name)
            )
        ).all()
        scores = (
            await db.scalars(
                sa.select(ReviewScore)
                .options(selectinload(ReviewScore.items))
                .where(
                    ReviewScore.year == window.year,
                    ReviewScore.award_id == award.id,
                    ReviewScore.reviewer_id == user.id,
                    ReviewScore.club_id.in_([c.id for c in clubs] or [0]),
                )
            )
        ).all()
        by_club = {s.club_id: s for s in scores}
        club_states = []
        for club in clubs:
            score = by_club.get(club.id)
            submitted = score is not None and score.submitted_at is not None
            club_states.append(
                ViewerClubStateOut(
                    club_id=club.id,
                    club_name=club.name,
                    attribute=club.attribute.value if club.attribute else None,
                    scored=submitted,
                    total=_score_total(score) if submitted else None,
                    submitted_at=score.submitted_at if score is not None else None,
                    presentation_pending=(
                        submitted and award.has_presentation and score.presentation_score is None
                    ),
                )
            )
        data.append(
            ViewerAssignmentOut(
                award_id=award.id,
                award_name=award.name,
                has_presentation=award.has_presentation,
                group_id=group.id,
                group_name=group.name,
                year=window.year,
                items=[ViewerRubricItemOut.model_validate(i) for i in items],
                clubs=club_states,
            )
        )
    return ApiResponse(data=data)


@router.get("/clubs/{club_id}/awards/{award_id}")
async def club_award_detail(
    club_id: int, award_id: str, user: ViewerUser, db: DbDep
) -> ApiResponse[ViewerAwardClubOut]:
    award = await _award_or_404(db, award_id)
    club = await db.get(Club, club_id)
    if club is None:
        raise not_found("找不到社團")
    window = await evaluation.get_eval_window(db)
    await _require_assignment(db, user.id, club.id, award.id, window.year)

    items = await _rubric_items(db, award.id, window.year)
    uploads: dict[int, list[ViewerUploadOut]] = {}
    rows = await db.execute(
        sa.select(EvalUpload, File)
        .join(File, EvalUpload.file_id == File.id)
        .where(
            EvalUpload.club_id == club.id,
            EvalUpload.year == window.year,
            EvalUpload.rubric_item_id.in_([i.id for i in items] or [0]),
        )
        .order_by(EvalUpload.id)
    )
    for upload, file in rows:
        uploads.setdefault(upload.rubric_item_id, []).append(
            ViewerUploadOut(id=file.id, name=file.original_name, size=file.size)
        )

    score = await db.scalar(
        sa.select(ReviewScore)
        .options(selectinload(ReviewScore.items))
        .where(
            ReviewScore.year == window.year,
            ReviewScore.award_id == award.id,
            ReviewScore.club_id == club.id,
            ReviewScore.reviewer_id == user.id,
        )
    )
    return ApiResponse(
        data=ViewerAwardClubOut(
            club=ViewerClubOut(
                id=club.id,
                name=club.name,
                attribute=club.attribute.value if club.attribute else None,
                kind=club.kind.value,
            ),
            items=[ViewerRubricItemOut.model_validate(i) for i in items],
            uploads=uploads,
            score=(
                ViewerScoreOut(
                    items={
                        i.rubric_item_id: ViewerScoreItemOut(score=i.score, comment=i.comment)
                        for i in score.items
                    },
                    presentation_score=score.presentation_score,
                    submitted_at=score.submitted_at,
                )
                if score is not None
                else None
            ),
        )
    )


@router.put("/clubs/{club_id}/awards/{award_id}/score")
async def save_score(
    club_id: int,
    award_id: str,
    body: ViewerScoreIn,
    user: ViewerUser,
    db: DbDep,
    request: Request,
) -> ApiResponse[ViewerScoreOut]:
    award = await _award_or_404(db, award_id)
    club = await db.get(Club, club_id)
    if club is None:
        raise not_found("找不到社團")
    window = await evaluation.get_eval_window(db)
    await _require_assignment(db, user.id, club.id, award.id, window.year)

    # 先鎖既有評分列(唯一鍵 year+award+club+reviewer),再驗證與覆寫
    score = await db.scalar(
        sa.select(ReviewScore)
        .where(
            ReviewScore.year == window.year,
            ReviewScore.award_id == award.id,
            ReviewScore.club_id == club.id,
            ReviewScore.reviewer_id == user.id,
        )
        .with_for_update()
    )

    expected = {i.id: i for i in await _rubric_items(db, award.id, window.year)}
    if not expected:
        raise validation_error("此獎項尚未建立評分細項")
    submitted_ids = [i.rubric_item_id for i in body.items]
    if len(set(submitted_ids)) != len(submitted_ids):
        raise validation_error("評分項目重複")
    if set(submitted_ids) - set(expected):
        raise validation_error("評分項目不屬於此獎項")
    if set(expected) - set(submitted_ids):
        raise validation_error("請填寫全部評分細項後送出")
    for entry in body.items:
        item = expected[entry.rubric_item_id]
        if not 0 <= entry.score <= item.max_score:
            raise validation_error(f"「{item.name}」分數須介於 0–{item.max_score:g}")
    if body.presentation_score is not None:
        if not award.has_presentation:
            raise validation_error("此獎項沒有現場簡報評分")
        if not 0 <= body.presentation_score <= PRESENTATION_MAX:
            raise validation_error(f"簡報分數須介於 0–{PRESENTATION_MAX}")

    if score is None:
        score = ReviewScore(
            year=window.year, award_id=award.id, club_id=club.id, reviewer_id=user.id
        )
        db.add(score)
    score.presentation_score = body.presentation_score
    score.submitted_at = datetime.now(UTC)
    await db.flush()  # 取得 score.id(新列)
    # items 全量替換:整份送出,舊細項分數一律覆蓋
    await db.execute(sa.delete(ReviewScoreItem).where(ReviewScoreItem.score_id == score.id))
    for entry in body.items:
        db.add(
            ReviewScoreItem(
                score_id=score.id,
                rubric_item_id=entry.rubric_item_id,
                score=entry.score,
                comment=entry.comment,
            )
        )
    audit.record(
        db,
        action="review_score_saved",
        user=user,
        detail=f"year={window.year};award={award.id};club={club.id}",
        ip=client_ip(request),
    )
    await db.commit()
    return ApiResponse(
        data=ViewerScoreOut(
            items={
                e.rubric_item_id: ViewerScoreItemOut(score=e.score, comment=e.comment)
                for e in body.items
            },
            presentation_score=score.presentation_score,
            submitted_at=score.submitted_at,
        )
    )


_DONE_SORT = {
    "submitted_at": ReviewScore.submitted_at,
    "club": Club.name,
    "award": Award.name,
}


@router.get("/done")
async def done_list(
    user: ViewerUser,
    db: DbDep,
    page: Pagination,
    sort: str | None = Query(None),
) -> ApiResponse[list[ViewerDoneOut]]:
    window = await evaluation.get_eval_window(db)
    items_sum = (
        sa.select(sa.func.coalesce(sa.func.sum(ReviewScoreItem.score), 0.0))
        .where(ReviewScoreItem.score_id == ReviewScore.id)
        .correlate(ReviewScore)
        .scalar_subquery()
    )
    total_col = (items_sum + sa.func.coalesce(ReviewScore.presentation_score, 0)).label("total")
    query = (
        sa.select(ReviewScore, Award.name, Club.name, total_col)
        .join(Award, Award.id == ReviewScore.award_id)
        .join(Club, Club.id == ReviewScore.club_id)
        .where(
            ReviewScore.reviewer_id == user.id,
            ReviewScore.year == window.year,
            ReviewScore.submitted_at.is_not(None),
        )
    )
    order = parse_sort(
        sort,
        {**_DONE_SORT, "total": total_col},
        ReviewScore.submitted_at.desc(),
    )
    query = query.order_by(*order, ReviewScore.id.desc())

    total = await db.scalar(sa.select(sa.func.count()).select_from(query.subquery()))
    rows = await db.execute(query.offset(page.offset).limit(page.page_size))
    data = [
        ViewerDoneOut(
            award_id=score.award_id,
            award_name=award_name,
            club_id=score.club_id,
            club_name=club_name,
            total=row_total,
            submitted_at=score.submitted_at,
        )
        for score, award_name, club_name, row_total in rows
    ]
    return ApiResponse(data=data, meta=page.meta(total or 0))
