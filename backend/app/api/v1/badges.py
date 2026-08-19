"""側欄徽章計數。

一支端點回該角色所有頁面的待辦數,前端一支查詢就畫得完側欄 —— 逐頁各打一支
`page_size=1` 取 `meta.total` 的話,登入瞬間就是十幾個往返。
"""

from fastapi import APIRouter

from app.core.deps import CurrentUser, DbDep
from app.schemas.common import ApiResponse
from app.services import badges

router = APIRouter(prefix="/badges", tags=["badges"])


@router.get("")
async def sidebar_badges(user: CurrentUser, db: DbDep) -> ApiResponse[dict[str, int]]:
    """鍵=前端 nav item 的 key;沒有待辦的項目回 0,不出現在回應中的即該角色沒有這個徽章。"""
    return ApiResponse(data=await badges.for_user(db, user))
