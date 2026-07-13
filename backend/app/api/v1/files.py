import uuid

from fastapi import APIRouter
from fastapi.responses import FileResponse

from app.core.deps import CurrentUser, DbDep
from app.services import files as file_service

router = APIRouter(prefix="/files", tags=["files"])


@router.get("/{file_id}")
async def download(file_id: uuid.UUID, user: CurrentUser, db: DbDep) -> FileResponse:
    return await file_service.file_response(db, file_id, user)
