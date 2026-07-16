"""社團端:社團評鑑(資料總覽自動評分 + 五獎項資料上傳)。"""

import sqlalchemy as sa
from fastapi import APIRouter, UploadFile

from app.core.deps import ClubUser, DbDep
from app.core.errors import conflict, not_found
from app.models import Award, AwardRubricItem, EvalSetting, EvalUpload, File
from app.schemas.common import ApiResponse
from app.schemas.eval import (
    AdScoreOut,
    AwardDetailOut,
    AwardProgressOut,
    EvalFileOut,
    EvalOverviewOut,
    RubricItemOut,
)
from app.services import evaluation
from app.services import files as file_service
from app.services.files import UploadPolicy
from app.services.scoring import apply_overrides, compute_ad_scores, total_of

router = APIRouter(prefix="/club/eval", tags=["eval"])

# 評鑑資料:文件與照片皆收,50MB
EVAL_POLICY = UploadPolicy(
    "eval", frozenset({".pdf", ".doc", ".docx", ".jpg", ".jpeg", ".png", ".zip"}), 50 * 1024 * 1024
)


async def _award_or_404(db, award_id: str) -> Award:
    award = await db.get(Award, award_id)
    if award is None or not award.is_active:
        raise not_found("找不到獎項")
    return award


async def _upload_locked(db, year: int, award_id: str) -> bool:
    """eval_settings.unlocked=False 時鎖上傳;無設定列=開放。"""
    row = await db.get(EvalSetting, (year, award_id))
    return row is not None and not row.unlocked


@router.get("/overview")
async def overview(user: ClubUser, db: DbDep) -> ApiResponse[EvalOverviewOut]:
    window = await evaluation.get_eval_window(db)
    scoring_input = await evaluation.gather_scoring_input(db, user.club_id, window)
    overrides = await evaluation.get_overrides(db, user.club_id, window.year)
    finals = apply_overrides(compute_ad_scores(scoring_input), overrides)

    awards = (
        await db.scalars(
            sa.select(Award).where(Award.is_active.is_(True)).order_by(Award.sort, Award.id)
        )
    ).all()
    progress: list[AwardProgressOut] = []
    for award in awards:
        item_ids = (
            await db.scalars(
                sa.select(AwardRubricItem.id).where(
                    AwardRubricItem.award_id == award.id,
                    AwardRubricItem.year == window.year,
                    AwardRubricItem.is_admin_item.is_(False),
                )
            )
        ).all()
        filled = 0
        if item_ids:
            filled = (
                await db.scalar(
                    sa.select(sa.func.count(sa.distinct(EvalUpload.rubric_item_id))).where(
                        EvalUpload.club_id == user.club_id,
                        EvalUpload.year == window.year,
                        EvalUpload.rubric_item_id.in_(item_ids),
                    )
                )
                or 0
            )
        progress.append(
            AwardProgressOut(
                id=award.id,
                name=award.name,
                kind=award.kind.value,
                has_presentation=award.has_presentation,
                is_weighted=award.is_weighted,
                filled=filled,
                total=len(item_ids),
            )
        )

    return ApiResponse(
        data=EvalOverviewOut(
            year=window.year,
            window_start=window.start,
            window_end=window.end,
            scores=[AdScoreOut(**vars(s)) for s in finals],
            total=total_of(finals),
            awards=progress,
        )
    )


@router.get("/awards/{award_id}")
async def award_detail(award_id: str, user: ClubUser, db: DbDep) -> ApiResponse[AwardDetailOut]:
    award = await _award_or_404(db, award_id)
    window = await evaluation.get_eval_window(db)

    items = (
        await db.scalars(
            sa.select(AwardRubricItem)
            .where(AwardRubricItem.award_id == award.id, AwardRubricItem.year == window.year)
            .order_by(AwardRubricItem.sort, AwardRubricItem.id)
        )
    ).all()

    uploads_by_item: dict[int, list[EvalFileOut]] = {}
    rows = await db.execute(
        sa.select(EvalUpload, File)
        .join(File, EvalUpload.file_id == File.id)
        .where(
            EvalUpload.club_id == user.club_id,
            EvalUpload.year == window.year,
            EvalUpload.rubric_item_id.in_([i.id for i in items] or [0]),
        )
        .order_by(EvalUpload.id)
    )
    for upload, file in rows:
        uploads_by_item.setdefault(upload.rubric_item_id, []).append(
            EvalFileOut(
                id=upload.id,
                file_id=file.id,
                original_name=file.original_name,
                size=file.size,
                mime=file.mime,
                created_at=upload.created_at,
            )
        )

    out_items = []
    for item in items:
        out = RubricItemOut.model_validate(item)
        out.uploads = uploads_by_item.get(item.id, [])
        out_items.append(out)

    return ApiResponse(
        data=AwardDetailOut(
            id=award.id,
            name=award.name,
            kind=award.kind.value,
            has_presentation=award.has_presentation,
            is_weighted=award.is_weighted,
            year=window.year,
            items=out_items,
        )
    )


@router.post("/awards/{award_id}/items/{item_id}/files", status_code=201)
async def upload_eval_file(
    award_id: str, item_id: int, file: UploadFile, user: ClubUser, db: DbDep
) -> ApiResponse[EvalFileOut]:
    file_service.enforce_upload_rate(user.id)
    award = await _award_or_404(db, award_id)
    window = await evaluation.get_eval_window(db)
    if await _upload_locked(db, window.year, award.id):
        raise conflict("該獎項的資料上傳目前未開放")

    item = await db.get(AwardRubricItem, item_id)
    if item is None or item.award_id != award.id or item.year != window.year:
        raise not_found("找不到評分項目")

    saved = await file_service.save_upload(
        db,
        file,
        policy=EVAL_POLICY,
        module="eval",
        uploaded_by=user.id,
        club_id=user.club_id,
        subject_type="eval_upload",
        subject_id=item.id,
        slot=item.item_key,
        # 同 rubric item 內容去重(SHA-256):前端 session 內已擋,跨 session 由此攔下;
        # 以 subject_id(逐年唯一)為範圍,不跨年度誤擋
        dedup="subject",
    )
    upload = EvalUpload(
        year=window.year, club_id=user.club_id, rubric_item_id=item.id, file_id=saved.id
    )
    db.add(upload)
    await db.commit()
    return ApiResponse(
        data=EvalFileOut(
            id=upload.id,
            file_id=saved.id,
            original_name=saved.original_name,
            size=saved.size,
            mime=saved.mime,
            created_at=upload.created_at,
        )
    )


@router.delete("/awards/{award_id}/items/{item_id}/files/{upload_id}")
async def delete_eval_file(
    award_id: str, item_id: int, upload_id: int, user: ClubUser, db: DbDep
) -> ApiResponse[None]:
    award = await _award_or_404(db, award_id)
    window = await evaluation.get_eval_window(db)
    if await _upload_locked(db, window.year, award.id):
        raise conflict("該獎項的資料上傳目前未開放")

    # item 必須屬於路徑上的獎項,否則可借道未鎖定的獎項刪除已凍結獎項的檔案
    item = await db.get(AwardRubricItem, item_id)
    if item is None or item.award_id != award.id or item.year != window.year:
        raise not_found("找不到評分項目")

    upload = await db.get(EvalUpload, upload_id)
    if (
        upload is None
        or upload.club_id != user.club_id
        or upload.rubric_item_id != item_id
        or upload.year != window.year
    ):
        raise not_found("找不到上傳紀錄")
    file = await db.get(File, upload.file_id)
    await db.delete(upload)
    disk = await file_service.delete_file(db, file) if file is not None else None
    await db.commit()
    if disk is not None:  # commit 成功後才動磁碟
        disk.unlink(missing_ok=True)
    return ApiResponse()
