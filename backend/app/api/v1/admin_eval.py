"""行政端:行政分審核(逐項手動調整/回到自動/表現優良加分)。

調整全部留痕於 eval_adjustments;「回到自動」=註銷該項現行調整列(revoked_at),
不硬刪,歷次調整可稽核。調整即時反映社團端(查詢時調整值蓋過計算值)。
"""

from typing import Annotated

import sqlalchemy as sa
from fastapi import APIRouter, BackgroundTasks, Depends, Request

from app.api.pagination import Pagination
from app.core.deps import CurrentUser, DbDep, client_ip, require_permission
from app.core.errors import not_found
from app.models import Club, EvalAdjustment
from app.models.enums import AdjustmentKind
from app.schemas.admin import MeritIn, ScoreOverrideIn, ScoreRevertIn
from app.schemas.common import ApiResponse
from app.schemas.eval import AdScoreOut
from app.services import audit, evaluation, notify
from app.services.scoring import apply_overrides, compute_ad_scores, total_of

router = APIRouter(prefix="/admin/eval", tags=["admin"])

EvalAdmin = Annotated[CurrentUser, Depends(require_permission("aeval"))]

_CLUB_AWARD = "club"  # 行政分屬最佳社團獎


async def _club_or_404(db, club_id: int) -> Club:
    club = await db.get(Club, club_id)
    if club is None or not club.is_active:
        raise not_found("找不到社團")
    return club


async def _club_scores(db, club_id: int) -> tuple[list[AdScoreOut], float, int]:
    window = await evaluation.get_eval_window(db)
    scoring_input = await evaluation.gather_scoring_input(db, club_id, window)
    overrides = await evaluation.get_overrides(db, club_id, window.year)
    finals = apply_overrides(compute_ad_scores(scoring_input), overrides)
    return [AdScoreOut(**vars(s)) for s in finals], total_of(finals), window.year


@router.get("/clubs")
async def list_clubs(user: EvalAdmin, db: DbDep, page: Pagination) -> ApiResponse[list[dict]]:
    """各社行政分總覽:只回總分,逐項明細由 /clubs/{id} 供應。

    每個來源各查一次(見 evaluation.gather_scoring_inputs),往返次數不隨社團數成長;
    分數只算這一頁的社團 —— 一頁用不到的 159 社行政分不必每次重算。
    """
    query = sa.select(Club).where(Club.is_active.is_(True)).order_by(Club.name, Club.id)
    total = await db.scalar(sa.select(sa.func.count()).select_from(query.subquery()))
    clubs = (await db.scalars(query.offset(page.offset).limit(page.page_size))).all()
    window = await evaluation.get_eval_window(db)
    club_ids = [c.id for c in clubs]
    inputs = await evaluation.gather_scoring_inputs(db, club_ids, window)
    overrides = await evaluation.get_overrides_by_club(db, club_ids, window.year)
    return ApiResponse(
        data=[
            {
                "club_id": club.id,
                "club_name": club.name,
                "attribute": club.attribute.value if club.attribute else None,
                "year": window.year,
                "total": total_of(
                    apply_overrides(compute_ad_scores(inputs[club.id]), overrides[club.id])
                ),
            }
            for club in clubs
        ],
        meta=page.meta(total or 0),
    )


@router.get("/clubs/{club_id}")
async def club_detail(club_id: int, user: EvalAdmin, db: DbDep) -> ApiResponse[dict]:
    club = await _club_or_404(db, club_id)
    scores, total, year = await _club_scores(db, club.id)
    adjustments = (
        await db.scalars(
            sa.select(EvalAdjustment)
            .where(
                EvalAdjustment.club_id == club.id,
                EvalAdjustment.year == year,
                EvalAdjustment.kind.in_(
                    [AdjustmentKind.ADMIN_SCORE_OVERRIDE, AdjustmentKind.MERIT_BONUS]
                ),
            )
            .order_by(EvalAdjustment.id.desc())
        )
    ).all()
    return ApiResponse(
        data={
            "club_id": club.id,
            "club_name": club.name,
            "year": year,
            "total": total,
            "scores": [s.model_dump() for s in scores],
            "adjustments": [
                {
                    "id": a.id,
                    "kind": a.kind.value,
                    "value": a.value,
                    "reason": a.reason,
                    "revoked": a.revoked_at is not None,
                    "created_at": a.created_at.isoformat(),
                }
                for a in adjustments
            ],
        }
    )


async def _revoke_key(db, club_id: int, year: int, key: str) -> None:
    rows = await db.scalars(
        sa.select(EvalAdjustment).where(
            EvalAdjustment.club_id == club_id,
            EvalAdjustment.year == year,
            EvalAdjustment.kind == AdjustmentKind.ADMIN_SCORE_OVERRIDE,
            EvalAdjustment.revoked_at.is_(None),
        )
    )
    for row in rows:
        if row.value.get("key") == key:
            row.revoked_at = sa.func.now()


@router.post("/clubs/{club_id}/override")
async def override_score(
    club_id: int,
    body: ScoreOverrideIn,
    user: EvalAdmin,
    db: DbDep,
    request: Request,
    background: BackgroundTasks,
) -> ApiResponse[dict]:
    club = await _club_or_404(db, club_id)
    window = await evaluation.get_eval_window(db)
    await evaluation.lock_adjustments(db, club.id)
    await _revoke_key(db, club.id, window.year, body.key)  # 新調整取代舊調整
    db.add(
        EvalAdjustment(
            year=window.year,
            award_id=_CLUB_AWARD,
            club_id=club.id,
            kind=AdjustmentKind.ADMIN_SCORE_OVERRIDE,
            value={"key": body.key, "score": body.score},
            reason=body.reason,
            actor_id=user.id,
        )
    )
    audit.record(
        db,
        action="eval_score_overridden",
        user=user,
        detail=f"club={club.id};{body.key}={body.score}",
        ip=client_ip(request),
    )
    await db.commit()
    background.add_task(
        notify.club_event,
        "alert",
        "行政分手動調整",
        f"{club.name}:{body.key} → {body.score}({body.reason})",
        club.discord_webhook_url,
    )
    scores, total, year = await _club_scores(db, club.id)
    return ApiResponse(data={"total": total, "scores": [s.model_dump() for s in scores]})


@router.post("/clubs/{club_id}/revert")
async def revert_score(
    club_id: int,
    body: ScoreRevertIn,
    user: EvalAdmin,
    db: DbDep,
    request: Request,
    background: BackgroundTasks,
) -> ApiResponse[dict]:
    club = await _club_or_404(db, club_id)
    window = await evaluation.get_eval_window(db)
    await evaluation.lock_adjustments(db, club.id)
    await _revoke_key(db, club.id, window.year, body.key)
    audit.record(
        db,
        action="eval_score_reverted",
        user=user,
        detail=f"club={club.id};key={body.key};reason={body.reason}",
        ip=client_ip(request),
    )
    await db.commit()
    background.add_task(
        notify.club_event,
        "alert",
        "行政分回到自動計算",
        f"{club.name}:{body.key}({body.reason})",
        club.discord_webhook_url,
    )
    scores, total, year = await _club_scores(db, club.id)
    return ApiResponse(data={"total": total, "scores": [s.model_dump() for s in scores]})


@router.post("/clubs/{club_id}/merit")
async def set_merit(
    club_id: int,
    body: MeritIn,
    user: EvalAdmin,
    db: DbDep,
    request: Request,
    background: BackgroundTasks,
) -> ApiResponse[dict]:
    club = await _club_or_404(db, club_id)
    window = await evaluation.get_eval_window(db)
    await evaluation.lock_adjustments(db, club.id)
    # 表現優良加分:最新一筆生效,舊列註銷留痕
    rows = await db.scalars(
        sa.select(EvalAdjustment).where(
            EvalAdjustment.club_id == club.id,
            EvalAdjustment.year == window.year,
            EvalAdjustment.kind == AdjustmentKind.MERIT_BONUS,
            EvalAdjustment.revoked_at.is_(None),
        )
    )
    for row in rows:
        row.revoked_at = sa.func.now()
    db.add(
        EvalAdjustment(
            year=window.year,
            award_id=_CLUB_AWARD,
            club_id=club.id,
            kind=AdjustmentKind.MERIT_BONUS,
            value={"score": body.score},
            reason=body.reason,
            actor_id=user.id,
        )
    )
    audit.record(
        db,
        action="eval_merit_set",
        user=user,
        detail=f"club={club.id};score={body.score}",
        ip=client_ip(request),
    )
    await db.commit()
    background.add_task(
        notify.club_event,
        "alert",
        "表現優良加分登錄",
        f"{club.name}:+{body.score}({body.reason})",
        club.discord_webhook_url,
    )
    scores, total, year = await _club_scores(db, club.id)
    return ApiResponse(data={"total": total, "scores": [s.model_dump() for s in scores]})
