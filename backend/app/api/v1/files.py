import uuid

from fastapi import APIRouter, Request
from fastapi.responses import FileResponse

from app.core.deps import CurrentUser, DbDep
from app.services import files as file_service

router = APIRouter(prefix="/files", tags=["files"])


@router.get("/{file_id}")
async def download(
    file_id: uuid.UUID, user: CurrentUser, db: DbDep, request: Request
) -> FileResponse:
    # <img src> 帶 Sec-Fetch-Dest: image(Chrome 76+ / Firefox 90+ / Safari 16.4+);下載連結是
    # document、fetch 是 empty(而且 fetch 改不了這個 forbidden header)。靠這個決定 HEIC 這類
    # 瀏覽器解不了的圖要不要轉 JPEG,前端不必分兩種網址。不送這個標頭的舊 Safari 恰好原生就能顯示
    # HEIC/TIFF/BMP —— 那是巧合不是設計,記著
    as_image = request.headers.get("sec-fetch-dest") == "image"
    return await file_service.file_response(db, file_id, user, as_image=as_image)
