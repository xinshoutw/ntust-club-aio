"""行政端:場地不開放規則(Rule Page,僅 super)。

- 規則=區間(單日=同日)× 星期限定(NULL=每天)× 節次子集,附原因
- 場況圖以「不開放」呈現並蓋過其他狀態;社團申請與行政核准皆檢核
- 刪除=硬刪(異動軌跡走 audit_logs);建立不回溯撤銷既有已核准借用
"""

from typing import Annotated

import sqlalchemy as sa
from fastapi import APIRouter, Depends, Query, Request

from app.core.deps import CurrentUser, DbDep, client_ip, require_super
from app.core.errors import not_found, validation_error
from app.models import Venue, VenueBlockRule
from app.schemas.bookings import VenueBlockRuleIn, VenueBlockRuleOut
from app.schemas.common import ApiResponse
from app.services import audit

router = APIRouter(prefix="/admin/venue-rules", tags=["admin"])

SuperAdmin = Annotated[CurrentUser, Depends(require_super)]


@router.get("")
async def list_rules(
    user: SuperAdmin, db: DbDep, venue_id: int | None = Query(None)
) -> ApiResponse[list[VenueBlockRuleOut]]:
    query = (
        sa.select(VenueBlockRule, Venue.name)
        .join(Venue, VenueBlockRule.venue_id == Venue.id)
        .order_by(VenueBlockRule.end_date.desc(), VenueBlockRule.id.desc())
    )
    if venue_id is not None:
        query = query.where(VenueBlockRule.venue_id == venue_id)
    data = []
    for rule, venue_name in (await db.execute(query)).all():
        out = VenueBlockRuleOut.model_validate(rule)
        out.venue_name = venue_name
        data.append(out)
    return ApiResponse(data=data)


@router.post("", status_code=201)
async def create_rule(
    body: VenueBlockRuleIn, user: SuperAdmin, db: DbDep, request: Request
) -> ApiResponse[VenueBlockRuleOut]:
    venue = await db.get(Venue, body.venue_id)
    if venue is None or not venue.is_active:
        raise validation_error("找不到場地")
    rule = VenueBlockRule(
        venue_id=venue.id,
        start_date=body.start_date,
        end_date=body.end_date,
        weekdays=body.weekdays,
        periods=body.periods,
        reason=body.reason,
        created_by=user.id,
    )
    db.add(rule)
    audit.record(
        db,
        action="venue_rule_created",
        user=user,
        detail=f"{venue.name} {body.start_date}~{body.end_date}:{body.reason}",
        ip=client_ip(request),
    )
    await db.commit()
    out = VenueBlockRuleOut.model_validate(rule)
    out.venue_name = venue.name
    return ApiResponse(data=out)


@router.delete("/{rule_id}")
async def delete_rule(
    rule_id: int, user: SuperAdmin, db: DbDep, request: Request
) -> ApiResponse[None]:
    rule = await db.get(VenueBlockRule, rule_id)
    if rule is None:
        raise not_found("找不到規則")
    audit.record(
        db,
        action="venue_rule_deleted",
        user=user,
        detail=f"venue_rule={rule.id}({rule.start_date}~{rule.end_date} {rule.reason})",
        ip=client_ip(request),
    )
    await db.delete(rule)
    await db.commit()
    return ApiResponse()
