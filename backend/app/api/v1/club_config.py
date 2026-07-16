"""社團端執行組態:上傳上限與經費科目。

前端表單的容量上限、經費科目與其提示不再硬編碼於前端(2026-07-17 需求方),
一律由此端點供給;後端仍是各上限的權威來源(save_upload / 各上傳端點實際強制)。
"""

from typing import Any

from fastapi import APIRouter

from app.core.deps import ClubUser, DbDep
from app.schemas.common import ApiResponse
from app.services.settings_service import get_setting

router = APIRouter(prefix="/club", tags=["config"])


@router.get("/config")
async def club_config(user: ClubUser, db: DbDep) -> ApiResponse[dict[str, Any]]:
    single = await get_setting(db, "upload_limits")  # 單檔上限(型別上界)
    return ApiResponse(
        data={
            # 各申請性質的附件加總上限 + 單檔型別上界(前端表單即時檢核用;後端仍權威)
            "upload_limits": {
                "activity_attachment_mb": int(
                    await get_setting(db, "activity_attachment_total_mb")
                ),
                "maintenance_mb": int(await get_setting(db, "maintenance_total_mb")),
                "close_photo_mb": int(await get_setting(db, "close_photo_total_mb")),
                "doc_mb": int(single["doc"]),
                "img_mb": int(single["img"]),
                "video_mb": int(single["video"]),
            },
            # 經費科目 [{name, hint}]:名稱供下拉、hint 選填顯示於該列
            "budget_categories": await get_setting(db, "budget_categories"),
        }
    )
