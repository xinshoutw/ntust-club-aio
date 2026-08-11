"""行政端:檔案管理(2026-07-15 新增 /admin/files)。

- 空間彙總:依模組分段(未歸檔檔案佔用)+「文字內容」= 整個 DB 的估算大小
  (pg_database_size);有報修檔案時模組順序 repair 排第一,其餘在後
- 大型檔案列表:模組篩選、預設依大小降冪
- 報修檔案可直接刪除(影片佔用大);其餘模組依歸檔政策由系統管理
"""

import shutil
import uuid
from typing import Annotated

import sqlalchemy as sa
from fastapi import APIRouter, Depends, Query, Request

from app.api.pagination import Pagination, parse_sort
from app.core.deps import CurrentUser, DbDep, client_ip, require_permission
from app.core.errors import forbidden, not_found, validation_error
from app.models import Club, File
from app.schemas.admin import AdminFileOut, FileUsageModuleOut, FileUsageOut
from app.schemas.common import ApiResponse
from app.services import audit
from app.services import files as file_service

router = APIRouter(prefix="/admin/files", tags=["admin"])

FilesAdmin = Annotated[CurrentUser, Depends(require_permission("afiles"))]

# 磁碟佈局 {module}/{YYYY}/{MM}/{uuid} 的 module 前綴 → 前端模組鍵
_MODULE_BY_PREFIX = {
    "reports": "close",  # 活動結案(照片)
    "eval": "eval",  # 評鑑資料
    "activities": "apply",  # 活動申請附件
    "postal": "apps",  # 線上申請
    "maintenance": "repair",  # 空間報修
}
_PREFIX_BY_MODULE = {v: k for k, v in _MODULE_BY_PREFIX.items()}
_LABELS = {
    "close": "活動結案",
    "eval": "評鑑資料",
    "apply": "活動申請附件",
    "apps": "線上申請",
    "repair": "空間報修",
}
# 無報修檔案時的固定順序;有報修檔案時 repair 提到第一
_BASE_ORDER = ("close", "eval", "apply", "apps", "repair")

_SORTABLE = {"size": File.size, "created_at": File.created_at}

_PREFIX_SQL = sa.func.split_part(File.path, "/", 1)


def _module_of(file: File) -> str:
    return _MODULE_BY_PREFIX.get(file.path.split("/", 1)[0], "apps")


@router.get("/usage")
async def usage(user: FilesAdmin, db: DbDep) -> ApiResponse[FileUsageOut]:
    """空間彙總:依模組分段;已歸檔(archived_at)的檔案已離盤,不計佔用。"""
    rows = await db.execute(
        sa.select(_PREFIX_SQL, sa.func.count(), sa.func.coalesce(sa.func.sum(File.size), 0))
        .where(File.archived_at.is_(None))
        .group_by(_PREFIX_SQL)
    )
    stats = {key: {"size": 0, "count": 0} for key in _BASE_ORDER}
    for prefix, count, size in rows:
        key = _MODULE_BY_PREFIX.get(prefix)
        if key is None:
            continue  # 未知模組前綴(目前不存在)不計入
        stats[key]["size"] += int(size)
        stats[key]["count"] += int(count)

    # 有空間報修檔案時 repair 排第一(檔案大、迭代快),其餘模組在後
    order = list(_BASE_ORDER)
    if stats["repair"]["count"] > 0:
        order = ["repair", *[k for k in _BASE_ORDER if k != "repair"]]

    db_size = await file_service.database_size(db)
    files_total = sum(s["size"] for s in stats.values())
    # 容量取實際磁碟空間
    disk = shutil.disk_usage(file_service.upload_root())
    return ApiResponse(
        data=FileUsageOut(
            modules=[
                FileUsageModuleOut(
                    key=key, label=_LABELS[key], size=stats[key]["size"], count=stats[key]["count"]
                )
                for key in order
            ],
            db_size=db_size,
            total_size=files_total + db_size,
            disk_total=disk.total,
            disk_free=disk.free,
        )
    )


@router.get("")
async def list_files(
    user: FilesAdmin,
    db: DbDep,
    page: Pagination,
    module: Annotated[list[str] | None, Query()] = None,  # 可重複帶多值
    sort: str | None = None,
) -> ApiResponse[list[AdminFileOut]]:
    """大型檔案列表:模組篩選、預設依大小降冪(清理空間的主要對象)。

    module 收多值:「報修以外的全部」在畫面上是常態需求,前端自行過濾的話
    只會濾掉當頁的列,總數與分頁都會對不上。
    """
    query = sa.select(File, Club.name).outerjoin(Club, File.club_id == Club.id)
    if module:
        prefixes = []
        for key in module:
            prefix = _PREFIX_BY_MODULE.get(key)
            if prefix is None:
                raise validation_error(f"未知模組:{key}")
            prefixes.append(prefix)
        query = query.where(_PREFIX_SQL.in_(prefixes))
    query = query.order_by(*parse_sort(sort, _SORTABLE, File.size.desc()), File.id)

    total = await db.scalar(sa.select(sa.func.count()).select_from(query.subquery()))
    rows = await db.execute(query.offset(page.offset).limit(page.page_size))
    data = [
        AdminFileOut(
            id=f.id,
            original_name=f.original_name,
            module=_module_of(f),
            club_name=club_name,
            size=f.size,
            mime=f.mime,
            created_at=f.created_at,
            archived=f.archived_at is not None,
        )
        for f, club_name in rows
    ]
    return ApiResponse(data=data, meta=page.meta(total or 0))


@router.delete("/{file_id}")
async def delete_file(
    file_id: uuid.UUID,
    user: FilesAdmin,
    db: DbDep,
    request: Request,
) -> ApiResponse[None]:
    """刪除報修檔案(僅 repair 模組可刪;其餘依歸檔政策由系統管理)。記 audit。"""
    file = await db.get(File, file_id)
    if file is None:
        raise not_found("找不到檔案")
    if _module_of(file) != "repair":
        raise forbidden("僅空間報修檔案可直接刪除,其餘依歸檔政策由系統管理")

    audit.record(
        db,
        action="repair_file_deleted",
        user=user,
        detail=f"file={file.id};name={file.original_name};size={file.size}",
        ip=client_ip(request),
    )
    disk = await file_service.delete_file(db, file)
    await db.commit()
    file_service.unlink_quiet(disk)  # commit 成功後才動磁碟
    return ApiResponse()
