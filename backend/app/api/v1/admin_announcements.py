"""行政端:發布系統公告(2026-07-16 第八輪;權限鍵 aannounce)。

- scope:全校 / 多個性質(attrs)/ 單一社團(club_id)
- 蓋板:takeover_until 期限內社團每次登入全版顯示(顯示邏輯在前端,後端供資料)
- 通知:notify=true 時 BackgroundTasks 寄 Email(社團聯絡 Email,至多 3 組全寄)
  並推 Discord(全域 webhook + 目標社團自設 webhook,Components V2 格式)
- 刪除公告記 audit
"""

from datetime import UTC, datetime
from typing import Annotated

import sqlalchemy as sa
from fastapi import APIRouter, BackgroundTasks, Depends, Request

from app.api.pagination import Pagination
from app.core.deps import CurrentUser, DbDep, client_ip, require_permission
from app.core.errors import not_found, validation_error
from app.core.semesters import TAIPEI
from app.models import Announcement, Club
from app.models.enums import AnnouncementTarget, ClubAttribute
from app.schemas.announcements import AdminAnnouncementOut, AnnouncementCreateIn
from app.schemas.common import ApiResponse
from app.services import audit, notify

router = APIRouter(prefix="/admin/announcements", tags=["admin"])

AnnounceAdmin = Annotated[CurrentUser, Depends(require_permission("aannounce"))]


async def _target_clubs(db, body: AnnouncementCreateIn) -> list[Club]:
    query = sa.select(Club).where(Club.is_active.is_(True))
    if body.target_type == AnnouncementTarget.ATTR:
        query = query.where(Club.attribute.in_([ClubAttribute(a) for a in body.attrs]))
    elif body.target_type == AnnouncementTarget.CLUB:
        query = query.where(Club.id == body.club_id)
    return list(await db.scalars(query))


@router.get("")
async def list_announcements(
    user: AnnounceAdmin, db: DbDep, page: Pagination
) -> ApiResponse[list[AdminAnnouncementOut]]:
    query = (
        sa.select(Announcement, Club.name)
        .outerjoin(Club, Announcement.club_id == Club.id)
        .order_by(Announcement.id.desc())
    )
    total = await db.scalar(sa.select(sa.func.count()).select_from(query.subquery()))
    rows = await db.execute(query.offset(page.offset).limit(page.page_size))
    data = []
    for row, club_name in rows:
        out = AdminAnnouncementOut.model_validate(row)
        out.club_name = club_name
        data.append(out)
    return ApiResponse(data=data, meta=page.meta(total or 0))


@router.post("", status_code=201)
async def create_announcement(
    body: AnnouncementCreateIn,
    user: AnnounceAdmin,
    db: DbDep,
    request: Request,
    background: BackgroundTasks,
) -> ApiResponse[AdminAnnouncementOut]:
    if body.target_type == AnnouncementTarget.CLUB:
        club = await db.get(Club, body.club_id)
        if club is None or not club.is_active:
            raise validation_error("找不到指定的社團")

    row = Announcement(
        title=body.title,
        content=body.content,
        target_type=body.target_type,
        attrs=body.attrs or None if body.target_type == AnnouncementTarget.ATTR else None,
        club_id=body.club_id if body.target_type == AnnouncementTarget.CLUB else None,
        takeover_until=body.takeover_until if body.takeover else None,
        notify=body.notify,
        created_by=user.id,
    )
    db.add(row)

    # 通知收件者於交易內解析完成,背景任務不再碰業務 DB
    emails: list[str] = []
    webhooks: list[str] = []
    if body.notify:
        clubs = await _target_clubs(db, body)
        emails = [addr for c in clubs for addr in (c.contact_emails or [])[:3] if addr]
        webhooks = [c.discord_webhook_url for c in clubs if c.discord_webhook_url]

    audit.record(
        db,
        action="announcement_created",
        user=user,
        detail=f"target={body.target_type};takeover={bool(body.takeover_until and body.takeover)};"
        f"notify={body.notify};title={body.title[:50]}",
        ip=client_ip(request),
    )
    await db.commit()
    await db.refresh(row)

    if body.notify:
        date_str = datetime.now(UTC).astimezone(TAIPEI).strftime("%Y/%m/%d")
        background.add_task(
            notify.announcement_broadcast, row.title, row.content, date_str, emails, webhooks
        )
    return ApiResponse(data=AdminAnnouncementOut.model_validate(row))


@router.delete("/{announcement_id}")
async def delete_announcement(
    announcement_id: int, user: AnnounceAdmin, db: DbDep, request: Request
) -> ApiResponse[None]:
    row = await db.get(Announcement, announcement_id)
    if row is None:
        raise not_found("找不到公告")
    audit.record(
        db,
        action="announcement_deleted",
        user=user,
        detail=f"announcement={row.id};title={row.title[:50]}",
        ip=client_ip(request),
    )
    await db.delete(row)
    await db.commit()
    return ApiResponse()
