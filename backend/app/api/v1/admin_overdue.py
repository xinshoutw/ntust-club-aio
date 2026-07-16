"""行政端:逾期追蹤與停權管理(僅最高權限 require_super)。

- 逾期列表由 /admin/equipment-loans?status=overdue 支援(admin_bookings.py)
- 提醒:Discord(全域+社團自設 webhook)+ Email(社團聯絡人);audit
- 停權:寫 clubs.suspended_until / suspend_reason(推導的借用申請攔截點在社團端);
  解除即清空兩欄位;audit + notify
"""

from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, Request

from app.core.deps import CurrentUser, DbDep, client_ip, require_super
from app.core.errors import conflict, not_found, validation_error
from app.models import Club, Equipment, EquipmentLoan
from app.models.enums import LoanStatus
from app.schemas.admin import AdminClubOut, SuspendIn
from app.schemas.common import ApiResponse
from app.services import audit, notify
from app.services import booking_service as svc
from app.services.settings_service import get_setting
from app.services.violation_service import today_taipei

router = APIRouter(prefix="/admin", tags=["admin"])

SuperAdmin = Annotated[CurrentUser, Depends(require_super)]


def _club_out(club: Club) -> AdminClubOut:
    return AdminClubOut(
        id=club.id,
        name=club.name,
        attribute=club.attribute.value,
        is_active=club.is_active,
        suspended_until=club.suspended_until,
    )


@router.post("/equipment-loans/{loan_id}/remind")
async def remind_equipment_loan(
    loan_id: int,
    user: SuperAdmin,
    db: DbDep,
    request: Request,
    background: BackgroundTasks,
) -> ApiResponse[None]:
    """寄送歸還提醒:僅借出中的借用單(逾期與否由管理員在逾期追蹤頁判讀)。"""
    loan = await db.get(EquipmentLoan, loan_id)
    if loan is None:
        raise not_found("找不到借用申請")
    if loan.status != LoanStatus.CHECKED_OUT:
        raise conflict("此借用單不在借出中狀態")

    return_time = await get_setting(db, "equipment_return_time")
    deadline = await svc.overdue_deadline(db, loan.end_date, return_time)
    equipment = await db.get(Equipment, loan.equipment_id)
    club = await db.get(Club, loan.club_id)

    audit.record(
        db,
        action="equipment_loan_reminded",
        user=user,
        detail=f"equipment_loan={loan.id};club={club.id}",
        ip=client_ip(request),
    )
    await db.commit()

    title = "器材歸還提醒"
    desc = (
        f"{club.name}:{equipment.name} ×{loan.qty}"
        f"(借用區間 {loan.start_date}~{loan.end_date},"
        f"歸還期限 {deadline:%Y-%m-%d %H:%M}),請儘速辦理歸還點交。"
    )
    background.add_task(notify.club_event, "alert", title, desc, club.discord_webhook_url)
    for addr in (club.contact_emails or []):
        background.add_task(
            notify.send_email, addr, f"【{notify.SYSTEM_NAME}】{title}", desc, "loan_reminder"
        )
    return ApiResponse()


@router.post("/clubs/{club_id}/suspend")
async def suspend_club(
    club_id: int,
    body: SuspendIn,
    user: SuperAdmin,
    db: DbDep,
    request: Request,
    background: BackgroundTasks,
) -> ApiResponse[AdminClubOut]:
    club = await db.get(Club, club_id)
    if club is None:
        raise not_found("找不到社團")
    if body.until < today_taipei():
        raise validation_error("停權截止日不可早於今天")

    club.suspended_until = body.until
    club.suspend_reason = body.reason
    audit.record(
        db,
        action="club_suspended",
        user=user,
        detail=f"club={club.id};until={body.until};reason={body.reason[:100]}",
        ip=client_ip(request),
    )
    await db.commit()

    background.add_task(
        notify.club_event,
        "alert",
        "社團停權通知",
        f"{club.name}:即日起至 {body.until} 暫停借用申請(原因:{body.reason})",
        club.discord_webhook_url,
    )
    return ApiResponse(data=_club_out(club))


@router.delete("/clubs/{club_id}/suspend")
async def lift_club_suspension(
    club_id: int,
    user: SuperAdmin,
    db: DbDep,
    request: Request,
    background: BackgroundTasks,
) -> ApiResponse[AdminClubOut]:
    club = await db.get(Club, club_id)
    if club is None:
        raise not_found("找不到社團")
    if club.suspended_until is None:
        raise conflict("該社團未在停權狀態")

    club.suspended_until = None
    club.suspend_reason = None
    audit.record(
        db,
        action="club_suspension_lifted",
        user=user,
        detail=f"club={club.id}",
        ip=client_ip(request),
    )
    await db.commit()

    background.add_task(
        notify.club_event,
        "alert",
        "社團停權解除",
        f"{club.name}:即日起恢復借用申請",
        club.discord_webhook_url,
    )
    return ApiResponse(data=_club_out(club))
